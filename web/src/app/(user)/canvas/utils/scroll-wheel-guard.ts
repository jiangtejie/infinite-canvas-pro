import type { WheelEvent } from "react";

/** 内容可滚方向时阻止冒泡，避免滚动节点时同时缩放画布；到边界后交还画布缩放。 */
export function stopCanvasZoomWheel(event: WheelEvent<HTMLElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight <= el.clientHeight + 1) return;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) event.stopPropagation();
}
