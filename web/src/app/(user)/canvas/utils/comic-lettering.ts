import type { ComicLetterElement, ComicLetterKind, ComicLetterTemplate } from "../types";

export const COMIC_LETTER_TEMPLATE_OPTIONS: { value: ComicLetterTemplate; label: string }[] = [
    { value: "oval", label: "椭圆" },
    { value: "rounded", label: "圆角" },
    { value: "boxed", label: "方框" },
    { value: "cloud", label: "云朵" },
    { value: "caption", label: "旁白条" },
];

export function defaultComicLetterTemplate(kind: ComicLetterKind): ComicLetterTemplate {
    if (kind === "thought") return "cloud";
    if (kind === "caption") return "caption";
    if (kind === "sfx") return "boxed";
    return "oval";
}

export function comicLetterTemplate(element: ComicLetterElement): ComicLetterTemplate {
    return element.template || defaultComicLetterTemplate(element.kind);
}

export function comicLetterTailX(element: ComicLetterElement) {
    if (typeof element.tailX === "number") return Math.max(0, Math.min(1, element.tailX));
    return element.tail === "left" ? 0.25 : 0.75;
}

/** 按最长一行估算气泡宽度，避免手动反复调宽度。 */
export function fitComicLetterWidth(text: string, fontSize: number) {
    const longest = text.split("\n").reduce((max, line) => {
        const units = [...line].reduce((total, char) => total + (char.charCodeAt(0) < 256 ? 0.56 : 1), 0);
        return Math.max(max, units);
    }, 0);
    return Math.min(0.9, Math.max(0.15, Number((longest * fontSize + fontSize * 1.5).toFixed(3))));
}
