import { nanoid } from "nanoid";

import type { FilmShot, FilmShotConnection, FilmShotGroup } from "@/lib/film/types";

/** 创建自定义镜头组；自动去重空镜头 id。 */
export function createFilmShotGroup(title: string, shotIds: string[]): FilmShotGroup {
    return {
        id: nanoid(),
        title: title.trim() || "未命名镜头组",
        shotIds: [...new Set(shotIds.filter(Boolean))],
        createdAt: new Date().toISOString(),
    };
}

export function addShotToFilmGroup(groups: FilmShotGroup[], groupId: string, shotId: string) {
    let changed = false;
    const next = groups.map((group) => {
        if (group.id !== groupId || group.shotIds.includes(shotId)) return group;
        changed = true;
        return { ...group, shotIds: [...group.shotIds, shotId] };
    });
    return changed ? next : groups;
}

export function removeShotFromFilmGroup(groups: FilmShotGroup[], groupId: string, shotId: string) {
    return groups.map((group) => group.id === groupId && group.shotIds.includes(shotId)
        ? { ...group, shotIds: group.shotIds.filter((id) => id !== shotId) }
        : group);
}

export function removeFilmShotGroup(groups: FilmShotGroup[], groupId: string) {
    return groups.filter((group) => group.id !== groupId);
}

/** 创建镜头连线；同一对镜头（含反向）只保留一条，拒绝自连。 */
export function createFilmShotConnection(connections: FilmShotConnection[], fromShotId: string, toShotId: string) {
    if (!fromShotId || !toShotId || fromShotId === toShotId) return connections;
    if (connections.some((item) => (item.fromShotId === fromShotId && item.toShotId === toShotId) || (item.fromShotId === toShotId && item.toShotId === fromShotId))) return connections;
    return [...connections, { id: nanoid(), fromShotId, toShotId, createdAt: new Date().toISOString() }];
}

export function removeFilmShotConnection(connections: FilmShotConnection[], connectionId: string) {
    return connections.filter((item) => item.id !== connectionId);
}

/** 镜头被删除后清理失效的组与连线；无变化时返回原数组，避免多余的持久化写入。 */
export function pruneFilmEdges(episodesShots: FilmShot[], groups: FilmShotGroup[], connections: FilmShotConnection[]) {
    const valid = new Set(episodesShots.map((shot) => shot.id));
    const nextGroups = groups
        .map((group) => ({ ...group, shotIds: group.shotIds.filter((id) => valid.has(id)) }))
        .filter((group) => group.shotIds.length > 0);
    const nextConnections = connections.filter((item) => valid.has(item.fromShotId) && valid.has(item.toShotId));
    const groupsChanged = nextGroups.length !== groups.length || nextGroups.some((group, index) => group.shotIds.length !== groups[index].shotIds.length);
    const connectionsChanged = nextConnections.length !== connections.length;
    return {
        groups: groupsChanged ? nextGroups : groups,
        connections: connectionsChanged ? nextConnections : connections,
    };
}

/** 统计每个镜头参与的连线数量，用于镜头卡角标。 */
export function countFilmShotConnections(connections: FilmShotConnection[] | undefined) {
    const counts = new Map<string, number>();
    for (const connection of connections || []) {
        counts.set(connection.fromShotId, (counts.get(connection.fromShotId) || 0) + 1);
        counts.set(connection.toShotId, (counts.get(connection.toShotId) || 0) + 1);
    }
    return counts;
}
