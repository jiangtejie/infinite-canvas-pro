import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { FilmGenerationContext } from "@/lib/film/types";
import { compressFilmReference } from "./film-image-compress";

/**
 * 按编译器选定的参考描述符顺序加载图片，回报成功引用与缺失 ID。
 * 不自行挑选来源、不在失败时回退到另一套图；角色排序与预算由 film-shot-generation 编译器负责。
 */
export async function loadFilmShotGenerationReferences(context: FilmGenerationContext): Promise<{ images: ReferenceImage[]; missingReferenceIds: string[] }> {
    const images: ReferenceImage[] = [];
    const missingReferenceIds: string[] = [];
    for (const ref of context.references) {
        try {
            const dataUrl = await imageToDataUrl({ url: ref.image.url, storageKey: ref.image.storageKey });
            if (!dataUrl) {
                missingReferenceIds.push(ref.id);
                continue;
            }
            const compressed = await compressFilmReference(dataUrl);
            images.push({ id: ref.id, name: `${ref.label}.jpg`, type: compressed.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png", dataUrl: compressed, storageKey: ref.image.storageKey });
        } catch {
            missingReferenceIds.push(ref.id);
        }
    }
    return { images, missingReferenceIds };
}