"use client";

import { CheckCircleOutlined, FormatPainterOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Segmented, Select, Tag } from "antd";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { AdminPageHeader } from "../components/admin-page-header";
import { AdminSettingsChannelDrawer } from "./components/settings-channel-drawer";
import { AdminSettingsJsonEditor } from "./components/settings-json-editor";
import { AdminSettingsPrivateConfig } from "./components/settings-private-config";
import { AdminSettingsPublicConfig } from "./components/settings-public-config";
import { AdminSettingsTestModelsModal } from "./components/settings-test-models-modal";
import type { EditorMode, SettingsTabKey } from "./settings-utils";
import { useAdminSettings } from "./use-admin-settings";

const TAB_LABELS: Record<SettingsTabKey, string> = { public: "公开配置", private: "私有配置" };

const SETTINGS_SECTIONS: Record<SettingsTabKey, { id: string; label: string }[]> = {
    public: [
        { id: "public-models", label: "可用模型与工作流" },
        { id: "public-prompts", label: "系统提示词" },
        { id: "public-permissions", label: "权限开关" },
        { id: "public-costs", label: "模型 / 工作流算力点" },
    ],
    private: [
        { id: "private-prompt-sync", label: "提示词定时同步" },
        { id: "private-ai-logs", label: "AI 调用日志" },
        { id: "private-content", label: "内容解析" },
        { id: "private-publish", label: "抖音发布" },
        { id: "private-payment", label: "微信支付" },
        { id: "private-storage", label: "数据存储" },
        { id: "private-channels", label: "渠道配置" },
    ],
};

export default function AdminSettingsPage() {
    const settings = useAdminSettings();
    const { activeTab, activeMode, jsonError, dirtyTabs, changeTab, formatJson, toggleMode, loadSettings, isLoading, saveSettings, isSaving } = settings;
    const [activeSection, setActiveSection] = useState(SETTINGS_SECTIONS.public[0].id);
    const [pendingSection, setPendingSection] = useState<string | null>(null);
    const currentSections = SETTINGS_SECTIONS[activeTab];
    const anyDirty = dirtyTabs.public || dirtyTabs.private;

    useEffect(() => {
        if (!currentSections.some((item) => item.id === activeSection)) setActiveSection(currentSections[0].id);
    }, [activeSection, currentSections]);

    useEffect(() => {
        if (settings.isChannelDrawerOpen && activeTab === "private") setActiveSection("private-channels");
    }, [activeTab, settings.isChannelDrawerOpen]);

    useEffect(() => {
        if (!pendingSection || activeMode === "json") return;
        const id = pendingSection;
        const frame = requestAnimationFrame(() => {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            setPendingSection(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [activeMode, pendingSection]);

    useEffect(() => {
        if (activeMode === "json") return;
        const scroller = document.querySelector<HTMLElement>("[data-admin-scroll]");
        if (!scroller) return;
        const update = () => {
            const threshold = scroller.getBoundingClientRect().top + 96;
            let current = currentSections[0]?.id;
            for (const section of currentSections) {
                const element = document.getElementById(section.id);
                if (element && element.getBoundingClientRect().top <= threshold) current = section.id;
            }
            if (current) setActiveSection(current);
        };
        update();
        scroller.addEventListener("scroll", update, { passive: true });
        return () => scroller.removeEventListener("scroll", update);
    }, [activeMode, currentSections]);

    const goToSection = (tab: SettingsTabKey, id: string) => {
        if (tab !== activeTab) changeTab(tab);
        setActiveSection(id);
        setPendingSection(id);
    };

    return (
        <main className="mx-auto flex w-full max-w-[1228px] flex-col gap-5 pb-16">
            <AdminPageHeader
                actions={
                    <>
                        {activeMode === "json" ? (
                            jsonError ? (
                                <Tag color="error" title={jsonError} className="max-w-[280px] truncate">
                                    {jsonError}
                                </Tag>
                            ) : (
                                <Tag color="success" icon={<CheckCircleOutlined />}>
                                    JSON 格式正确
                                </Tag>
                            )
                        ) : null}
                        {activeMode === "json" ? (
                            <Button size="small" icon={<FormatPainterOutlined />} onClick={() => formatJson(activeTab)}>
                                格式化
                            </Button>
                        ) : null}
                        <Segmented
                            size="small"
                            value={activeMode}
                            onChange={(value) => toggleMode(activeTab, value as EditorMode)}
                            options={[
                                { label: "可视化", value: "visual" },
                                { label: "JSON", value: "json" },
                            ]}
                        />
                        <Button size="small" icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadSettings()}>
                            刷新
                        </Button>
                    </>
                }
            />
            <p className="text-[13px] leading-6 text-muted-foreground">公开配置会暴露给前端读取，私有配置只在服务端生效。</p>

            {activeMode === "visual" ? (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                    <div className="lg:hidden" data-admin-section-select>
                        <Select
                            aria-label="设置分区"
                            className="w-full"
                            value={activeSection}
                            onChange={(id) => {
                                const tab: SettingsTabKey = SETTINGS_SECTIONS.public.some((item) => item.id === id) ? "public" : "private";
                                goToSection(tab, id);
                            }}
                            options={(["public", "private"] as const).map((tab) => ({
                                label: TAB_LABELS[tab],
                                options: SETTINGS_SECTIONS[tab].map((item) => ({ label: item.label, value: item.id })),
                            }))}
                        />
                    </div>
                    <aside className="sticky top-0 hidden w-[220px] shrink-0 self-start lg:block">
                        <nav className="flex flex-col gap-5" aria-label="设置分区">
                            {(["public", "private"] as const).map((tab) => (
                                <div key={tab}>
                                    <p className="mb-2 flex items-center gap-2 px-2 text-[11px] font-medium text-muted-foreground">
                                        {TAB_LABELS[tab]}
                                        {dirtyTabs[tab] ? <span role="img" aria-label="有未保存的修改" title="有未保存的修改" className="size-1.5 rounded-full bg-acid" /> : null}
                                    </p>
                                    <div className="space-y-0.5">
                                        {SETTINGS_SECTIONS[tab].map((item) => {
                                            const active = activeTab === tab && activeSection === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => goToSection(tab, item.id)}
                                                    aria-current={active ? "location" : undefined}
                                                    className={cn(
                                                        "flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[13px] transition-colors",
                                                        active ? "bg-acid/10 font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                                    )}
                                                >
                                                    {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>
                    </aside>
                    <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-[960px]">
                        {activeTab === "public" ? <AdminSettingsPublicConfig settings={settings} /> : <AdminSettingsPrivateConfig settings={settings} />}
                    </div>
                </div>
            ) : (
                <div className="max-w-[1100px]">
                    <AdminSettingsJsonEditor value={activeTab === "public" ? settings.jsonText.public : settings.jsonText.private} onChange={(value) => settings.updateJson(activeTab, value)} />
                </div>
            )}

            <div className="fixed bottom-6 left-1/2 z-30 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--admin-line)] bg-card/95 py-1.5 pl-4 pr-1.5 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.55)] backdrop-blur">
                <div className="flex items-center gap-2 text-[12px]" aria-live="polite">
                    <span className={cn("size-1.5 shrink-0 rounded-full", anyDirty ? "bg-acid" : "bg-muted-foreground/40")} />
                    <span className={anyDirty ? "text-foreground" : "text-muted-foreground"}>{anyDirty ? "有未保存的修改" : "已保存"}</span>
                </div>
                <Button type="primary" size="small" icon={<SaveOutlined />} loading={isSaving} disabled={!anyDirty} onClick={() => void saveSettings()}>
                    保存设置
                </Button>
            </div>

            <AdminSettingsChannelDrawer settings={settings} />
            <AdminSettingsTestModelsModal settings={settings} />
        </main>
    );
}
