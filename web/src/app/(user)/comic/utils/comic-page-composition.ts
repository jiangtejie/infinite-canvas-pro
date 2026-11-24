import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import type { ComicImageRef, ComicPage, ComicProject } from "../types";
import { assertComicPageCompositionConfirmed, comicPageCompositionWarnings } from "./comic-image-generation";
import { comicPageCompositionSize, comicPanelRect } from "./comic-project";

type ComicPageCompositionOptions = { confirmedPanelIds?: string[]; model?: string; size?: string };

type ComicPageCompositionResult = {
    image: ComicImageRef;
    missing: number;
    compositionContext?: ComicPage["compositionContext"];
};

export function comicPageCompositionInputSignature(project: ComicProject, page: ComicPage, options: Pick<ComicPageCompositionOptions, "model" | "size"> = {}) {
    return JSON.stringify({
        format: project.format,
        model: options.model || "",
        size: options.size || "",
        warnings: comicPageCompositionWarnings(project, page, options),
        panels: page.panels.map((panel, index) => ({
            id: panel.id,
            image: panel.image ? {
                url: panel.image.url,
                storageKey: panel.image.storageKey,
                width: panel.image.width,
                height: panel.image.height,
            } : null,
            layout: comicPanelRect(page, panel, index),
        })),
    });
}

export async function composeComicPage(project: ComicProject, page: ComicPage, options: ComicPageCompositionOptions = {}): Promise<ComicPageCompositionResult> {
    const compositionWarnings = assertComicPageCompositionConfirmed(project, page, options.confirmedPanelIds || [], { model: options.model, size: options.size });
    const { width, height } = comicPageCompositionSize(project.format);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持画布合成");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    let missing = 0;
    for (const [index, panel] of page.panels.entries()) {
        if (!panel.image) {
            missing += 1;
            continue;
        }
        const rect = comicPanelRect(page, panel, index);
        const x = Math.round(rect.x * width);
        const y = Math.round(rect.y * height);
        const w = Math.round(rect.w * width);
        const h = Math.round(rect.h * height);
        try {
            const source = await imageToDataUrl(panel.image);
            const image = await loadImage(source);
            drawCover(context, image, x, y, w, h);
            const border = Math.max(2, Math.round(width / 600));
            context.strokeStyle = "#111111";
            context.lineWidth = border;
            context.strokeRect(x + border / 2, y + border / 2, Math.max(0, w - border), Math.max(0, h - border));
        } catch {
            missing += 1;
        }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("整页导出失败")), "image/png");
    });
    const uploaded = await uploadImage(blob);
    const hasWarnings = compositionWarnings.stalePanelIds.length || compositionWarnings.unrecordedPanelIds.length || compositionWarnings.incompletePanelIds.length;
    return {
        image: { url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width || width, height: uploaded.height || height },
        missing,
        compositionContext: hasWarnings ? {
            stalePanelIds: compositionWarnings.stalePanelIds,
            unrecordedPanelIds: compositionWarnings.unrecordedPanelIds,
            incompletePanelIds: compositionWarnings.incompletePanelIds,
            confirmedAt: compositionWarnings.stalePanelIds.length || compositionWarnings.unrecordedPanelIds.length ? new Date().toISOString() : undefined,
        } : undefined,
    };
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
    const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
    const targetRatio = width / Math.max(1, height);
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (sourceRatio > targetRatio) {
        sw = image.naturalHeight * targetRatio;
        sx = (image.naturalWidth - sw) / 2;
    } else {
        sh = image.naturalWidth / targetRatio;
        sy = (image.naturalHeight - sh) / 2;
    }
    context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("页格图读取失败"));
        image.src = src;
    });
}
