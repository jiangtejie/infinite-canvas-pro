"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Col, Flex, Form, Input, InputNumber, Row, Select, Space, Table } from "antd";

import { videoResolutionOptions } from "@/components/video-settings-panel";
import { isWorkflowProtocol } from "@/lib/model-channel";

import { addModelResolutionCost, emptySettings, modelCostCredits, removeModelCost, setModelCost } from "../settings-utils";
import type { AdminSettingsController } from "../use-admin-settings";
import { AdminSettingsSection, AdminSettingsSwitchRow } from "./settings-section";

export function AdminSettingsPublicConfig({ settings }: { settings: AdminSettingsController }) {
    const { form, channelModels, publicModelLabel, channelWorkflows, publicModels, modelCosts, setModelCosts, orderedPublicModels, publicVideoModels, publicWorkflows, channels } = settings;
    return (
        <Form form={form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
            <Flex vertical gap={12}>
                <AdminSettingsSection title="可用模型与工作流" description="先决定平台开放哪些模型和工作流，再设置默认项；公开配置会暴露给前端读取。">
                    <Row gutter={[16, 4]}>
                        <Col span={24}>
                            <Form.Item name={["public", "modelChannel", "availableModels"]} label="系统可用模型" extra="可选项来自已启用渠道中选择的模型，最终开放哪些模型由这里勾选决定">
                                <Select mode="multiple" showSearch={{ optionFilterProp: ["label", "value"] }} placeholder="请选择系统可用模型" options={channelModels.map((item) => ({ label: publicModelLabel(item), value: item }))} />
                            </Form.Item>
                            <Form.Item name={["public", "modelChannel", "availableWorkflows"]} label="系统可用工作流" extra="先在私有渠道启用工作流，再在这里勾选对用户开放的工作流">
                                <Select mode="multiple" showSearch={{ optionFilterProp: ["label", "value"] }} placeholder="请选择系统可用工作流" options={channelWorkflows} />
                            </Form.Item>
                        </Col>
                        {(["defaultModel", "defaultImageModel", "defaultVideoModel", "defaultTextModel"] as const).map((key) => (
                            <Col key={key} xs={24} md={6}>
                                <Form.Item name={["public", "modelChannel", key]} label={key === "defaultModel" ? "默认模型" : key === "defaultImageModel" ? "默认图片模型" : key === "defaultVideoModel" ? "默认视频模型" : "默认文本模型"}>
                                    <Select showSearch={{ optionFilterProp: ["label", "value"] }} allowClear options={publicModels.map((item) => ({ label: publicModelLabel(item), value: item }))} />
                                </Form.Item>
                            </Col>
                        ))}
                    </Row>
                </AdminSettingsSection>

                <AdminSettingsSection title="系统提示词" description="会自动追加在对应类型请求前，不在用户输入框中展示。">
                    <Row gutter={[16, 4]}>
                        {([
                            ["image", "生图系统提示词", "会自动追加在生图提示词前，不在输入框中展示", 4],
                            ["video", "视频系统提示词", "会自动追加在视频提示词前", 4],
                            ["text", "文本/问答系统提示词", "用于画布问答、AI 文本等文本模型调用", 4],
                            ["workflow", "工作流运行系统提示词", "用于工作流运行时补充统一创作要求", 4],
                        ] as const).map(([key, label, placeholder, rows]) => (
                            <Col key={key} xs={24} md={12}>
                                <Form.Item name={["public", "modelChannel", "systemPrompts", key]} label={label}>
                                    <Input.TextArea rows={rows} placeholder={placeholder} />
                                </Form.Item>
                            </Col>
                        ))}
                        <Col span={24}>
                            <Form.Item name={["public", "modelChannel", "systemPrompts", "workflowAgent"]} label="工作流创建 Agent 系统提示词">
                                <Input.TextArea rows={5} placeholder="控制 AI 创建工作流的输出规范和默认参数" />
                            </Form.Item>
                        </Col>
                        <Form.Item name={["public", "modelChannel", "systemPrompt"]} hidden>
                            <Input />
                        </Form.Item>
                    </Row>
                </AdminSettingsSection>

                <AdminSettingsSection title="权限开关" description="控制前端可见能力；关闭后后端也会拒绝对应请求。">
                    <Flex vertical gap={8}>
                        <AdminSettingsSwitchRow name={["public", "modelChannel", "allowCustomChannel"]} label="允许用户自定义渠道" description="开启后，前端可提供用户自定义 baseUrl 直连模式。" />
                        <AdminSettingsSwitchRow name={["public", "modelChannel", "allowUserRemoteChannel"]} label="允许普通用户使用云端渠道" description="关闭后普通用户只能使用本地直连；管理员仍可使用云端渠道。" />
                        <AdminSettingsSwitchRow name={["public", "auth", "allowRegister"]} label="允许用户注册" description="关闭后隐藏注册入口，注册接口也会拒绝新用户创建。" />
                    </Flex>
                </AdminSettingsSection>

                <AdminSettingsSection title="模型 / 工作流算力点" description="视频模型按秒计费，工作流按次计费；单价为 0 表示不扣点。">
                    <Table
                        rowKey="key"
                        pagination={false}
                        size="small"
                        dataSource={[
                            ...orderedPublicModels.map((model) => {
                                const video = publicVideoModels.has(model);
                                return {
                                    key: model,
                                    model,
                                    label: publicModelLabel(model),
                                    credits: modelCostCredits(modelCosts, model),
                                    kind: "model",
                                    children: video ? [
                                        ...modelCosts.filter((cost) => cost.model === model && cost.resolution).map((cost, index) => ({ key: `${model}:${cost.resolution}:${index}`, model, label: "", resolution: cost.resolution || "", credits: cost.credits, kind: "resolution" })),
                                        { key: `${model}:add`, model, label: "", resolution: "", credits: 0, kind: "add" },
                                    ] : undefined,
                                };
                            }),
                            ...channels.flatMap((channel) => isWorkflowProtocol(channel.protocol) ? (channel.workflows || []).filter((entry) => entry.enabled && publicWorkflows.includes(`workflow:system:${channel.id}:${entry.kind}:${entry.workflowId}`)).map((entry) => {
                                const model = `workflow:system:${channel.id}:${entry.kind}:${entry.workflowId}`;
                                return { key: model, model, label: `${channel.name} · ${entry.title || entry.workflowId}（工作流）`, credits: modelCostCredits(modelCosts, model), kind: "workflow" };
                            }) : []),
                        ]}
                        columns={[
                            {
                                title: "模型 / 工作流",
                                dataIndex: "model",
                                render: (_, item) => item.kind === "resolution" ? (
                                    <div className="flex items-center gap-2">
                                        <span>└─</span>
                                        <Select
                                            className="!w-32"
                                            placeholder="选择分辨率"
                                            value={(item as { resolution?: string }).resolution || undefined}
                                            options={videoResolutionOptions.map((option) => ({ ...option, disabled: option.value !== (item as { resolution?: string }).resolution && modelCosts.some((cost) => cost.model === item.model && cost.resolution === option.value) }))}
                                            onChange={(resolution) => setModelCost(form, setModelCosts, item.model, item.credits, resolution, (item as { resolution?: string }).resolution)}
                                        />
                                        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeModelCost(form, setModelCosts, item.model, (item as { resolution?: string }).resolution || "")} />
                                    </div>
                                ) : item.kind === "add" ? (
                                    <div className="flex items-center gap-2">
                                        <span>└─</span>
                                        <Button type="link" className="!px-0" icon={<PlusOutlined />} disabled={videoResolutionOptions.every((option) => modelCosts.some((cost) => cost.model === item.model && cost.resolution === option.value))} onClick={() => addModelResolutionCost(form, setModelCosts, item.model)}>
                                            添加分辨率
                                        </Button>
                                    </div>
                                ) : (
                                    <span title={item.label}>{item.label}</span>
                                ),
                            },
                            {
                                title: (
                                    <span className="grid leading-tight">
                                        <span>计费单价</span>
                                        <span className="text-xs font-normal text-[var(--ant-color-text-secondary)]">视频模型按秒，工作流按次</span>
                                    </span>
                                ),
                                dataIndex: "credits",
                                width: 220,
                                render: (_, item) => (
                                    item.kind === "add" ? null : (
                                        <Space.Compact className="!w-full">
                                            <InputNumber min={0} step={0.01} precision={2} className="!w-full" value={(item as { credits: number }).credits} onChange={(value) => setModelCost(form, setModelCosts, item.model, Number(value) || 0, (item as { resolution?: string }).resolution || "", (item as { resolution?: string }).resolution || "")} />
                                            <span className="flex h-8 items-center rounded-r-md border border-l-0 border-border bg-muted px-3 text-sm text-muted-foreground">
                                                点
                                            </span>
                                        </Space.Compact>
                                    )
                                ),
                            },
                        ]}
                        expandable={{
                            showExpandColumn: false,
                            expandedRowKeys: publicModels.filter((model) => publicVideoModels.has(model)),
                            indentSize: 16,
                        }}
                    />
                </AdminSettingsSection>
            </Flex>
        </Form>
    );
}
