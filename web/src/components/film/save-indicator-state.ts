import type { SaveStatus, SaveSyncStatus } from "@/lib/persisted-store";

export type SaveIndicatorVisual = "idle" | "saving" | "syncing" | "saved" | "error" | "sync-error";

export type SaveIndicatorState = {
    visual: SaveIndicatorVisual;
    label: string;
    suffix: string;
    title: string;
};

const LABEL: Record<SaveIndicatorVisual, string> = {
    idle: "自动保存",
    saving: "保存中…",
    syncing: "同步中…",
    saved: "已保存",
    error: "保存失败",
    "sync-error": "同步失败",
};

export function resolveSaveIndicator(status: SaveStatus, syncStatus: SaveSyncStatus, compact = false): SaveIndicatorState {
    const visual: SaveIndicatorVisual = status === "error"
        ? "error"
        : syncStatus === "error"
            ? "sync-error"
            : status === "saving"
                ? "saving"
                : syncStatus === "syncing"
                    ? "syncing"
                    : status === "saved" || syncStatus === "synced"
                        ? "saved"
                        : "idle";
    const synced = syncStatus !== "idle";
    const suffix = !synced
        ? compact ? "· 仅存本机浏览器" : "· 仅保存在本机浏览器"
        : syncStatus === "error"
            ? "· 云端未同步"
            : syncStatus === "syncing"
                ? "· 正在同步账号"
                : "· 已同步账号";
    return {
        visual,
        label: LABEL[visual],
        suffix,
        title: synced
            ? "本机自动保存，并在登录状态下同步到账号；未登录或断网时仅保留本机。"
            : "数据仅保存在本机浏览器，换设备或清理浏览器缓存后会丢失，重要项目请用「导出」备份。",
    };
}
