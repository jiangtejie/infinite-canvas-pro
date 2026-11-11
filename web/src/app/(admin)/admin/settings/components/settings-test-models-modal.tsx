"use client";

import { LoadingOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Image, Input, Modal, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";

import type { AdminSettingsController } from "../use-admin-settings";
import { modelTestSummary, parseModelTestResult } from "./settings-model-test-result";

type TestResult = { status: "success" | "error"; duration?: string; message: string };

export function AdminSettingsTestModelsModal({ settings }: { settings: AdminSettingsController }) {
    const { testChannelIndex, testChannel, testModels, testKeyword, setTestKeyword, selectedTestModels, setSelectedTestModels, testingModels, testResults, closeTestDialog, batchTestModels, testModelOnline, modelLabel } = settings;
    const [viewing, setViewing] = useState<{ model: string; result: TestResult } | null>(null);
    return (
        <>
            <Modal
                title={
                    <Space>
                        {testChannel?.name || "渠道"} 渠道的模型测试<Typography.Text type="secondary">共 {testChannel?.models.length || 0} 个模型</Typography.Text>
                    </Space>
                }
                open={testChannelIndex !== null}
                width={920}
                onCancel={closeTestDialog}
                footer={
                    <Space>
                        <Button onClick={closeTestDialog}>取消</Button>
                        <Button type="primary" disabled={!selectedTestModels.length || testingModels.length > 0} onClick={() => void batchTestModels()}>
                            批量测试 {selectedTestModels.length} 个模型
                        </Button>
                    </Space>
                }
                destroyOnHidden
            >
                <Flex vertical gap={12}>
                    <Typography.Text type="secondary">测试只发送最小文本请求，用于确认渠道/密钥是否有响应；不代表图片生成、参考图编辑等能力可用，图片模型请到画布实际验证。</Typography.Text>
                    {testChannel?.protocol === "openai" && testChannel.models.some((model) => /gemini|nano-banana/i.test(model)) ? (
                        <Alert
                            type="warning"
                            showIcon
                            title="当前是 OpenAI 协议渠道，但模型列表里有 Gemini 原生图片模型。"
                            description="gemini-3.1-flash-image / gemini-nano-banana 等模型使用 Gemini 原生 /v1beta/models/{model}:generateContent，不支持 OpenAI 的 /v1/images/edits。请单独新建 Gemini 协议渠道，Base URL 填 https://api.teamorouter.ai（不要带 /v1），并把 Gemini 模型从 OpenAI 渠道的模型列表里移除。"
                        />
                    ) : null}
                    <Input.Search placeholder="搜索模型..." allowClear value={testKeyword} onChange={(event) => setTestKeyword(event.target.value)} />
                    <Table
                        rowKey="model"
                        pagination={false}
                        scroll={{ y: 420 }}
                        dataSource={testModels.map((model) => ({ model }))}
                        rowSelection={{
                            selectedRowKeys: selectedTestModels,
                            onChange: (keys) => setSelectedTestModels(keys.map(String)),
                        }}
                        columns={[
                            { title: "模型名称", dataIndex: "model", render: (value) => <Typography.Text strong title={value}>{modelLabel(value, testChannel)}</Typography.Text> },
                            {
                                title: "状态",
                                dataIndex: "model",
                                width: 300,
                                render: (value) => {
                                    if (testingModels.includes(value)) return <Tag icon={<LoadingOutlined className="animate-spin" />}>测试中</Tag>;
                                    const result = testResults[value];
                                    if (!result) return <Tag>未开始</Tag>;
                                    const parsed = parseModelTestResult(result.message);
                                    const summary = modelTestSummary(parsed);
                                    return result.status === "success" ? (
                                        <Space size={6} wrap>
                                            <Tag color="success">成功</Tag>
                                            <Typography.Text type="secondary">请求时长: {result.duration}</Typography.Text>
                                            {parsed.images.length ? <Tag color="blue">含 {parsed.images.length} 张图片</Tag> : null}
                                            {summary ? <Typography.Text type="secondary" ellipsis={{ tooltip: summary }} style={{ maxWidth: 220 }}>{summary}</Typography.Text> : null}
                                            {result.message && result.message !== "ok" ? (
                                                <Button type="link" size="small" className="!px-0" onClick={() => setViewing({ model: value, result })}>查看返回</Button>
                                            ) : null}
                                        </Space>
                                    ) : (
                                        <Space size={6} wrap>
                                            <Typography.Text type="danger" ellipsis={{ tooltip: result.message }} style={{ maxWidth: 220 }}>{summary || result.message}</Typography.Text>
                                            <Button type="link" size="small" className="!px-0" onClick={() => setViewing({ model: value, result })}>查看返回</Button>
                                        </Space>
                                    );
                                },
                            },
                            {
                                title: "操作",
                                key: "actions",
                                width: 120,
                                render: (_, item) => (
                                    <Button size="small" loading={testingModels.includes(item.model)} onClick={() => void testModelOnline(item.model)}>
                                        测试
                                    </Button>
                                ),
                            },
                        ]}
                    />
                </Flex>
            </Modal>
            <Modal
                title={`${viewing?.model || "模型"} 测试返回`}
                open={Boolean(viewing)}
                width={780}
                footer={null}
                onCancel={() => setViewing(null)}
                destroyOnHidden
            >
                <ModelTestResultView raw={viewing?.result.message || ""} />
            </Modal>
        </>
    );
}

function ModelTestResultView({ raw }: { raw: string }) {
    const parsed = parseModelTestResult(raw);
    return (
        <div className="space-y-3">
            {parsed.images.length ? (
                <Image.PreviewGroup>
                    <div className="flex flex-wrap gap-3">
                        {parsed.images.slice(0, 4).map((source, index) => (
                            <Image key={index} src={source} alt={`测试返回图片 ${index + 1}`} width={180} className="rounded-lg border border-border/60 object-cover" />
                        ))}
                    </div>
                </Image.PreviewGroup>
            ) : null}
            {parsed.text ? (
                <pre className="thin-scrollbar max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-muted/30 p-3 text-xs leading-6">{parsed.text}</pre>
            ) : parsed.images.length ? (
                <Typography.Text type="secondary">返回内容只包含图片，已在上方展示。</Typography.Text>
            ) : (
                <Typography.Text type="secondary">上游没有返回可展示的文本。</Typography.Text>
            )}
        </div>
    );
}
