export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

/* 画布与站点共用一套中性色：深色是碳黑，浅色是纸白；选中蓝独立于品牌 acid。 */
export const canvasThemes = {
    light: {
        canvas: {
            background: "#f3f2ed",
            dot: "rgba(68,64,60,.26)",
            line: "rgba(68,64,60,.11)",
            guideStroke: "#1c1917",
            selectionStroke: "#2f80ff",
            selectionFill: "rgba(47,128,255,.08)",
            selectionSoft: "rgba(47,128,255,.20)",
        },
        node: {
            label: "#57534e",
            fill: "#e9e7e1",
            panel: "#fbfaf7",
            stroke: "#dcd9d1",
            activeStroke: "#1c1917",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#dcd9d1",
            item: "#57534e",
            itemHover: "#e9e7e1",
            activeBg: "#e9e7e1",
            activeText: "#292524",
        },
        shadow: {
            /** 菜单等浮层投影。 */
            float: "0 12px 32px rgba(0,0,0,0.28)",
            /** 底部工具条/缩放条投影（不含顶部高光）。 */
            panel: "0 16px 40px rgba(28,25,23,.12)",
        },
    },
    dark: {
        canvas: {
            background: "#0d0d0c",
            dot: "rgba(245,245,244,.2)",
            line: "rgba(245,245,244,.08)",
            guideStroke: "#fafaf9",
            selectionStroke: "#2f80ff",
            selectionFill: "rgba(47,128,255,.12)",
            selectionSoft: "rgba(47,128,255,.24)",
        },
        node: {
            label: "#d6d3d1",
            fill: "#26261f",
            panel: "#191917",
            stroke: "#3d3d36",
            activeStroke: "#fafaf9",
            placeholder: "#a8a29e",
            text: "#f5f5f4",
            muted: "#d6d3d1",
            faint: "#78716c",
        },
        toolbar: {
            panel: "rgba(20,20,18,.96)",
            border: "#3a3a33",
            item: "#d6d3d1",
            itemHover: "#26261f",
            activeBg: "#34342c",
            activeText: "#f5f5f4",
        },
        shadow: {
            float: "0 12px 32px rgba(0,0,0,0.28)",
            panel: "0 18px 45px rgba(0,0,0,.32)",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
