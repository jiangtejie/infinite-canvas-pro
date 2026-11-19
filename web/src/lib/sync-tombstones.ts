import { currentAccountId } from "@/lib/account-storage";
import { parseTombstones, removedRecordIds, type Tombstones } from "@/lib/account-domain-merge";

const TOMBSTONE_KEY_PREFIX = "infinite-canvas:sync-tombstones";

function tombstoneKey(domainKey: string) {
    return `${TOMBSTONE_KEY_PREFIX}:${domainKey}:${encodeURIComponent(currentAccountId())}`;
}

export function readTombstones(domainKey: string): Tombstones {
    if (typeof window === "undefined") return {};
    try {
        return parseTombstones(JSON.parse(window.localStorage.getItem(tombstoneKey(domainKey)) || "{}"));
    } catch {
        return {};
    }
}

export function writeTombstones(domainKey: string, deleted: Tombstones) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(tombstoneKey(domainKey), JSON.stringify(deleted));
    } catch (error) {
        console.error("[sync] 删除标记写入失败", domainKey, error);
    }
}

/** 记录 store 变更中被移除的 id，供下次推送把删除传播到其他设备。 */
export function recordRemovedRecords(domainKey: string, previous: Record<string, unknown>, next: Record<string, unknown>, listKeys: readonly string[]) {
    const removed = removedRecordIds(previous, next, listKeys);
    if (!removed.length) return;
    const now = Date.now();
    const deleted = { ...readTombstones(domainKey) };
    for (const id of removed) deleted[id] = now;
    writeTombstones(domainKey, deleted);
}
