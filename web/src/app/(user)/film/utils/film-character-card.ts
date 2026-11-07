import { nanoid } from "nanoid";

import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { FilmAsset, FilmImageRef } from "@/lib/film/types";
import { characterCardSignature, characterMasterImages, ensureCharacterProfile } from "./film-character";

const CARD_WIDTH = 1400;
const CARD_HEIGHT = 1600;
const PADDING = 20;

export type CharacterCardOptions = {
    preset?: "standard" | "threeView";
    background?: "white" | "gray";
    includeProps?: boolean;
};

/** 把全身合成图、面部特写和道具拼成一张角色卡，分镜生成时默认只引用这一张。 */
export async function composeCharacterCard(asset: FilmAsset, options: CharacterCardOptions = {}): Promise<{ card: FilmImageRef; signature: string }> {
    const preset = options.preset || "standard";
    const background = options.background || "white";
    const includeProps = options.includeProps ?? true;
    const masterImages = characterMasterImages(asset);
    if (!masterImages.length) throw new Error("先生成全身合成图，再生成角色卡");
    const profile = ensureCharacterProfile(asset);
    const face = profile.parts.face.images.slice(-1)[0];
    const details = [profile.parts.upper.images.slice(-1)[0], profile.parts.lower.images.slice(-1)[0], profile.parts.limbs.images.slice(-1)[0]].filter((image): image is FilmImageRef => Boolean(image));
    const props = includeProps ? profile.props.flatMap((prop) => prop.images).slice(0, 4) : [];

    const canvas = document.createElement("canvas");
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持 Canvas 拼图");

    ctx.fillStyle = background === "gray" ? "#f3f3f3" : "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const leftWidth = 900;
    const rightX = leftWidth + PADDING * 2;
    const rightWidth = CARD_WIDTH - rightX - PADDING;
    const [faceImage, detailImages, propImages, masterImageList] = await Promise.all([
        face ? loadImage(face) : Promise.resolve(null),
        Promise.all(details.map((ref) => loadImage(ref))),
        Promise.all(props.map((ref) => loadImage(ref))),
        Promise.all((preset === "threeView" ? masterImages.slice(-3) : [masterImages[masterImages.length - 1]]).map((ref) => loadImage(ref))),
    ]);
    const validMasters = masterImageList.filter((image): image is HTMLImageElement => Boolean(image));

    if (preset === "threeView" && validMasters.length > 1) {
        const columns = validMasters.length;
        const cellWidth = (leftWidth - PADDING) / columns;
        validMasters.forEach((image, index) => {
            drawContain(ctx, image, PADDING + index * cellWidth, PADDING, cellWidth - 6, CARD_HEIGHT - PADDING * 2);
        });
    } else if (validMasters[0]) {
        drawContain(ctx, validMasters[0], PADDING, PADDING, leftWidth - PADDING, CARD_HEIGHT - PADDING * 2);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftWidth + PADDING, PADDING);
    ctx.lineTo(leftWidth + PADDING, CARD_HEIGHT - PADDING);
    ctx.stroke();

    let cursorY = PADDING;
    if (faceImage) {
        const faceHeight = Math.round(rightWidth);
        drawContain(ctx, faceImage, rightX, cursorY, rightWidth, faceHeight);
        cursorY += faceHeight + 14;
    }
    const validDetails = detailImages.filter((image): image is HTMLImageElement => Boolean(image));
    if (validDetails.length) {
        const columns = Math.min(2, validDetails.length);
        const gap = 8;
        const cellWidth = (rightWidth - gap * (columns - 1)) / columns;
        const cellHeight = 200;
        validDetails.forEach((image, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            drawContain(ctx, image, rightX + column * (cellWidth + gap), cursorY + row * (cellHeight + gap), cellWidth, cellHeight);
        });
        cursorY += Math.ceil(validDetails.length / columns) * (cellHeight + gap);
    }
    const validProps = propImages.filter((image): image is HTMLImageElement => Boolean(image));
    if (validProps.length) {
        const columns = 2;
        const gap = 8;
        const cellWidth = (rightWidth - gap) / columns;
        const rows = Math.ceil(validProps.length / columns);
        const cellHeight = Math.min(340, Math.max(120, (CARD_HEIGHT - cursorY - PADDING - gap * (rows - 1)) / rows));
        validProps.forEach((image, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            drawContain(ctx, image, rightX + column * (cellWidth + gap), cursorY + row * (cellHeight + gap), cellWidth, cellHeight);
        });
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/jpeg", 0.9));
    if (!blob) throw new Error("角色卡导出失败");
    const uploaded = await uploadImage(blob, { localOnly: true });
    const card: FilmImageRef = { id: nanoid(), url: uploaded.url, storageKey: uploaded.storageKey, source: "generated", createdAt: new Date().toISOString() };
    return { card, signature: characterCardSignature(asset) };
}

async function loadImage(ref: FilmImageRef): Promise<HTMLImageElement | null> {
    try {
        const url = await resolveImageUrl(ref.storageKey, ref.url);
        const source = url || ref.url;
        if (!source) return null;
        const response = await fetch(source);
        if (!response.ok) return null;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
            return await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("图片加载失败"));
                image.src = objectUrl;
            });
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    } catch {
        return null;
    }
}

function drawContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}
