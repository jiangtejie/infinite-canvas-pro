"use client";

import { useCallback, useEffect, useState } from "react";

import { useUserStore } from "@/stores/use-user-store";
import type { ScriptConflict, ScriptVersion } from "../types";
import { configureScriptAccount, loadScriptVersions, useScriptStore } from "../stores/use-script-store";

const EMPTY_VERSIONS: ScriptVersion[] = [];
const EMPTY_CONFLICTS: ScriptConflict[] = [];

export function useScriptDocument(id: string) {
    const userId = useUserStore((state) => state.user?.id || "");
    const project = useScriptStore((state) => state.documents[id]);
    const versions = useScriptStore((state) => state.versions[id] ?? EMPTY_VERSIONS);
    const conflicts = useScriptStore((state) => state.conflicts[id] ?? EMPTY_CONFLICTS);
    const loadState = useScriptStore((state) => state.loadStates[id] || "idle");
    const syncState = useScriptStore((state) => state.syncStates[id] || "local");
    const [episodeId, setEpisodeId] = useState("");
    const [sceneId, setSceneId] = useState("");

    useEffect(() => {
        let canceled = false;
        setEpisodeId("");
        setSceneId("");
        useScriptStore.setState((state) => ({ loadStates: { ...state.loadStates, [id]: state.documents[id] ? "local" : "loading" } }));
        void (async () => {
            await configureScriptAccount(userId || "guest");
            if (canceled) return;
            await useScriptStore.getState().hydrateScriptIndex(userId || "guest");
            if (canceled) return;
            await useScriptStore.getState().loadScriptProject(id);
            await loadScriptVersions(id);
        })().catch(() => {
            if (canceled) return;
            useScriptStore.setState((state) => ({ loadStates: { ...state.loadStates, [id]: "error" } }));
        });
        return () => { canceled = true; };
    }, [id, userId]);

    useEffect(() => {
        if (!project) return;
        if (!project.episodes.some((episode) => episode.id === episodeId)) setEpisodeId(project.episodes[0]?.id || "");
    }, [project, episodeId]);

    const episode = project?.episodes.find((item) => item.id === episodeId) || project?.episodes[0];
    useEffect(() => {
        if (!episode) return;
        if (!episode.scenes.some((scene) => scene.id === sceneId)) setSceneId(episode.scenes[0]?.id || "");
    }, [episode, sceneId]);

    const selectEpisode = useCallback((nextId: string) => {
        setEpisodeId(nextId);
        setSceneId("");
    }, []);

    return { project, versions, conflicts, loadState, syncState, episode, episodeId: episode?.id || "", sceneId, setSceneId, selectEpisode };
}
