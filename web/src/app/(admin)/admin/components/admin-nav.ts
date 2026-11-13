import { Coins, FileText, Image as ImageIcon, LayoutDashboard, ScrollText, Settings2, Users, Wallet, Wrench } from "lucide-react";

export const adminMenus = [
    { key: "/admin", icon: LayoutDashboard, label: "概览", group: "运营" },
    { key: "/admin/users", icon: Users, label: "用户管理", group: "运营" },
    { key: "/admin/credit-logs", icon: Coins, label: "算力点日志", group: "运营" },
    { key: "/admin/ai-logs", icon: ScrollText, label: "AI 日志", group: "运营" },
    { key: "/admin/prompts", icon: FileText, label: "提示词管理", group: "内容" },
    { key: "/admin/skills", icon: Wrench, label: "Skill 管理", group: "内容" },
    { key: "/admin/recharge-packages", icon: Wallet, label: "充值套餐", group: "商业化" },
    { key: "/admin/assets", icon: ImageIcon, label: "素材库", group: "内容" },
    { key: "/admin/settings", icon: Settings2, label: "系统设置", group: "系统" },
];

export const adminGroups = Array.from(new Set(adminMenus.map((item) => item.group)));

const adminPageMeta: Record<string, { title: string; desc: string }> = {
    "/admin": { title: "概览", desc: "平台运行状态、内容规模与最近动态。" },
    "/admin/users": { title: "用户管理", desc: "管理账号、角色与算力点余额。" },
    "/admin/credit-logs": { title: "算力点日志", desc: "查看每一次充值、消耗与调整记录。" },
    "/admin/ai-logs": { title: "AI 日志", desc: "追踪模型调用、耗时与生成结果。" },
    "/admin/prompts": { title: "提示词管理", desc: "维护提示词库的分类、标签与条目。" },
    "/admin/skills": { title: "Skill 管理", desc: "配置 Agent 可调用的技能与文件。" },
    "/admin/recharge-packages": { title: "充值套餐", desc: "设置套餐价格、到账算力点与赠送规则。" },
    "/admin/assets": { title: "素材库管理", desc: "维护团队公共素材，供前台素材库读取。" },
    "/admin/settings": { title: "系统设置", desc: "配置模型渠道、系统提示词与站点能力。" },
};

export function getAdminPageMeta(pathname: string) {
    const matched = adminMenus.find((item) => pathname === item.key || (item.key !== "/admin" && pathname.startsWith(`${item.key}/`)));
    const activeKey = matched?.key ?? "";
    const menu = adminMenus.find((item) => item.key === activeKey);
    return {
        activeKey,
        group: menu?.group ?? "系统",
        meta: adminPageMeta[activeKey] ?? { title: "管理后台", desc: "运维与内容管理。" },
    };
}
