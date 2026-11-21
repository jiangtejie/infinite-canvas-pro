import { useCanvasUiStore } from "../stores/use-canvas-ui-store";

/** 进入沉浸：隐藏界面并请求浏览器全屏；iframe 未授权或浏览器不支持时静默降级为纯视觉 Zen。 */
export function enterCanvasZen() {
    useCanvasUiStore.getState().setZenMode(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
}

/** 退出沉浸：还原界面并退出由本页发起的全屏。 */
export function exitCanvasZen() {
    useCanvasUiStore.getState().setZenMode(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}
