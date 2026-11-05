import type { ScriptDraft } from "../types";
import { filmScriptDocumentToEpisodes, parseFilmScriptDocument } from "../../film/utils/film-script-import";

/** 把锁定的剧本快照转成影视项目需要的剧集 / 场次 / 分镜。 */
export function buildFilmPlanFromDraft(draft: ScriptDraft) {
    const scriptText = draft.scenes.map((scene) => {
        const heading = [scene.interiorExterior, scene.location, scene.timeOfDay].filter(Boolean).join(" ") || `场景 ${scene.no}`;
        const body = scene.content.trim() || [scene.summary, scene.goal, scene.conflict, scene.turn, scene.outcome].filter(Boolean).join("\n");
        return `${heading}\n\n${body}`;
    }).join("\n\n");
    const document = parseFilmScriptDocument(scriptText);
    const episodes = filmScriptDocumentToEpisodes(document);
    return { scriptText, document, episodes };
}
