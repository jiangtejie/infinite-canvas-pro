import type { ScriptConflictResolution, ScriptHeader, ScriptProjectDocument, ScriptScene } from "@/app/(user)/script/types";
import { mergeScriptDocuments, type ScriptOutbox } from "@/app/(user)/script/utils/script-merge";
import type { ScriptChangeRequest } from "@/services/api/script";

export function scriptChangeRequest(outbox: ScriptOutbox): ScriptChangeRequest {
    return {
        baseRevision: outbox.base.revision,
        baseHeaderHash: outbox.base.headerHash,
        baseScenes: outbox.base.scenes,
        document: outbox.document,
        resolutions: outbox.resolutions,
    };
}

export function scriptConflictDocument(outbox: ScriptOutbox, remote: ScriptProjectDocument) {
    return mergeScriptDocuments(outbox.base, outbox.document, remote, outbox.resolutions).document;
}

export function resolveScriptOutboxConflict(outbox: ScriptOutbox, resolution: ScriptConflictResolution): ScriptOutbox {
    const conflict = outbox.conflicts?.find((item) => item.scope === resolution.scope && item.id === resolution.id);
    if (!conflict || (resolution.scope === "header" && !conflict.remote)) throw new Error("该冲突已解决");
    const document = structuredClone(outbox.document);
    if (resolution.scope === "header") {
        const header = conflict.remote as ScriptHeader;
        Object.assign(document, {
            title: header.title, format: header.format, genre: header.genre, logline: header.logline,
            theme: header.theme, synopsis: header.synopsis, actOne: header.actOne, actTwo: header.actTwo,
            actThree: header.actThree, characters: structuredClone(header.characters),
            lockedVersionId: header.lockedVersionId, lockedVersionHash: header.lockedVersionHash,
            publications: structuredClone(header.publications),
        });
        document.episodes = document.episodes.map((episode) => {
            const selected = header.episodes.find((item) => item.id === episode.id);
            return selected ? { ...episode, no: selected.no, title: selected.title, lockedVersionId: selected.lockedVersionId, lockedVersionHash: selected.lockedVersionHash } : episode;
        });
    } else {
        const selected = conflict.remote as ScriptScene | null;
        document.episodes = document.episodes.map((episode) => ({
            ...episode,
            scenes: episode.scenes
                .filter((scene) => scene.id !== (selected?.id ?? resolution.id))
                .map((scene) => scene.id === selected?.id ? structuredClone(selected) : scene),
        }));
    }
    return {
        ...outbox,
        document,
        resolutions: [...(outbox.resolutions || []).filter((item) => !(item.scope === resolution.scope && item.id === resolution.id)), resolution],
    };
}
