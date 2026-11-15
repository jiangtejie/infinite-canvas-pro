import type { ReferenceImage } from "@/types/image";
import { imageToDataUrl } from "@/services/image-storage";
import type { ComicImageRef, ComicPage, ComicPanel, ComicProject } from "../types";

export function buildComicPanelPrompt(project: ComicProject, page: ComicPage, panel: ComicPanel) {
    const text = `${panel.description} ${panel.dialogue} ${panel.caption}`;
    const castHints = project.characters
        .filter((character) => character.name && text.includes(character.name))
        .map((character) => `${character.name}：${[character.appearance, character.wardrobe, character.personality].filter(Boolean).join("；")}`)
        .filter(Boolean);
    const sceneHints = project.locations
        .filter((location) => location.name && text.includes(location.name))
        .map((location) => `${location.name}：${[location.description, location.atmosphere].filter(Boolean).join("；")}`)
        .filter(Boolean);
    return [
        project.styleGuide ? `画风与表达：${project.styleGuide}` : "",
        `漫画页格画面：${panel.description || page.summary || "按本页梗概补全画面"}`,
        castHints.length ? `角色设定：${castHints.join("\n")}` : "",
        sceneHints.length ? `场景设定：${sceneHints.join("\n")}` : "",
        "只画画面内容，不要画对白框、旁白、拟声词或任何文字；构图要为后期贴字留出空间。",
    ].filter(Boolean).join("\n\n");
}

export async function collectComicPanelReferences(project: ComicProject, panel: ComicPanel): Promise<ReferenceImage[]> {
    const text = `${panel.description} ${panel.dialogue} ${panel.caption}`;
    const characterImages = project.characters
        .filter((character) => character.image)
        .sort((left, right) => Number(text.includes(right.name)) - Number(text.includes(left.name)))
        .slice(0, 3);
    const locationImages = project.locations
        .filter((location) => location.image)
        .sort((left, right) => Number(text.includes(right.name)) - Number(text.includes(left.name)))
        .slice(0, 2);
    const references: ReferenceImage[] = [];
    for (const item of [...characterImages, ...locationImages]) {
        const image = item.image as ComicImageRef;
        const dataUrl = await imageToDataUrl({ url: image.url, storageKey: image.storageKey }).catch(() => "");
        if (dataUrl) references.push({ id: item.id, name: `${item.name}.png`, type: "image/png", dataUrl, storageKey: image.storageKey });
    }
    return references.slice(0, 5);
}
