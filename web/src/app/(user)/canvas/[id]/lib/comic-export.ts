import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { getImageBlob, getProxyUrl, resolveImageUrl } from "@/services/image-storage";
import type { CanvasNodeData, ComicLetterElement } from "../../types";
import { comicLetterTailX, comicLetterTemplate } from "../../utils/comic-lettering";

type ComicExportPage = { blob: Blob; width: number; height: number };
type ComicExportTargetSettings = {
    title: string;
    dpi: 150 | 300;
    pagePreset: "fit" | "a4" | "b5";
    pageNumbers?: boolean;
    titlePage?: boolean;
    titlePageText?: string;
};
type ComicExportOptions = ComicExportTargetSettings & {
    lettering?: Record<string, ComicLetterElement[]>;
    onProgress?: (done: number, total: number) => void;
};

const DEFAULT_TITLE = "漫画册";

/** 读取漫画页原始图片，统一转成 PNG，保证 PDF/CBZ 兼容；贴字和页码会烘焙进图片。 */
async function loadComicPages(nodes: CanvasNodeData[], lettering?: Record<string, ComicLetterElement[]>, onProgress?: (done: number, total: number) => void, pageNumbers = false): Promise<ComicExportPage[]> {
    const pages: ComicExportPage[] = [];
    for (const [index, node] of nodes.entries()) {
        const blob = await loadComicImageBlob(node);
        pages.push(await toPngPage(blob, lettering?.[node.id] || [], pageNumbers ? index + 1 : undefined));
        onProgress?.(index + 1, nodes.length);
    }
    return pages;
}

async function preparePages(nodes: CanvasNodeData[], options: ComicExportOptions) {
    const pages = await loadComicPages(nodes, options.lettering, options.onProgress, options.pageNumbers);
    return addComicTitlePage(pages, options);
}

export async function exportComicCbz(nodes: CanvasNodeData[], options: ComicExportOptions) {
    await saveComicCbz(await preparePages(nodes, options), options);
}

export async function exportComicPdf(nodes: CanvasNodeData[], options: ComicExportOptions) {
    if (!nodes.length) throw new Error("漫画册还没有页面");
    await saveComicPdf(await preparePages(nodes, options), options);
}

export async function exportComicStrip(nodes: CanvasNodeData[], options: ComicExportOptions) {
    if (!nodes.length) throw new Error("漫画册还没有页面");
    const pages = await preparePages(nodes, options);
    const width = 1080;
    const scaled = pages.map((page) => ({ ...page, height: Math.round(page.height * (width / page.width)) }));
    const height = scaled.reduce((total, page) => total + page.height, 0);
    if (height > 16000) throw new Error("长图超过 16000px，请改用 CBZ 或 PDF 导出");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持长图导出");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    let top = 0;
    for (const page of scaled) {
        const bitmap = await createImageBitmap(page.blob);
        context.drawImage(bitmap, 0, top, width, page.height);
        bitmap.close();
        top += page.height;
    }
    const blob = await canvasToPngBlob(canvas);
    saveAs(blob, `${safeComicFileName(options.title)}-长图.png`);
}

async function loadComicImageBlob(node: CanvasNodeData) {
    const storageKey = node.metadata?.storageKey || "";
    if (storageKey.startsWith("image:")) {
        const blob = await getImageBlob(storageKey).catch(() => null);
        if (blob) return blob;
    }
    const url = await resolveImageUrl(storageKey, node.metadata?.content || "");
    if (!url) throw new Error(`第 ${node.title || node.id} 页图片为空`);
    const response = await fetch(getProxyUrl(url)).catch(() => null);
    if (!response?.ok) throw new Error(`第 ${node.title || node.id} 页图片读取失败`);
    return response.blob();
}

async function toPngPage(blob: Blob, lettering: ComicLetterElement[], pageNumber?: number): Promise<ComicExportPage> {
    const { canvas, context, width, height } = await comicPageToCanvas(blob);
    drawLettering(context, lettering, width, height);
    if (pageNumber) drawComicPageNumber(context, width, height, pageNumber);
    return { blob: await canvasToPngBlob(canvas), width, height };
}

function drawLettering(context: CanvasRenderingContext2D, elements: ComicLetterElement[], width: number, height: number) {
    for (const element of elements) {
        const text = element.text.trim();
        if (!text) continue;
        const fontSize = Math.max(8, element.fontSize * width);
        const lineHeight = fontSize * 1.35;
        const template = comicLetterTemplate(element);
        const ovalLike = template === "oval" || template === "cloud";
        const paddingX = ovalLike ? fontSize : fontSize * 0.55;
        const paddingY = ovalLike ? fontSize * 0.8 : fontSize * 0.55;
        const maxWidth = Math.max(fontSize * 2, element.width * width);
        const x = element.x * width;
        const y = element.y * height;
        context.save();
        context.textBaseline = "top";
        context.font = `${element.kind === "sfx" ? 900 : 600} ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
        const lines = wrapComicCanvasText(context, text, maxWidth - paddingX * 2);
        if (element.kind === "sfx") {
            context.textAlign = "center";
            context.lineWidth = fontSize * 0.22;
            context.strokeStyle = "#ffffff";
            context.fillStyle = "#111111";
            lines.forEach((line, index) => {
                context.strokeText(line, x + maxWidth / 2, y + index * lineHeight);
                context.fillText(line, x + maxWidth / 2, y + index * lineHeight);
            });
            context.restore();
            continue;
        }
        const boxHeight = lines.length * lineHeight + paddingY * 2;
        const filled = element.kind === "caption" || template === "caption";
        const dashed = template === "cloud";
        const tailX = x + maxWidth * comicLetterTailX(element);
        context.fillStyle = filled ? "#fff8dc" : "#ffffff";
        context.strokeStyle = "#111111";
        context.lineWidth = Math.max(1.5, fontSize * 0.07);
        if (dashed) context.setLineDash([fontSize * 0.35, fontSize * 0.25]);
        const radius = ovalLike ? Math.min(maxWidth, boxHeight) / 2 : template === "rounded" ? Math.min(18, boxHeight / 2) : 2;
        context.beginPath();
        context.roundRect(x, y, maxWidth, boxHeight, radius);
        context.fill();
        context.stroke();
        context.setLineDash([]);
        const tailed = element.kind !== "caption" && template !== "caption" && element.tail !== "none";
        if (tailed && template === "cloud") {
            const direction = element.tail === "left" ? -1 : 1;
            context.setLineDash([fontSize * 0.18, fontSize * 0.15]);
            const circles: Array<[number, number, number]> = [
                [0, fontSize * 0.45, fontSize * 0.35],
                [direction * fontSize * 0.45, fontSize * 1.05, fontSize * 0.2],
            ];
            circles.forEach(([offsetX, offsetY, circleRadius]) => {
                context.beginPath();
                context.arc(tailX + offsetX, y + boxHeight + offsetY, circleRadius, 0, Math.PI * 2);
                context.fill();
                context.stroke();
            });
            context.setLineDash([]);
        } else if (tailed) {
            const direction = element.tail === "left" ? -1 : 1;
            context.beginPath();
            context.moveTo(tailX - fontSize * 0.35, y + boxHeight - 1);
            context.lineTo(tailX + fontSize * 0.35, y + boxHeight - 1);
            context.lineTo(tailX + direction * fontSize * 0.5, y + boxHeight + fontSize * 0.9);
            context.closePath();
            context.fill();
            context.stroke();
        }
        context.fillStyle = "#111111";
        context.textAlign = element.align;
        const textX = element.align === "center" ? x + maxWidth / 2 : element.align === "right" ? x + maxWidth - paddingX : x + paddingX;
        lines.forEach((line, index) => context.fillText(line, textX, y + paddingY + index * lineHeight));
        context.restore();
    }
}

async function addComicTitlePage(pages: ComicExportPage[], options: ComicExportTargetSettings): Promise<ComicExportPage[]> {
    if (!options.titlePage) return pages;
    const first = pages[0];
    return [await createTitlePage(options.titlePageText?.trim() || options.title || DEFAULT_TITLE, first?.width || 1240, first?.height || 1754, pages.length), ...pages];
}

async function saveComicCbz(pages: ComicExportPage[], options: ComicExportTargetSettings) {
    const files = pages.map((page, index) => ({ name: options.titlePage && index === 0 ? "000-cover.png" : `${String(index + (options.titlePage ? 0 : 1)).padStart(3, "0")}.png`, data: page.blob }));
    const info = `<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo><Title>${escapeXml(options.title)}</Title><PageCount>${pages.length}</PageCount></ComicInfo>`;
    const zip = await createZip([...files, { name: "ComicInfo.xml", data: info }]);
    saveAs(zip, `${safeComicFileName(options.title)}.cbz`);
}

async function saveComicPdf(pages: ComicExportPage[], options: ComicExportTargetSettings) {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const first = pages[0];
    const pageSize = options.pagePreset === "a4"
        ? { width: 595.28, height: 841.89 }
        : options.pagePreset === "b5"
            ? { width: 498.9, height: 708.66 }
            : { width: first.width / options.dpi * 72, height: first.height / options.dpi * 72 };
    for (const page of pages) {
        const image = await pdf.embedPng(await page.blob.arrayBuffer());
        const pdfPage = pdf.addPage([pageSize.width, pageSize.height]);
        const scale = Math.min(pageSize.width / page.width, pageSize.height / page.height);
        const width = page.width * scale;
        const height = page.height * scale;
        pdfPage.drawImage(image, { x: (pageSize.width - width) / 2, y: (pageSize.height - height) / 2, width, height });
    }
    pdf.setTitle(options.title);
    const bytes = await pdf.save();
    saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${safeComicFileName(options.title)}.pdf`);
}

async function comicPageToCanvas(blob: Blob) {
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) throw new Error("图片格式无法解析，请改用 PNG/JPG");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持图片导出");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { canvas, context, width: canvas.width, height: canvas.height };
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败")), "image/png");
    });
}

function drawComicPageNumber(context: CanvasRenderingContext2D, width: number, height: number, pageNumber: number) {
    const fontSize = Math.max(10, width * 0.02);
    const text = String(pageNumber);
    context.save();
    context.font = `600 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    const textWidth = context.measureText(text).width;
    const boxWidth = textWidth + fontSize * 1.4;
    const boxHeight = fontSize * 1.6;
    const x = width / 2;
    const y = height - fontSize * 1.2;
    context.fillStyle = "rgba(255,255,255,.86)";
    context.beginPath();
    context.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, boxHeight / 2);
    context.fill();
    context.fillStyle = "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y);
    context.restore();
}

function safeComicFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "漫画册";
}

async function createTitlePage(title: string, width: number, height: number, pageCount: number): Promise<ComicExportPage> {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持扉页导出");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    const fontSize = Math.max(20, width * 0.055);
    context.fillStyle = "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    wrapComicCanvasText(context, title, width * 0.72).forEach((line, index, lines) => {
        context.fillText(line, width / 2, height / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.35);
    });
    context.fillStyle = "#666666";
    context.font = `400 ${Math.max(12, width * 0.018)}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    context.fillText(`共 ${pageCount} 页`, width / 2, height * 0.62);
    return { blob: await canvasToPngBlob(canvas), width, height };
}

function wrapComicCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const char of [...paragraph]) {
            const next = line + char;
            if (line && context.measureText(next).width > maxWidth) {
                lines.push(line);
                line = char;
            } else {
                line = next;
            }
        }
        lines.push(line);
    }
    return lines.length ? lines : [""];
}

function escapeXml(value: string) {
    return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char] || char);
}

