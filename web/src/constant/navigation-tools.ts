import type { LucideIcon } from "lucide-react";
import { Building2, Clapperboard, FileText, GitBranch, ImagePlus, Images, Library, Maximize2, PenLine, Sparkles, Video } from "lucide-react";

export type NavigationToolSlug = "canvas" | "image" | "video" | "workflows" | "prompts" | "film" | "script" | "assets" | "asset-library" | "marketing";

export type NavigationTool = {
    slug: NavigationToolSlug;
    label: string;
    icon: LucideIcon;
};

export type NavigationGroup = {
    label?: string;
    items: NavigationTool[];
};

export type NavigationSection = NavigationTool | { label: string; icon: LucideIcon; groups: NavigationGroup[] };

// 一级导航按单一轴分：主舞台（画布）/ 创作（产出内容的工具）/ 影视（项目与剧本）/ 资产（可复用资源）。
// 四个一级：影视从创作工作台拆出，避免单个下拉堆 5 项，也让影视项目与剧本创作同域。
export const navigationSections: NavigationSection[] = [
    { slug: "canvas", label: "我的画布", icon: Maximize2 },
    {
        label: "创作工作台",
        icon: Sparkles,
        groups: [
            {
                items: [
                    { slug: "image", label: "生图工作台", icon: ImagePlus },
                    { slug: "video", label: "视频工作台", icon: Video },
                    { slug: "workflows", label: "工作流", icon: GitBranch },
                ],
            },
        ],
    },
    {
        label: "影视创作",
        icon: Clapperboard,
        groups: [
            {
                items: [
                    { slug: "film", label: "影视项目", icon: Clapperboard },
                    { slug: "script", label: "剧本创作", icon: PenLine },
                ],
            },
        ],
    },
    {
        label: "素材与提示词",
        icon: Images,
        groups: [
            {
                label: "素材",
                items: [
                    { slug: "assets", label: "我的素材", icon: Images },
                    { slug: "asset-library", label: "公共素材库", icon: Library },
                ],
            },
            {
                label: "资料与提示词",
                items: [
                    { slug: "marketing", label: "营销资料", icon: Building2 },
                    { slug: "prompts", label: "提示词库", icon: FileText },
                ],
            },
        ],
    },
];

export function navigationSectionTools(section: NavigationSection): NavigationTool[] {
    return "groups" in section ? section.groups.flatMap((group) => group.items) : [section];
}

// 首页等需要平铺入口的地方直接用这份列表；公共素材库是团队内容入口，不计入首页的创作入口宫格。
export const navigationTools: NavigationTool[] = navigationSections
    .flatMap(navigationSectionTools)
    .filter((tool) => tool.slug !== "asset-library");
