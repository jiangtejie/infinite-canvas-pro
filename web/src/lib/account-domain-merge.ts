export type DatedRecord = {
    id: string;
    updatedAt?: string;
    createdAt?: string;
};

/** id → 删除时间（毫秒）。 */
export type Tombstones = Record<string, number>;

function timestamp(record: DatedRecord) {
    return Date.parse(record.updatedAt || record.createdAt || "") || 0;
}

/** 按 id 合并账号数据；同 id 取更新时间较新的一方，本地独有或更新时标记回传。 */
export function mergeRecordsById<T extends DatedRecord>(remote: T[], local: T[]) {
    const records = new Map(remote.map((item) => [item.id, item]));
    let shouldPush = false;
    for (const item of local) {
        const previous = records.get(item.id);
        if (!previous || timestamp(item) > timestamp(previous)) {
            shouldPush = true;
            records.set(item.id, item);
        }
    }
    return {
        value: [...records.values()].sort((left, right) => timestamp(right) - timestamp(left)),
        shouldPush,
    };
}

export function parseTombstones(value: unknown): Tombstones {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter(([, deletedAt]) => typeof deletedAt === "number" && Number.isFinite(deletedAt)),
    );
}

export function mergeTombstones(remote: Tombstones, local: Tombstones) {
    const value: Tombstones = { ...remote };
    let shouldPush = false;
    for (const [id, deletedAt] of Object.entries(local)) {
        if ((value[id] || 0) < deletedAt) {
            value[id] = deletedAt;
            shouldPush = true;
        }
    }
    return { value, shouldPush };
}

/**
 * 合并带墓碑的多列表快照：删除时间晚于记录更新时间则判删；
 * 记录在删除后又被更新则复活并清掉墓碑。
 */
export function mergeListedSnapshot(
    remote: Record<string, unknown>,
    local: Record<string, unknown>,
    listKeys: readonly string[],
    remoteDeleted: Tombstones,
    localDeleted: Tombstones,
) {
    const tombstones = mergeTombstones(remoteDeleted, localDeleted);
    const deleted = tombstones.value;
    const value: Record<string, unknown> = {};
    let shouldPush = tombstones.shouldPush;

    for (const listKey of listKeys) {
        const remoteItems = Array.isArray(remote[listKey]) ? remote[listKey] as DatedRecord[] : [];
        const localItems = Array.isArray(local[listKey]) ? local[listKey] as DatedRecord[] : [];
        const merged = mergeRecordsById(remoteItems, localItems);
        if (merged.shouldPush) shouldPush = true;
        const remoteIds = new Set(remoteItems.map((item) => item.id));
        const items: DatedRecord[] = [];
        for (const item of merged.value) {
            const deletedAt = deleted[item.id] || 0;
            if (deletedAt > timestamp(item)) {
                if (remoteIds.has(item.id)) shouldPush = true;
                continue;
            }
            if (deletedAt) {
                delete deleted[item.id];
                shouldPush = true;
            }
            items.push(item);
        }
        if (items.length !== remoteItems.length) shouldPush = true;
        value[listKey] = items;
    }

    return { value, deleted, shouldPush };
}

/** 从 store 前后状态中找出被移除的记录 id。 */
export function removedRecordIds(previous: Record<string, unknown>, next: Record<string, unknown>, listKeys: readonly string[]) {
    const removed: string[] = [];
    for (const listKey of listKeys) {
        const previousItems = Array.isArray(previous[listKey]) ? previous[listKey] as Array<{ id?: string }> : [];
        const nextItems = Array.isArray(next[listKey]) ? next[listKey] as Array<{ id?: string }> : [];
        const nextIds = new Set(nextItems.map((item) => item.id).filter((id): id is string => Boolean(id)));
        for (const item of previousItems) {
            if (item.id && !nextIds.has(item.id)) removed.push(item.id);
        }
    }
    return removed;
}
