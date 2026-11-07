"use client";

import { Button, Col, Drawer, Form, Input, InputNumber, Row, Select, Space, Switch } from "antd";
import dynamic from "next/dynamic";

import { ChannelModelSelectorModal } from "@/components/channel-model-selector-modal";
import type { WorkflowChannelSettings } from "@/components/workflow/workflow-channel-pane";
import { isWorkflowProtocol, modelChannelDefaultBaseUrls, modelChannelProtocolOptions } from "@/lib/model-channel";
import type { AdminModelChannel } from "@/services/api/admin";

import { emptyChannel, normalizeChannel } from "../settings-utils";
import type { AdminSettingsController } from "../use-admin-settings";

const WorkflowChannelPane = dynamic(() => import("@/components/workflow/workflow-channel-pane").then((module) => module.WorkflowChannelPane), { ssr: false });

export function AdminSettingsChannelDrawer({ settings }: { settings: AdminSettingsController }) {
    const { token, isChannelDrawerOpen, editingChannelIndex, closeChannelDrawer, saveChannel, isLoading, channelForm, channelProtocol, channelBaseUrl, channelApiKeyUrl, knownModels, modelLabel, workflowChannelDraft, setWorkflowChannelDraft, channels, setChannels, form, loginTokenDance, openChannelModelSelector, closeChannelModelSelector, confirmChannelModelSelector, fetchChannelModelList, rememberModels, isModelSelectorOpen } = settings;
    return (
        <>
                            <Drawer
                                title={editingChannelIndex === null ? "新增渠道" : "编辑渠道"}
                                open={isChannelDrawerOpen}
                                size={isWorkflowProtocol(channelProtocol) ? "75vw" : 560}
                                onClose={closeChannelDrawer}
                                extra={
                                    <Space>
                                        <Button onClick={closeChannelDrawer}>取消</Button>
                                        <Button type="primary" disabled={isLoading} onClick={() => void saveChannel()}>
                                            保存
                                        </Button>
                                    </Space>
                                }
                                destroyOnHidden
                            >
                                <Form form={channelForm} layout="vertical" requiredMark={false} initialValues={emptyChannel}>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
                                                <Input />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="protocol" label="协议">
                                                <Select
                                                    options={modelChannelProtocolOptions}
                                                    onChange={(protocol: AdminModelChannel["protocol"]) => {
                                                        channelForm.setFieldValue("baseUrl", modelChannelDefaultBaseUrls[protocol]);
                                                        setWorkflowChannelDraft((current) => ({ ...current, protocol, baseUrl: modelChannelDefaultBaseUrls[protocol] }));
                                                    }}
                                                />
                                            </Form.Item>
                                        </Col>
                                        {!isWorkflowProtocol(channelProtocol) ? <>
                                        <Col span={12}>
                                            <Form.Item name="weight" label="权重">
                                                <InputNumber min={1} step={1} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="timeout" label="请求超时（秒）" extra="用于后台代理请求、模型列表读取和渠道测试">
                                                <InputNumber min={1} step={30} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="enabled" label="启用" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Form.Item
                                                name="baseUrl"
                                                label={
                                                    <span className="relative inline-flex items-center">
                                                        接口地址
                                                        {channelProtocol === "tokendance" || channelApiKeyUrl ? (
                                                            <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap">
                                                                <Button
                                                                    type="primary"
                                                                    size="small"
                                                                    href={channelProtocol === "tokendance" ? undefined : channelApiKeyUrl}
                                                                    target={channelProtocol === "tokendance" ? undefined : "_blank"}
                                                                    onClick={channelProtocol === "tokendance" ? () => void loginTokenDance() : undefined}
                                                                >
                                                                    {channelProtocol === "tokendance" ? "登录" : "获取 API Key"}
                                                                </Button>
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                }
                                                rules={[{ required: true, message: "请输入接口地址" }]}
                                            >
                                                <Input />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Form.Item name="apiKey" label="API Key" rules={editingChannelIndex === null ? [{ required: true, message: "请输入 API Key" }] : []}>
                                                <Input.Password placeholder={editingChannelIndex === null ? "" : "留空则沿用已保存的 API Key"} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Form.Item label="渠道可用模型">
                                                <Space.Compact style={{ width: "100%" }}>
                                                    <Form.Item name="models" noStyle>
                                                        <Select mode="tags" showSearch={{ optionFilterProp: ["label", "value"] }} maxTagCount="responsive" tokenSeparators={[",", "\n"]} options={knownModels.map((model) => ({ label: modelLabel(model, { protocol: channelProtocol, baseUrl: channelBaseUrl }), value: model }))} />
                                                    </Form.Item>
                                                    <Button onClick={() => openChannelModelSelector()}>选择模型</Button>
                                                </Space.Compact>
                                            </Form.Item>
                                        </Col>
                                        </> : <Col span={24} className="mb-3">
                                            <WorkflowChannelPane
                                                key={`${editingChannelIndex ?? "new"}:${workflowChannelDraft.id}:${workflowChannelDraft.protocol}`}
                                                channel={workflowChannelDraft as WorkflowChannelSettings}
                                                workflows={workflowChannelDraft.workflows || []}
                                                token={token || ""}
                                                admin={{ index: editingChannelIndex ?? undefined, channel: workflowChannelDraft }}
                                                onChannelChange={(patch) => { channelForm.setFieldsValue(patch); setWorkflowChannelDraft((current) => ({ ...current, ...patch })); }}
                                                onBridgeDeleted={(bridgeId) => {
                                                    const nextChannels = channels.map((channel) => channel.protocol === "comfyui" && channel.bridgeId === bridgeId ? { ...channel, bridgeId: "" } : channel);
                                                    setChannels(nextChannels);
                                                    form.setFieldValue(["private", "channels"], nextChannels);
                                                    channelForm.setFieldValue("bridgeId", "");
                                                    setWorkflowChannelDraft((current) => current.bridgeId === bridgeId ? { ...current, bridgeId: "" } : current);
                                                }}
                                                onWorkflowsChange={(workflows) => { channelForm.setFieldValue("workflows", workflows); setWorkflowChannelDraft((current) => ({ ...current, workflows })); }}
                                                onBeforeTest={async () => {
                                                    const saved = editingChannelIndex === null ? undefined : channels[editingChannelIndex];
                                                    if (!saved?.id) throw new Error("请先保存渠道后再测试");
                                                    const draft = normalizeChannel({ ...workflowChannelDraft, ...channelForm.getFieldsValue(true) });
                                                    if (JSON.stringify(draft) !== JSON.stringify(normalizeChannel(saved))) throw new Error("当前配置有未保存修改，请先保存后再测试");
                                                    return saved.id;
                                                }}
                                            />
                                        </Col>}
                                        <Col span={24}>
                                            <Form.Item name="remark" label="备注">
                                                <Input.TextArea rows={3} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Form>
                            </Drawer>
                            {isModelSelectorOpen ? (
                                <ChannelModelSelectorModal
                                    channel={channelForm.getFieldsValue(true)}
                                    parameterTranslation={channelForm.getFieldValue("parameterTranslation") || ""}
                                    models={channelForm.getFieldValue("models") || []}
                                    onCancel={closeChannelModelSelector}
                                    onConfirm={confirmChannelModelSelector}
                                    onFetchModels={fetchChannelModelList}
                                    onModelsFetched={rememberModels}
                                />
                            ) : null}
        </>
    );
}
