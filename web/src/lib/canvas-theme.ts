export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

/* 画布与站点共用一套中性色：深色是碳黑，浅色是纸白 */
export const canvasThemes = {
    light: {
        canvas: {
            background: "#f3f2ed",
            dot: "rgba(68,64,60,.26)",
            line: "rgba(68,64,60,.11)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
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
    },
    dark: {
        canvas: {
            background: "#0d0d0c",
            dot: "rgba(245,245,244,.2)",
            line: "rgba(245,245,244,.08)",
            selectionStroke: "#fafaf9",
            selectionFill: "rgba(250,250,249,.09)",
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
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
