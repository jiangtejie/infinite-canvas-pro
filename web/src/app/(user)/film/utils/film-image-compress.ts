const MAX_EDGE = 1024;
const MAX_DATA_URL_LENGTH = 500_000;
const JPEG_QUALITY = 0.82;

/** 参考图发送前压缩：超过 1024px 或 500KB 的 PNG 转成较小 JPEG，避免云端网关请求体过大。 */
export async function compressFilmReference(dataUrl: string): Promise<string> {
    if (!dataUrl.startsWith("data:")) return dataUrl;
    try {
        const image = await loadImage(dataUrl);
        const longest = Math.max(image.width, image.height);
        if (longest <= MAX_EDGE && dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
        const scale = Math.min(1, MAX_EDGE / longest);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return dataUrl;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
        return dataUrl;
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("参考图读取失败"));
        image.src = src;
    });
}
