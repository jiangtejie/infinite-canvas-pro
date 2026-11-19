export type FilmViewPreset = { key: string; label: string; prompt: string };

export const FILM_LOCATION_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "quad", label: "四视图", prompt: "场景四视图：同一场景的正视、侧视、俯视、背视四个角度并排展示，保持结构、配色与光照一致" },
    { key: "panorama", label: "全景", prompt: "场景全景图：超宽幅全景，完整展示空间结构与远景" },
    { key: "detail", label: "细节特写", prompt: "场景细节特写：材质、陈设与关键道具的近景" },
];

export const FILM_PROP_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "angles", label: "多视图", prompt: "道具多视图：正面、侧面、背面与俯视并排展示，白色背景，保持尺寸、材质与配色一致" },
    { key: "detail", label: "材质细节", prompt: "道具材质细节特写：表面纹理、磨损、工艺与装饰的近景" },
];

export const FILM_COSTUME_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "flat", label: "正反平铺", prompt: "服装正反面平铺展示，白色背景，保持版型、配色与图案一致" },
    { key: "fabric", label: "面料细节", prompt: "服装面料与工艺细节特写：材质纹理、缝线、纽扣与装饰" },
    { key: "accessory", label: "配饰鞋履", prompt: "配套配饰与鞋履展示，白色背景，保持风格统一" },
];
