import localforage from "localforage";

import type { ScriptOutbox } from "./script-merge";

export function scriptOutboxKey(accountId: string, projectId: string) {
    return `infinite-canvas:script:v2:outbox:${accountId}:${projectId}`;
}

export async function readScriptOutbox(accountId: string, projectId: string): Promise<ScriptOutbox | null> {
    return await localforage.getItem<ScriptOutbox>(scriptOutboxKey(accountId, projectId)) ?? null;
}

export async function writeScriptOutbox(accountId: string, projectId: string, outbox: ScriptOutbox): Promise<void> {
    await localforage.setItem(scriptOutboxKey(accountId, projectId), outbox);
}

export async function clearScriptOutbox(accountId: string, projectId: string): Promise<void> {
    await localforage.removeItem(scriptOutboxKey(accountId, projectId));
}
