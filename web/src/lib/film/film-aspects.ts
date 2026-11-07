import type { FilmAspect } from "./types";

export const DEFAULT_FILM_ASPECT: FilmAspect = "16:9";

export const FILM_ASPECT_OPTIONS: Array<{ value: FilmAspect; label: string }> = [
    { value: "9:16", label: "9:16 竖屏" },
    { value: "16:9", label: "16:9 横屏" },
    { value: "2.39:1", label: "2.39:1 宽银幕" },
    { value: "4:3", label: "4:3 经典" },
    { value: "1:1", label: "1:1 方屏" },
];

export function normalizeFilmAspect(value?: string): FilmAspect {
    return FILM_ASPECT_OPTIONS.some((option) => option.value === value) ? (value as FilmAspect) : DEFAULT_FILM_ASPECT;
}

export function filmAspectLabel(value?: string) {
    const aspect = normalizeFilmAspect(value);
    return FILM_ASPECT_OPTIONS.find((option) => option.value === aspect)?.label || aspect;
}

/** 转成 CSS aspect-ratio 可用的值，例如 "9 / 16"。 */
export function filmAspectCssRatio(value?: string) {
    return normalizeFilmAspect(value).replace(":", " / ");
}
