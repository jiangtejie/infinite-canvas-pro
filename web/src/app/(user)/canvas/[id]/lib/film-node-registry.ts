import { createCharacterState } from "@/app/(user)/film/utils/film-character";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { createCanvasNode } from "./canvas-node-factory";
import { createFilmAsset } from "./film-asset-factory";
import { createFilmBeatNode } from "./film-beat";
import { addFilmContextEdge } from "./film-context-edges";
import type { FilmContextRole, FilmNodeType } from "./film-graph-types";
import { appendFilmShot } from "./film-shot-create";
import { moveFilmShotAcrossScenes } from "./film-shot-reorder";

type FilmCreateAction = "create-shot" | "create-character-state" | "create-beat" | "add-character-context" | "add-location-context" | "add-prop-context" | "add-style-context" | "open-director-analysis";

type FilmNodeDefinition = {
    label: string;
    description: string;
    defaultSize: { width: number; height: number };
    allowedCreateActions: readonly FilmCreateAction[];
    renderKind: FilmNodeType;
};

function filmSize(type: CanvasNodeType): FilmNodeDefinition["defaultSize"] {
    const { width, height } = NODE_DEFAULT_SIZE[type];
    return { width, height };
}

export const FILM_NODE_REGISTRY = {
    filmScript: {
        label: "剧本",
        description: "项目剧本与导演分析来源",
        defaultSize: filmSize(CanvasNodeType.FilmScript),
        allowedCreateActions: ["open-director-analysis"],
        renderKind: "filmScript",
    },
    filmScene: {
        label: "场次",
        description: "承载场次地点、时间与氛围",
        defaultSize: filmSize(CanvasNodeType.FilmScene),
        allowedCreateActions: ["create-shot", "create-beat", "add-character-context", "add-location-context", "add-prop-context", "add-style-context"],
        renderKind: "filmScene",
    },
    filmShot: {
        label: "镜头",
        description: "单镜创作、媒体生成与上下文",
        defaultSize: filmSize(CanvasNodeType.FilmShot),
        allowedCreateActions: ["create-shot", "create-beat", "add-character-context", "add-location-context", "add-prop-context", "add-style-context"],
        renderKind: "filmShot",
    },
    filmCharacter: {
        label: "角色",
        description: "角色身份与造型状态",
        defaultSize: filmSize(CanvasNodeType.FilmCharacter),
        allowedCreateActions: ["create-shot", "create-character-state", "create-beat"],
        renderKind: "filmCharacter",
    },
    filmLocation: {
        label: "场景",
        description: "拍摄场景与空间变体",
        defaultSize: filmSize(CanvasNodeType.FilmLocation),
        allowedCreateActions: ["create-shot"],
        renderKind: "filmLocation",
    },
    filmProp: {
        label: "道具",
        description: "镜头中的关键道具设定",
        defaultSize: filmSize(CanvasNodeType.FilmProp),
        allowedCreateActions: ["create-shot"],
        renderKind: "filmProp",
    },
    filmStyle: {
        label: "风格圣经",
        description: "全项目生成与 review 共用的视觉风格",
        defaultSize: filmSize(CanvasNodeType.FilmStyle),
        allowedCreateActions: ["create-shot"],
        renderKind: "filmStyle",
    },
    filmBeat: {
        label: "动作节拍",
        description: "镜头中的动作过程与节拍提示",
        defaultSize: filmSize(CanvasNodeType.FilmBeat),
        allowedCreateActions: ["create-shot"],
        renderKind: "filmBeat",
    },
} satisfies Record<FilmNodeType, FilmNodeDefinition>;

export const FILM_NODE_TYPE_BY_CANVAS_TYPE: Partial<Record<CanvasNodeType, FilmNodeType>> = {
    [CanvasNodeType.FilmScript]: "filmScript",
    [CanvasNodeType.FilmScene]: "filmScene",
    [CanvasNodeType.FilmShot]: "filmShot",
    [CanvasNodeType.FilmCharacter]: "filmCharacter",
    [CanvasNodeType.FilmLocation]: "filmLocation",
    [CanvasNodeType.FilmProp]: "filmProp",
    [CanvasNodeType.FilmStyle]: "filmStyle",
    [CanvasNodeType.FilmBeat]: "filmBeat",
};

export function isFilmNodeType(type: CanvasNodeType): type is CanvasNodeType.FilmScript | CanvasNodeType.FilmScene | CanvasNodeType.FilmShot | CanvasNodeType.FilmCharacter | CanvasNodeType.FilmLocation | CanvasNodeType.FilmProp | CanvasNodeType.FilmStyle | CanvasNodeType.FilmBeat {
    return type in FILM_NODE_TYPE_BY_CANVAS_TYPE;
}

export type FilmQuickConnectActionId =
    | "create-shot"
    | "create-beat"
    | "create-character-state"
    | "add-character-context"
    | "add-location-context"
    | "add-prop-context"
    | "add-style-context"
    | "create-script"
    | "create-scene"
    | "create-character"
    | "create-location"
    | "create-prop";

export type FilmCommandResult =
    | { nodes: CanvasNodeData[]; connections: CanvasConnection[]; nodeId: string }
    | { error: string };

export type FilmQuickConnectAction = {
    id: FilmQuickConnectActionId;
    label: string;
    description: string;
    targetType: FilmNodeType;
    create: (nodes: CanvasNodeData[], connections: CanvasConnection[]) => FilmCommandResult;
};

type CreatableContextRole = "character" | "location" | "prop";

const CONTEXT_TARGETS: Record<CreatableContextRole, CanvasNodeType> = {
    character: CanvasNodeType.FilmCharacter,
    location: CanvasNodeType.FilmLocation,
    prop: CanvasNodeType.FilmProp,
};

const CONTEXT_ROLE_TARGET_TYPES: Record<FilmContextRole, FilmNodeType> = {
    character: "filmCharacter",
    location: "filmLocation",
    prop: "filmProp",
    style: "filmStyle",
    beat: "filmBeat",
};

const CONTEXT_ACTION_ROLES: Partial<Record<FilmQuickConnectActionId, FilmContextRole>> = {
    "add-character-context": "character",
    "add-location-context": "location",
    "add-prop-context": "prop",
    "add-style-context": "style",
};

const DEFAULT_FILM_ACTIONS: FilmQuickConnectActionId[] = ["create-scene", "create-character", "create-location", "create-prop", "create-beat"];

/** 节点的上下文角色；只认专用影视节点 payload。 */
export function filmContextRole(node: CanvasNodeData): FilmContextRole | null {
    if (node.type === CanvasNodeType.FilmCharacter && node.metadata?.filmCharacter) return "character";
    if (node.type === CanvasNodeType.FilmLocation && node.metadata?.filmLocation) return "location";
    if (node.type === CanvasNodeType.FilmProp && node.metadata?.filmProp) return "prop";
    if (node.type === CanvasNodeType.FilmStyle && node.metadata?.filmStyle) return "style";
    if (node.type === CanvasNodeType.FilmBeat && node.metadata?.filmBeat) return "beat";
    return null;
}

function contextNodes(nodes: CanvasNodeData[], role: FilmContextRole): CanvasNodeData[] {
    return nodes.filter((node) => filmContextRole(node) === role);
}

function contextActionTarget(role: FilmContextRole): FilmNodeType {
    return CONTEXT_ROLE_TARGET_TYPES[role];
}

function nodeLabel(node: CanvasNodeData, role: FilmContextRole) {
    if (role === "style") return node.metadata?.filmStyle?.asset.name || node.title;
    if (role === "character") return node.metadata?.filmCharacter?.asset.name || node.title;
    if (role === "location") return node.metadata?.filmLocation?.asset.name || node.title;
    if (role === "prop") return node.metadata?.filmProp?.asset.name || node.title;
    return node.metadata?.filmBeat?.title || node.title;
}

function nodeBeside(sourceNode: CanvasNodeData, nodes: CanvasNodeData[], type: CanvasNodeType): Position {
    return {
        x: sourceNode.position.x + sourceNode.width + 320,
        y: sourceNode.position.y + 120 + nodes.filter((node) => node.type === type).length * 80,
    };
}

function freeNodePosition(nodes: CanvasNodeData[], type: CanvasNodeType): Position {
    if (!nodes.length) return { x: 0, y: 0 };
    return {
        x: Math.max(...nodes.map((node) => node.position.x + node.width)) + 240,
        y: Math.min(...nodes.map((node) => node.position.y)) + 80 + nodes.filter((node) => node.type === type).length * 120,
    };
}

function createContextNode(nodes: CanvasNodeData[], role: CreatableContextRole, position: Position): CanvasNodeData {
    const target = CONTEXT_TARGETS[role];
    const index = nodes.filter((node) => node.type === target).length + 1;
    const asset = createFilmAsset(role, index);
    if (role === "character") return createCanvasNode(CanvasNodeType.FilmCharacter, position, { filmCharacter: { asset } });
    if (role === "location") return createCanvasNode(CanvasNodeType.FilmLocation, position, { filmLocation: { asset } });
    return createCanvasNode(CanvasNodeType.FilmProp, position, { filmProp: { asset } });
}

function createStandaloneNode(type: CanvasNodeType, nodes: CanvasNodeData[]): CanvasNodeData {
    const position = freeNodePosition(nodes, type);
    if (type === CanvasNodeType.FilmScript) return createCanvasNode(type, position, { filmScript: { text: "", parseSnapshots: [] } });
    if (type === CanvasNodeType.FilmScene) {
        const index = nodes.filter((node) => node.type === CanvasNodeType.FilmScene).length + 1;
        return createCanvasNode(type, position, {
            filmScene: { episodeId: "episode-1", episodeTitle: "第 1 集", name: `场景 ${index}`, location: "", time: "", mood: "" },
        });
    }
    if (type === CanvasNodeType.FilmCharacter || type === CanvasNodeType.FilmLocation || type === CanvasNodeType.FilmProp) {
        const role = type === CanvasNodeType.FilmCharacter ? "character" : type === CanvasNodeType.FilmLocation ? "location" : "prop";
        return createContextNode(nodes, role, position);
    }
    if (type === CanvasNodeType.FilmBeat) return createFilmBeatNode(position);
    return createCanvasNode(type, position);
}

function compositionSceneId(shotId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): string | null {
    const edge = connections.find((connection) => connection.kind === "composition" && connection.toNodeId === shotId);
    return edge && nodes.some((node) => node.id === edge.fromNodeId && node.type === CanvasNodeType.FilmScene) ? edge.fromNodeId : null;
}

function canCreateShot(sourceNode: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): boolean {
    if (sourceNode.type === CanvasNodeType.FilmScene) return true;
    if (sourceNode.type === CanvasNodeType.FilmShot) return compositionSceneId(sourceNode.id, nodes, connections) !== null;
    return nodes.some((node) => node.type === CanvasNodeType.FilmScene);
}

function createShot(sourceNode: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmCommandResult {
    if (sourceNode.type === CanvasNodeType.FilmShot) {
        const sceneId = compositionSceneId(sourceNode.id, nodes, connections);
        if (!sceneId) return { error: "当前镜头没有所属场次，先建立场次归属" };
        const appended = appendFilmShot(nodes, connections, sceneId);
        if (!appended) return { error: "该场次无法创建镜头" };
        const moved = moveFilmShotAcrossScenes(appended.nodes, appended.connections, appended.shotId, sceneId, sourceNode.id, true);
        if (!moved) return { error: "无法把新镜头插入当前镜头之后" };
        return { nodes: moved.nodes, connections: moved.connections, nodeId: appended.shotId };
    }

    const sceneId = sourceNode.type === CanvasNodeType.FilmScene
        ? sourceNode.id
        : nodes.find((node) => node.type === CanvasNodeType.FilmScene)?.id;
    if (!sceneId) return { error: "当前项目没有场次节点，先创建场次" };
    const appended = appendFilmShot(nodes, connections, sceneId);
    if (!appended) return { error: "该场次无法创建镜头" };
    const role = filmContextRole(sourceNode);
    if (!role || sourceNode.type === CanvasNodeType.FilmScene) {
        return { nodes: appended.nodes, connections: appended.connections, nodeId: appended.shotId };
    }
    const linked = addFilmContextEdge(appended.nodes, appended.connections, sourceNode.id, appended.shotId, { role, source: "manual" });
    if ("error" in linked) return linked;
    return { nodes: appended.nodes, connections: linked.connections, nodeId: appended.shotId };
}

function createBeat(sourceNode: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmCommandResult {
    if (!nodes.some((node) => node.id === sourceNode.id)) return { error: "源节点已不存在" };
    const beat = createFilmBeatNode(nodeBeside(sourceNode, nodes, CanvasNodeType.FilmBeat));
    const nextNodes = [...nodes, beat];
    if (sourceNode.type !== CanvasNodeType.FilmShot) return { nodes: nextNodes, connections, nodeId: beat.id };
    const linked = addFilmContextEdge(nextNodes, connections, beat.id, sourceNode.id, { role: "beat", source: "manual" });
    if ("error" in linked) return linked;
    return { nodes: nextNodes, connections: linked.connections, nodeId: beat.id };
}

function addContext(sourceNode: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], role: FilmContextRole): FilmCommandResult {
    if (role === "style") {
        const styles = contextNodes(nodes, "style");
        if (styles.length !== 1) return { error: "项目需要且只能有一个风格圣经节点" };
        const styleNode = styles[0];
        if (sourceNode.type !== CanvasNodeType.FilmShot) return { nodes, connections, nodeId: styleNode.id };
        const linked = addFilmContextEdge(nodes, connections, styleNode.id, sourceNode.id, { role: "style", source: "manual" });
        if ("error" in linked) return linked;
        return { nodes, connections: linked.connections, nodeId: styleNode.id };
    }

    const creatable = role as CreatableContextRole;
    if (sourceNode.type === CanvasNodeType.FilmShot) {
        const linkedIds = new Set(connections
            .filter((connection) => connection.kind === "context" && connection.toNodeId === sourceNode.id && connection.data.role === role)
            .map((connection) => connection.fromNodeId));
        const existing = contextNodes(nodes, role).find((node) => !linkedIds.has(node.id));
        if (existing) {
            const linked = addFilmContextEdge(nodes, connections, existing.id, sourceNode.id, { role, source: "manual" });
            if ("error" in linked) return linked;
            return { nodes, connections: linked.connections, nodeId: existing.id };
        }
        const created = createContextNode(nodes, creatable, nodeBeside(sourceNode, nodes, CONTEXT_TARGETS[creatable]));
        const nextNodes = [...nodes, created];
        const linked = addFilmContextEdge(nextNodes, connections, created.id, sourceNode.id, { role, source: "manual" });
        if ("error" in linked) return linked;
        return { nodes: nextNodes, connections: linked.connections, nodeId: created.id };
    }

    const existing = contextNodes(nodes, role)[0];
    if (existing) return { nodes, connections, nodeId: existing.id };
    const created = createContextNode(nodes, creatable, nodeBeside(sourceNode, nodes, CONTEXT_TARGETS[creatable]));
    return { nodes: [...nodes, created], connections, nodeId: created.id };
}

function createCharacterStateAction(sourceNode: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmCommandResult {
    const current = nodes.find((node) => node.id === sourceNode.id);
    const profile = current?.metadata?.filmCharacter?.asset.character;
    if (!current || !profile) return { error: "当前角色节点缺少角色设定" };
    const state = createCharacterState((profile.states || []).length + 1);
    const nextNodes = nodes.map((node) => node.id === current.id
        ? { ...node, metadata: { ...node.metadata, filmCharacter: { asset: { ...node.metadata!.filmCharacter!.asset, character: { ...profile, states: [...(profile.states || []), state] } } } } }
        : node);
    return { nodes: nextNodes, connections, nodeId: current.id };
}

function actionLabel(id: FilmQuickConnectActionId, sourceType: FilmNodeType, existing?: CanvasNodeData, role?: FilmContextRole): Pick<FilmQuickConnectAction, "label" | "description" | "targetType"> {
    switch (id) {
        case "create-shot":
            return {
                label: sourceType === "filmShot" ? "创建后续镜头" : "新增镜头",
                description: sourceType === "filmShot" ? "在当前镜头后插入镜头，并保持全片顺序" : "创建镜头并接入场次与全片顺序",
                targetType: "filmShot",
            };
        case "create-beat":
            return {
                label: "新增动作节拍",
                description: sourceType === "filmShot" ? "创建动作节拍并连入当前镜头" : "创建动作节拍节点",
                targetType: "filmBeat",
            };
        case "create-character-state":
            return { label: "创建造型状态", description: "在角色节点内新增造型状态", targetType: "filmCharacter" };
        case "add-character-context":
        case "add-location-context":
        case "add-prop-context":
        case "add-style-context": {
            const contextRole = role || CONTEXT_ACTION_ROLES[id] || "character";
            const name = existing ? nodeLabel(existing, contextRole) : "";
            if (contextRole === "style") {
                return {
                    label: "套用风格",
                    description: sourceType === "filmShot" ? "连入项目唯一的风格圣经；缺失时提示" : "定位项目唯一的风格圣经；缺失时提示",
                    targetType: "filmStyle",
                };
            }
            const label = contextRole === "character" ? "引用角色" : contextRole === "location" ? "引用场景" : "引用道具";
            if (existing) {
                return {
                    label,
                    description: sourceType === "filmShot" ? `连入已有上下文「${name}」` : `定位已有上下文「${name}」`,
                    targetType: contextActionTarget(contextRole),
                };
            }
            return {
                label,
                description: sourceType === "filmShot" ? "新建上下文并连入当前镜头" : "新建上下文节点",
                targetType: contextActionTarget(contextRole),
            };
        }
        case "create-script":
            return { label: "新建剧本", description: "新增剧本节点", targetType: "filmScript" };
        case "create-scene":
            return { label: "新建场次", description: "新增场次节点", targetType: "filmScene" };
        case "create-character":
            return { label: "新建角色", description: "新增角色上下文节点", targetType: "filmCharacter" };
        case "create-location":
            return { label: "新建场景", description: "新增场景上下文节点", targetType: "filmLocation" };
        case "create-prop":
            return { label: "新建道具", description: "新增道具上下文节点", targetType: "filmProp" };
    }
}

function buildQuickConnectAction(id: FilmQuickConnectActionId, sourceNode: CanvasNodeData | null, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmQuickConnectAction | null {
    const sourceType = sourceNode ? FILM_NODE_TYPE_BY_CANVAS_TYPE[sourceNode.type] : null;
    if (sourceNode && !sourceType) return null;
    if (id === "create-shot" && sourceNode && !canCreateShot(sourceNode, nodes, connections)) return null;

    const role = CONTEXT_ACTION_ROLES[id];
    if (sourceNode?.type === CanvasNodeType.FilmShot && (role === "location" || role === "style")
        && connections.some((connection) => connection.kind === "context" && connection.toNodeId === sourceNode.id && connection.data.role === role)) {
        return null;
    }
    const existing = role && sourceNode
        ? contextNodes(nodes, role).find((node) => sourceNode.type !== CanvasNodeType.FilmShot
            || !connections.some((connection) => connection.kind === "context" && connection.fromNodeId === node.id && connection.toNodeId === sourceNode.id))
        : undefined;

    return {
        id,
        ...actionLabel(id, sourceType ?? "filmShot", existing, role),
        create: (nextNodes, nextConnections) => {
            switch (id) {
                case "create-shot":
                    if (!sourceNode) return { error: "缺少源节点" };
                    return createShot(sourceNode, nextNodes, nextConnections);
                case "create-beat":
                    if (!sourceNode) {
                        const beat = createStandaloneNode(CanvasNodeType.FilmBeat, nextNodes);
                        return { nodes: [...nextNodes, beat], connections: nextConnections, nodeId: beat.id };
                    }
                    return createBeat(sourceNode, nextNodes, nextConnections);
                case "create-character-state":
                    if (!sourceNode) return { error: "缺少角色节点" };
                    return createCharacterStateAction(sourceNode, nextNodes, nextConnections);
                case "add-character-context":
                case "add-location-context":
                case "add-prop-context":
                case "add-style-context":
                    if (!sourceNode || !role) return { error: "缺少上下文源节点" };
                    return addContext(sourceNode, nextNodes, nextConnections, role);
                default: {
                    const type = {
                        "create-script": CanvasNodeType.FilmScript,
                        "create-scene": CanvasNodeType.FilmScene,
                        "create-character": CanvasNodeType.FilmCharacter,
                        "create-location": CanvasNodeType.FilmLocation,
                        "create-prop": CanvasNodeType.FilmProp,
                    }[id];
                    const created = createStandaloneNode(type, nextNodes);
                    return { nodes: [...nextNodes, created], connections: nextConnections, nodeId: created.id };
                }
            }
        },
    };
}

/** 当前源节点合法的影视快速创建动作；源节点为空时给出影视项目默认创建项。 */
export function getFilmQuickConnectActions(sourceNode: CanvasNodeData | null, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmQuickConnectAction[] {
    if (!sourceNode) {
        const ids: FilmQuickConnectActionId[] = nodes.some((node) => node.type === CanvasNodeType.FilmScript)
            ? DEFAULT_FILM_ACTIONS
            : ["create-script", ...DEFAULT_FILM_ACTIONS];
        return ids.flatMap((id) => {
            const action = buildQuickConnectAction(id, null, nodes, connections);
            return action ? [action] : [];
        });
    }

    const type = FILM_NODE_TYPE_BY_CANVAS_TYPE[sourceNode.type];
    if (!type) return [];
    return FILM_NODE_REGISTRY[type].allowedCreateActions
        .filter((id) => id !== "open-director-analysis")
        .flatMap((id) => {
            const action = buildQuickConnectAction(id as FilmQuickConnectActionId, sourceNode, nodes, connections);
            return action ? [action] : [];
        });
}
