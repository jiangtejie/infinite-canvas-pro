import type { LucideIcon } from "lucide-react";
import { Clapperboard, FileText, GitBranch, ImagePlus, Images, Maximize2, PenLine, Sparkles, Video } from "lucide-react";

export type NavigationToolSlug = "canvas" | "image" | "video" | "workflows" | "prompts" | "film" | "script" | "assets";

export type NavigationTool = {
    slug: NavigationToolSlug;
    label: string;
    icon: LucideIcon;
};

type NavigationSection = NavigationTool | { label: string; icon: LucideIcon; children: NavigationTool[] };

// 一级导航：画布、影剧与素材直接进页面，通用创作工具收进“AI 自媒体”，影视与剧本收进“AI 影剧”。
export const navigationSections: NavigationSection[] = [
    { slug: "canvas", label: "我的画布", icon: Maximize2 },
    {
        label: "AI 自媒体",
        icon: Sparkles,
        children: [
            { slug: "image", label: "生图工作台", icon: ImagePlus },
            { slug: "video", label: "视频创作台", icon: Video },
            { slug: "workflows", label: "工作流", icon: GitBranch },
            { slug: "prompts", label: "提示词库", icon: FileText },
        ],
    },
    {
        label: "AI 影剧",
        icon: Clapperboard,
        children: [
            { slug: "film", label: "AI 影视", icon: Clapperboard },
            { slug: "script", label: "AI 剧本创作", icon: PenLine },
        ],
    },
    { slug: "assets", label: "我的素材", icon: Images },
];

// 首页等需要平铺入口的地方直接用这份列表。
export const navigationTools: NavigationTool[] = navigationSections.flatMap((section) => ("children" in section ? section.children : [section]));
