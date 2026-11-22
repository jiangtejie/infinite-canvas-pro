export const MIN_PREVIEW_ZOOM = 0.2;
export const MAX_PREVIEW_ZOOM = 8;

export function clampPreviewZoom(value: number) {
    return Math.max(MIN_PREVIEW_ZOOM, Math.min(MAX_PREVIEW_ZOOM, value));
}

export function stepPreviewZoom(current: number, delta: number) {
    return clampPreviewZoom(current + delta);
}

export function previewZoomPercent(fitWidth: number, naturalWidth: number, zoom: number) {
    if (!fitWidth || !naturalWidth) return 100;
    return Math.round((fitWidth * zoom / naturalWidth) * 100);
}

export function actualPreviewZoom(fitWidth: number, naturalWidth: number) {
    if (!fitWidth || !naturalWidth) return 1;
    return clampPreviewZoom(naturalWidth / fitWidth);
}
