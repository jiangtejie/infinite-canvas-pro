"use client";

import { CheckCircleOutlined, FormatPainterOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Flex, Segmented, Space, Tag, Typography } from "antd";

import { cn } from "@/lib/utils";

import { AdminSettingsChannelDrawer } from "./components/settings-channel-drawer";
import { AdminSettingsJsonEditor } from "./components/settings-json-editor";
import { AdminSettingsPrivateConfig } from "./components/settings-private-config";
import { AdminSettingsPublicConfig } from "./components/settings-public-config";
import { AdminSettingsTestModelsModal } from "./components/settings-test-models-modal";
import type { EditorMode } from "./settings-utils";
import { useAdminSettings } from "./use-admin-settings";

export default function AdminSettingsPage() {
    const settings = useAdminSettings();
    const { activeTab, activeMode, jsonError, changeTab, formatJson, toggleMode, loadSettings, isLoading, saveSettings, isSaving } = settings;

    return (
        <main className="p-3 md:p-6">
            <Flex vertical gap={12}>
                <div className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-3 py-2.5 backdrop-blur-xl md:-mx-6 md:px-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                            {([{ key: "public", label: "公开配置" }, { key: "private", label: "私有配置" }] as const).map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => changeTab(item.key)}
                                    className={cn(
                                        "relative rounded px-2.5 py-1.5 text-sm transition-colors",
                                        activeTab === item.key ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {item.label}
                                    {activeTab === item.key ? <span className="absolute inset-x-1 h-0.5 rounded-full bg-acid" style={{ bottom: -3 }} /> : null}
                                </button>
                            ))}
                        </div>
                        <Typography.Text type="secondary" className="text-xs">公开配置会暴露给前端读取，私有配置只在服务端生效。</Typography.Text>
                    </div>
                    <Space wrap size={8}>
                        {activeMode === "json" ? (
                            jsonError ? (
                                <Tag color="error">{jsonError}</Tag>
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
                                { label: "可视化编辑", value: "visual" },
                                { label: "手动编辑 JSON", value: "json" },
                            ]}
                        />
                        <Button size="small" icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadSettings()}>
                            刷新
                        </Button>
                        <Button size="small" type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={() => void saveSettings()}>
                            保存设置
                        </Button>
                    </Space>
                </div>

                <div className="pt-1">
                    {activeTab === "public" ? (
                        activeMode === "visual" ? (
                            <AdminSettingsPublicConfig settings={settings} />
                        ) : (
                            <AdminSettingsJsonEditor value={settings.jsonText.public} onChange={(value) => settings.updateJson("public", value)} />
                        )
                    ) : activeMode === "visual" ? (
                        <AdminSettingsPrivateConfig settings={settings} />
                    ) : (
                        <AdminSettingsJsonEditor value={settings.jsonText.private} onChange={(value) => settings.updateJson("private", value)} />
                    )}
                </div>
                <AdminSettingsChannelDrawer settings={settings} />
                <AdminSettingsTestModelsModal settings={settings} />
            </Flex>
        </main>
    );
}
