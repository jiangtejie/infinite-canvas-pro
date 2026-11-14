import type { LucideIcon } from "lucide-react";
import { Building2, Clapperboard, FileText, GitBranch, ImagePlus, Images, Library, Maximize2, PenLine, Sparkles, Video } from "lucide-react";

export type NavigationToolSlug = "canvas" | "image" | "video" | "workflows" | "prompts" | "film" | "script" | "assets" | "asset-library" | "marketing";

export type NavigationTool = {
    slug: NavigationToolSlug;
    label: string;
    icon: LucideIcon;
};

type NavigationSection = NavigationTool | { label: string; icon: LucideIcon; children: NavigationTool[] };

// 一级导航按单一轴分：主舞台（画布）/ 创作（产出内容的工具）/ 资产（可复用资源）。
// 三个一级而非五个：768px 下再增加直达项会超出头部宽度被裁掉。
export const navigationSections: NavigationSection[] = [
    { slug: "canvas", label: "我的画布", icon: Maximize2 },
    {
        label: "创作工作台",
        icon: Sparkles,
        children: [
            { slug: "image", label: "生图工作台", icon: ImagePlus },
            { slug: "video", label: "视频工作台", icon: Video },
            { slug: "film", label: "影视项目", icon: Clapperboard },
            { slug: "script", label: "剧本创作", icon: PenLine },
            { slug: "workflows", label: "工作流", icon: GitBranch },
        ],
    },
    {
        label: "素材与提示词",
        icon: Images,
        children: [
            { slug: "assets", label: "我的素材", icon: Images },
            { slug: "marketing", label: "营销资料", icon: Building2 },
            { slug: "asset-library", label: "公共素材库", icon: Library },
            { slug: "prompts", label: "提示词库", icon: FileText },
        ],
    },
];

// 首页等需要平铺入口的地方直接用这份列表；公共素材库是团队内容入口，不计入首页的创作入口宫格。
export const navigationTools: NavigationTool[] = navigationSections
    .flatMap((section) => ("children" in section ? section.children : [section]))
    .filter((tool) => tool.slug !== "asset-library");
