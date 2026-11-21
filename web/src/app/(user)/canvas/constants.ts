import { CanvasNodeType } from "./types";
import type { CanvasNodeMetadata } from "./types";
import { PANORAMA_IMAGE_SIZE, PANORAMA_NODE_SIZE } from "./utils/canvas-panorama";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 420, height: 236, title: "图片" },
    [CanvasNodeType.Panorama]: { ...PANORAMA_NODE_SIZE, title: "全景图" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "文本" },
    [CanvasNodeType.Config]: { width: 440, height: 240, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "视频" },
    [CanvasNodeType.Audio]: { width: 340, height: 160, title: "音频" },
    [CanvasNodeType.Director]: { width: 360, height: 320, title: "导演台" },
    [CanvasNodeType.Group]: { width: 760, height: 480, title: "组" },
    [CanvasNodeType.Source]: { width: 520, height: 380, title: "素材源" },
    [CanvasNodeType.Publish]: { width: 520, height: 380, title: "发布" },
    [CanvasNodeType.Comic]: { width: 360, height: 320, title: "漫画册" },
    [CanvasNodeType.Script]: { width: 520, height: 380, title: "剧本" },
    [CanvasNodeType.Scene]: { width: 360, height: 240, title: "场次" },
    [CanvasNodeType.Shot]: { width: 420, height: 320, title: "镜头" },
    [CanvasNodeType.FilmAsset]: { width: 360, height: 420, title: "影视资产" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Panorama]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Panorama],
        metadata: { content: "", status: "idle", size: PANORAMA_IMAGE_SIZE, panoramaSourcePrompt: "" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Director]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Director],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.Group]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Group],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.Source]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Source],
        metadata: { sourcePlatform: "douyin", sourceStatus: "idle", sourceInput: "" },
    },
    [CanvasNodeType.Publish]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Publish],
        metadata: { status: "idle", publishStatus: "idle" },
    },
    [CanvasNodeType.Comic]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Comic],
        metadata: { status: "idle", comicBook: { pageNodeIds: [], format: "page", direction: "rtl" } },
    },
    [CanvasNodeType.Script]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Script],
        metadata: { status: "idle", filmScript: { text: "", parseSnapshots: [] } },
    },
    [CanvasNodeType.Scene]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Scene],
        metadata: {
            status: "idle",
            filmScene: { episodeId: "", episodeTitle: "", name: "", location: "", time: "", mood: "" },
        },
    },
    [CanvasNodeType.Shot]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Shot],
        metadata: {
            status: "idle",
            filmShot: {
                shotNo: "",
                shotType: "",
                cameraMovement: "",
                duration: 4,
                description: "",
                dialogue: "",
                audio: "",
                prompt: "",
            },
        },
    },
    [CanvasNodeType.FilmAsset]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.FilmAsset],
        metadata: { status: "idle" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
