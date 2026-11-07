"use client";

import { LoadingOutlined } from "@ant-design/icons";
import { Button, Flex, Input, Modal, Space, Table, Tag, Typography } from "antd";

import type { AdminSettingsController } from "../use-admin-settings";

export function AdminSettingsTestModelsModal({ settings }: { settings: AdminSettingsController }) {
    const { testChannelIndex, testChannel, testModels, testKeyword, setTestKeyword, selectedTestModels, setSelectedTestModels, testingModels, testResults, closeTestDialog, batchTestModels, testModelOnline, modelLabel } = settings;
    return (
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
                        <Typography.Text type="secondary">测试会向选中模型发送最小测试请求，用于确认渠道是否有响应。</Typography.Text>
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
                                    width: 260,
                                    render: (value) => {
                                        if (testingModels.includes(value)) return <Tag icon={<LoadingOutlined className="animate-spin" />}>测试中</Tag>;
                                        const result = testResults[value];
                                        if (!result) return <Tag>未开始</Tag>;
                                        return result.status === "success" ? (
                                            <Space size={6} wrap>
                                                <Tag color="success">成功</Tag>
                                                <Typography.Text type="secondary">请求时长: {result.duration}</Typography.Text>
                                                {result.message && result.message !== "ok" ? <Typography.Text type="secondary">{result.message}</Typography.Text> : null}
                                            </Space>
                                        ) : (
                                            <Typography.Text type="danger">{result.message}</Typography.Text>
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
    );
}
