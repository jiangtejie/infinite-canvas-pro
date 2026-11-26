/** 画布内 Modal / Drawer 统一尺寸阶梯；窄屏统一 96vw 兜底。 */
export const CANVAS_DIALOG_SIZE = {
    xs: "min(560px, 96vw)",
    sm: "min(760px, 96vw)",
    md: "min(980px, 96vw)",
    lg: "min(1280px, 96vw)",
    xl: "min(1360px, 96vw)",
} as const;
