"use client";

import { CheckCircleOutlined, FormatPainterOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Segmented, Select, Tag } from "antd";
import { Globe, Lock } from "lucide-react";
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
        if (settings.editorMode[tab] === "json") toggleMode(tab, "visual");
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
                <div className="flex flex-col gap-4">
                    <div className="lg:hidden" data-admin-section-select>
                        <ScopeSwitch
                            activeTab={activeTab}
                            dirtyTabs={dirtyTabs}
                            onSelect={(tab) => goToSection(tab, SETTINGS_SECTIONS[tab][0].id)}
                            className="grid-cols-2"
                        />
                        <Select
                            aria-label="设置分区"
                            className="mt-3 w-full"
                            value={activeSection}
                            onChange={(id) => goToSection(activeTab, id)}
                            options={SETTINGS_SECTIONS[activeTab].map((item) => ({ label: item.label, value: item.id }))}
                        />
                    </div>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                        <aside className="sticky top-0 hidden w-[220px] shrink-0 self-start lg:block">
                            <ScopeSwitch activeTab={activeTab} dirtyTabs={dirtyTabs} onSelect={(tab) => goToSection(tab, SETTINGS_SECTIONS[tab][0].id)} />
                            <nav className="mt-4 flex flex-col gap-0.5" aria-label={`${TAB_LABELS[activeTab]}分区`}>
                                {SETTINGS_SECTIONS[activeTab].map((item) => {
                                    const active = activeSection === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => goToSection(activeTab, item.id)}
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
                            </nav>
                        </aside>
                        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-[960px]">
                            {activeTab === "public" ? <AdminSettingsPublicConfig settings={settings} /> : <AdminSettingsPrivateConfig settings={settings} />}
                        </div>
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

function ScopeSwitch({
    activeTab,
    dirtyTabs,
    onSelect,
    className,
}: {
    activeTab: SettingsTabKey;
    dirtyTabs: Record<SettingsTabKey, boolean>;
    onSelect: (tab: SettingsTabKey) => void;
    className?: string;
}) {
    return (
        <div role="group" aria-label="配置范围" className={cn("grid gap-2", className)}>
            {(["public", "private"] as const).map((tab) => {
                const active = tab === activeTab;
                const Icon = tab === "public" ? Globe : Lock;
                return (
                    <button
                        key={tab}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(tab)}
                        className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                            active ? "border-acid/30 bg-acid/10" : "border-[var(--admin-line)] bg-card/40 hover:bg-foreground/5",
                        )}
                    >
                        <span
                            className={cn(
                                "grid size-8 shrink-0 place-items-center rounded-lg border",
                                active ? "border-acid/30 bg-acid/10 text-foreground" : "border-border/60 bg-muted/40 text-muted-foreground",
                            )}
                        >
                            <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-[12px]", active ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{TAB_LABELS[tab]}</span>
                            <span className="mt-0.5 block text-[9px] tracking-[0.16em] text-muted-foreground/70">{tab === "public" ? "PUBLIC" : "PRIVATE"}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-[10px] tabular-nums text-muted-foreground">{SETTINGS_SECTIONS[tab].length}</span>
                            {dirtyTabs[tab] ? <span role="img" aria-label="有未保存的修改" title="有未保存的修改" className="size-1.5 rounded-full bg-acid" /> : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
