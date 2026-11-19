export type DatedRecord = {
    id: string;
    updatedAt?: string;
    createdAt?: string;
};

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
