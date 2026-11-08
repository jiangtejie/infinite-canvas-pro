import type { FilmProject, FilmShot, FilmShotBranch } from "@/lib/film/types";

export type FilmBranchEdge = {
    id: string;
    shotId: string;
    shotNo: string;
    sceneName: string;
    episodeTitle: string;
    label: string;
    condition: string;
    targetShotId?: string;
    targetShotNo?: string;
    targetSceneName?: string;
    missing: boolean;
    selfLoop: boolean;
};

export type FilmBranchShotRef = {
    shotId: string;
    shotNo: string;
    sceneName: string;
    episodeTitle: string;
    viaBranch?: string;
};

export type FilmBranchPath = {
    id: string;
    label: string;
    shots: FilmBranchShotRef[];
    endings: number;
    truncated: boolean;
};

/** 兼容旧字段 branch 与新字段 branches；新数据优先 branches。 */
export function shotBranchList(shot: FilmShot): FilmShotBranch[] {
    if (shot.branches?.length) return shot.branches;
    return shot.branch ? [shot.branch] : [];
}

export function collectFilmBranches(project: Pick<FilmProject, "episodes">): FilmBranchEdge[] {
    const edges: FilmBranchEdge[] = [];
    for (const entry of flattenFilmShotsWithScene(project)) {
        shotBranchList(entry.shot).forEach((branch, index) => {
            const target = branch.nextShotId ? findShot(project, branch.nextShotId) : undefined;
            edges.push({
                id: entry.shot.id + "-" + index,
                shotId: entry.shot.id,
                shotNo: entry.shot.shotNo,
                sceneName: entry.sceneName,
                episodeTitle: entry.episodeTitle,
                label: branch.label || "未命名分支",
                condition: branch.condition || "",
                targetShotId: branch.nextShotId,
                targetShotNo: target?.shot.shotNo,
                targetSceneName: target?.sceneName,
                missing: !target,
                selfLoop: Boolean(branch.nextShotId && branch.nextShotId === entry.shot.id),
            });
        });
    }
    return edges;
}

export function flattenFilmShotsWithScene(project: Pick<FilmProject, "episodes">) {
    return (project.episodes || []).flatMap((episode) => episode.scenes.flatMap((scene) => scene.shots.map((shot) => ({
        shot,
        sceneName: scene.name,
        episodeTitle: episode.title,
    }))));
}

function findShot(project: Pick<FilmProject, "episodes">, shotId: string) {
    return flattenFilmShotsWithScene(project).find((entry) => entry.shot.id === shotId);
}

export function branchTargetIndex(shots: Array<{ shot: FilmShot }>, targetShotId?: string) {
    if (!targetShotId) return -1;
    return shots.findIndex((item) => item.shot.id === targetShotId);
}

/** 从第一镜出发枚举所有分支路径；每个分支选项都会产生一条新路径，遇到空目标则按线性继续。 */
export function buildFilmBranchPaths(project: Pick<FilmProject, "episodes">, maxPaths = 30, maxDepth = 400): FilmBranchPath[] {
    const flat = flattenFilmShotsWithScene(project);
    if (!flat.length) return [];
    const indexById = new Map(flat.map((item, index) => [item.shot.id, index]));
    const paths: FilmBranchPath[] = [];
    const walk = (index: number, path: FilmBranchShotRef[], viaBranch?: string) => {
        if (paths.length >= maxPaths || path.length >= maxDepth) return;
        if (index < 0 || index >= flat.length) return;
        const entry = flat[index];
        const node: FilmBranchShotRef = {
            shotId: entry.shot.id,
            shotNo: entry.shot.shotNo,
            sceneName: entry.sceneName,
            episodeTitle: entry.episodeTitle,
            viaBranch,
        };
        const nextPath = [...path, node];
        const branchOptions: Array<{ branch: FilmShotBranch; targetIndex: number }> = [];
        for (const branch of shotBranchList(entry.shot)) {
            const targetIndex = branch.nextShotId ? indexById.get(branch.nextShotId) : undefined;
            if (typeof targetIndex !== "number" || targetIndex === index) continue;
            if (nextPath.some((item) => item.shotId === flat[targetIndex].shot.id)) continue;
            branchOptions.push({ branch, targetIndex });
        }
        if (branchOptions.length) {
            for (const option of branchOptions) {
                walk(option.targetIndex, nextPath, option.branch.label || "未命名分支");
            }
            return;
        }
        if (index + 1 >= flat.length) {
            const labels = nextPath.map((item) => item.viaBranch).filter(Boolean);
            paths.push({
                id: "path-" + (paths.length + 1),
                label: labels.length ? labels.join(" → ") : "线性路径 " + (paths.length + 1),
                shots: nextPath,
                endings: 1,
                truncated: false,
            });
            return;
        }
        walk(index + 1, nextPath);
    };
    walk(0, []);
    if (!paths.length) {
        paths.push({ id: "path-1", label: "线性路径 1", shots: flat.map((entry) => ({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, sceneName: entry.sceneName, episodeTitle: entry.episodeTitle })), endings: 1, truncated: false });
    }
    return paths;
}

export type FilmBranchGraphNode = {
    shotId: string;
    shotNo: string;
    sceneName: string;
    episodeTitle: string;
    index: number;
    branchCount: number;
    unreachable: boolean;
};

export type FilmBranchGraphEdge = {
    id: string;
    fromShotId: string;
    toShotId: string;
    kind: "linear" | "branch";
    label?: string;
    condition?: string;
};

/** 生成分支图的数据：线性边 + 分支边；节点带不可达标记。 */
export function buildFilmBranchGraph(project: Pick<FilmProject, "episodes">) {
    const flat = flattenFilmShotsWithScene(project);
    const unreachable = new Set(findUnreachableShots(project).map((shot) => shot.shotId));
    const nodes: FilmBranchGraphNode[] = flat.map((entry, index) => ({
        shotId: entry.shot.id,
        shotNo: entry.shot.shotNo,
        sceneName: entry.sceneName,
        episodeTitle: entry.episodeTitle,
        index,
        branchCount: shotBranchList(entry.shot).length,
        unreachable: unreachable.has(entry.shot.id),
    }));
    const edges: FilmBranchGraphEdge[] = [];
    for (let index = 0; index < flat.length - 1; index += 1) {
        edges.push({
            id: "linear-" + flat[index].shot.id,
            fromShotId: flat[index].shot.id,
            toShotId: flat[index + 1].shot.id,
            kind: "linear",
        });
    }
    const indexById = new Map(flat.map((entry, index) => [entry.shot.id, index]));
    for (const entry of flat) {
        shotBranchList(entry.shot).forEach((branch, branchIndex) => {
            const targetIndex = branch.nextShotId ? indexById.get(branch.nextShotId) : undefined;
            if (targetIndex === undefined || targetIndex === indexById.get(entry.shot.id)) return;
            edges.push({
                id: "branch-" + entry.shot.id + "-" + branchIndex,
                fromShotId: entry.shot.id,
                toShotId: flat[targetIndex].shot.id,
                kind: "branch",
                label: branch.label || "未命名分支",
                condition: branch.condition || "",
            });
        });
    }
    return { nodes, edges };
}

/** 从第一镜沿线性顺序与所有分支目标 BFS，返回没有被任何路径经过的镜头。 */
export function findUnreachableShots(project: Pick<FilmProject, "episodes">) {
    const flat = flattenFilmShotsWithScene(project);
    if (!flat.length) return [] as FilmBranchShotRef[];
    const indexById = new Map(flat.map((item, index) => [item.shot.id, index]));
    const reached = new Set<number>();
    const queue = [0];
    while (queue.length) {
        const index = queue.shift() as number;
        if (reached.has(index) || index < 0 || index >= flat.length) continue;
        reached.add(index);
        const targets = shotBranchList(flat[index].shot)
            .map((branch) => branch.nextShotId ? indexById.get(branch.nextShotId) : undefined)
            .filter((target): target is number => target !== undefined && target !== index);
        if (targets.length) {
            queue.push(...targets);
        } else if (index + 1 < flat.length) {
            queue.push(index + 1);
        }
    }
    return flat.filter((_, index) => !reached.has(index)).map((entry) => ({
        shotId: entry.shot.id,
        shotNo: entry.shot.shotNo,
        sceneName: entry.sceneName,
        episodeTitle: entry.episodeTitle,
    }));
}
