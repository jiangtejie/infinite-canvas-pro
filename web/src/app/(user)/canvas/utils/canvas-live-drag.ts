type LivePosition = { x: number; y: number };
type LiveConnection = { pathD: string; startX: number; startY: number; endX: number; endY: number };

const nodeElements = new Map<string, HTMLElement>();
const connectionElements = new Map<string, SVGGElement>();
const livePositions = new Map<string, LivePosition>();
const liveSizes = new Map<string, { width: number; height: number }>();

export function registerCanvasNodeElement(id: string, element: HTMLElement | null) {
    if (element) nodeElements.set(id, element);
    else nodeElements.delete(id);
}

export function registerCanvasConnectionElement(id: string, element: SVGGElement | null) {
    if (element) connectionElements.set(id, element);
    else connectionElements.delete(id);
}

/** 拖拽期间的实时位置：节点 render 也读它，中途重渲染不会把节点弹回原位。 */
export function liveDragPosition(id: string) {
    return livePositions.get(id);
}

/** 直接改 DOM：节点写 transform、相关连线重算 d 与端点标记，全程不触发 React 渲染。 */
export function applyLiveDrag(positions: Map<string, LivePosition>, connections: Map<string, LiveConnection>) {
    positions.forEach((point, id) => {
        livePositions.set(id, point);
        const element = nodeElements.get(id);
        if (element) element.style.transform = `translate(${point.x}px, ${point.y}px)`;
    });
    connections.forEach((geometry, id) => {
        const group = connectionElements.get(id);
        if (!group) return;
        group.querySelectorAll("path").forEach((path) => path.setAttribute("d", geometry.pathD));
        group.querySelectorAll<SVGElement>("[data-anchor]").forEach((element) => {
            const anchor = element.getAttribute("data-anchor");
            if (anchor === "start") {
                element.setAttribute("cx", String(geometry.startX));
                element.setAttribute("cy", String(geometry.startY));
            } else if (anchor === "end") {
                element.setAttribute("cx", String(geometry.endX));
                element.setAttribute("cy", String(geometry.endY));
            } else {
                element.setAttribute("x", String((geometry.startX + geometry.endX) / 2));
                element.setAttribute("y", String((geometry.startY + geometry.endY) / 2 - 8));
            }
        });
    });
}

export function liveNodeSize(id: string) {
    return liveSizes.get(id);
}

/** 拉伸同样直写：位置 + 宽高一起改，松手才提交。 */
export function applyLiveResize(id: string, box: { x: number; y: number; width: number; height: number }) {
    livePositions.set(id, { x: box.x, y: box.y });
    liveSizes.set(id, { width: box.width, height: box.height });
    const element = nodeElements.get(id);
    if (!element) return;
    element.style.transform = `translate(${box.x}px, ${box.y}px)`;
    element.style.width = `${box.width}px`;
    element.style.height = `${box.height}px`;
}

export function clearLiveResize(id: string) {
    livePositions.delete(id);
    liveSizes.delete(id);
}

/** 提交前清空：之后由 React 用节点数据重写 transform 与 d。 */
export function clearLiveDrag() {
    livePositions.clear();
}
