import { nanoid } from "nanoid";

import { scriptTextHash } from "@/lib/film/film-script-import";
import { CanvasNodeType, type CanvasNodeData, type FilmAnalysisOptions, type FilmAnalysisSession, type FilmAnalysisSessionDraft } from "../../types";
import type { FilmDirectorAnalysisProposal } from "./film-director-analysis";
import { patchFilmScriptNode } from "./film-node-patch";

export type FilmScriptAction = "edit" | "analyze" | "cancel" | "open" | "undo" | "refresh" | "transfer";

const INTERRUPTED_MESSAGE = "页面刷新导致分析中断，可重新分析";

function stamp(session: FilmAnalysisSession, patch: Partial<FilmAnalysisSession>): FilmAnalysisSession {
    return { ...session, ...patch, updatedAt: new Date().toISOString() };
}

export function createFilmAnalysisSession(sourceHash: string, options: FilmAnalysisOptions = {}): FilmAnalysisSession {
    const now = new Date().toISOString();
    return { id: nanoid(), status: "running", sourceHash, options, createdAt: now, updatedAt: now };
}

export function patchFilmAnalysisSession(session: FilmAnalysisSession, patch: Partial<FilmAnalysisSession>): FilmAnalysisSession {
    return stamp(session, patch);
}

export function failFilmAnalysisSession(session: FilmAnalysisSession, error: string): FilmAnalysisSession {
    return stamp(session, { status: "failed", error, progress: undefined });
}

export function cancelFilmAnalysisSession(session: FilmAnalysisSession, draft?: FilmAnalysisSessionDraft): FilmAnalysisSession {
    return stamp(session, { status: "cancelled", draft: draft ?? session.draft, progress: undefined, error: "分析已中止" });
}

export function applyFilmAnalysisSession(session: FilmAnalysisSession, summary: NonNullable<FilmAnalysisSession["summary"]>): FilmAnalysisSession {
    return stamp(session, { status: "applied", summary, draft: undefined, progress: undefined, sceneErrors: undefined, warnings: undefined, error: undefined });
}

/** AI 请求不跨刷新续跑：恢复时把 running 收敛为可继续确认或重新分析。 */
export function recoverFilmAnalysisSession(session: FilmAnalysisSession): FilmAnalysisSession {
    if (session.status !== "running") return session;
    return stamp(session, { status: session.draft ? "ready" : "cancelled", progress: undefined, error: session.draft ? undefined : INTERRUPTED_MESSAGE });
}

export function recoverFilmAnalysisNodes(nodes: CanvasNodeData[]): CanvasNodeData[] {
    let changed = false;
    const next = nodes.map((node) => {
        if (node.type !== CanvasNodeType.FilmScript) return node;
        const session = node.metadata?.filmScript?.analysis;
        if (!session || session.status !== "running") return node;
        changed = true;
        return patchFilmScriptNode(node, { analysis: recoverFilmAnalysisSession(session) });
    });
    return changed ? next : nodes;
}

export function isFilmAnalysisExpired(session: FilmAnalysisSession | undefined, text: string): boolean {
    return Boolean(session?.draft && session.sourceHash !== scriptTextHash(text || ""));
}

/** 会话只保存 AI 原始结果，资产与既有画布的匹配在打开提案时重新计算。 */
export function filmAnalysisDraftFromProposal(proposal: FilmDirectorAnalysisProposal): FilmAnalysisSessionDraft {
    return {
        episodes: proposal.episodes,
        suggestions: proposal.assets.items.map(({ key, kind, name, aliases, description, visualPrompt }) => ({ key, kind, name, aliases, description, visualPrompt })),
        ...(proposal.structurePlan ? { structurePlan: proposal.structurePlan } : {}),
    };
}
