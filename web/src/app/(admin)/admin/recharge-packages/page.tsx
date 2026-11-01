"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Space, Switch, Tag, theme, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteAdminRechargePackage, fetchAdminRechargePackages, saveAdminRechargePackage, type AdminRechargePackage } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

type PackageFormValues = {
    id?: string;
    name: string;
    amountYuan: number;
    credits: number;
    bonus: number;
    sort: number;
    enabled: boolean;
};

const DEFAULT_VALUES: PackageFormValues = { name: "", amountYuan: 10, credits: 100, bonus: 0, sort: 0, enabled: true };

export default function AdminRechargePackagesPage() {
    const { message } = App.useApp();
    const { token: antToken } = theme.useToken();
    const token = useUserStore((state) => state.token);
    const [items, setItems] = useState<AdminRechargePackage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editing, setEditing] = useState<PackageFormValues | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<PackageFormValues>();

    const reload = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            setItems(await fetchAdminRechargePackages(token));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载套餐失败");
        } finally {
            setIsLoading(false);
        }
    }, [message, token]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (!editing) return;
        form.setFieldsValue(editing);
    }, [editing, form]);

    const save = async () => {
        if (!token) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
            await saveAdminRechargePackage(
                {
                    id: editing?.id,
                    name: values.name,
                    amountFen: Math.round(values.amountYuan * 100),
                    credits: values.credits,
                    bonus: values.bonus,
                    sort: values.sort,
                    enabled: values.enabled,
                },
                token,
            );
            message.success(editing?.id ? "套餐已更新" : "套餐已创建");
            setEditing(null);
            await reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item: AdminRechargePackage) => {
        if (!token) return;
        try {
            await deleteAdminRechargePackage(item.id, token);
            message.success("套餐已删除");
            await reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    const toggleEnabled = async (item: AdminRechargePackage, enabled: boolean) => {
        if (!token) return;
        try {
            await saveAdminRechargePackage({ ...item, enabled }, token);
            setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新失败");
            await reload();
        }
    };

    const columns = useMemo<ProColumns<AdminRechargePackage>[]>(
        () => [
            { title: "套餐名称", dataIndex: "name", width: 160 },
            {
                title: "价格",
                dataIndex: "amountFen",
                width: 120,
                render: (_, item) => <Typography.Text strong>¥{(item.amountFen / 100).toFixed(2)}</Typography.Text>,
            },
            { title: "到账算力", dataIndex: "credits", width: 110, render: (_, item) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{item.credits}</span> },
            {
                title: "赠送算力",
                dataIndex: "bonus",
                width: 110,
                render: (_, item) =>
                    item.bonus > 0 ? <Tag color="gold">+{item.bonus}</Tag> : <Typography.Text type="secondary">-</Typography.Text>,
            },
            { title: "排序", dataIndex: "sort", width: 80 },
            {
                title: "上架状态",
                dataIndex: "enabled",
                width: 120,
                render: (_, item) => (
                    <Switch
                        checked={item.enabled}
                        checkedChildren="在售"
                        unCheckedChildren="下架"
                        onChange={(checked) => void toggleEnabled(item, checked)}
                    />
                ),
            },
            {
                title: "更新时间",
                dataIndex: "updatedAt",
                width: 180,
                render: (_, item) => (
                    <Typography.Text type="secondary">
                        {item.updatedAt ? dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm") : "-"}
                    </Typography.Text>
                ),
            },
            {
                title: "操作",
                key: "actions",
                width: 110,
                render: (_, item) => (
                    <Space size={4}>
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() =>
                                setEditing({
                                    id: item.id,
                                    name: item.name,
                                    amountYuan: item.amountFen / 100,
                                    credits: item.credits,
                                    bonus: item.bonus,
                                    sort: item.sort,
                                    enabled: item.enabled,
                                })
                            }
                        />
                        <Popconfirm title={`删除套餐「${item.name}」？`} description="已生成的订单不受影响。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void remove(item)}>
                            <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [token, items],
    );

    return (
        <main style={{ padding: 24 }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Typography.Text type="secondary">
                        这里的调整会立即影响用户中心「微信充值」里展示的套餐；下架的套餐不再出现在用户端，已创建的订单不受影响。
                    </Typography.Text>
                </Card>
                <ProTable<AdminRechargePackage>
                    rowKey="id"
                    columns={columns}
                    dataSource={items}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>充值套餐</Typography.Text>
                            <Tag>{items.length} 个</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void reload() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ ...DEFAULT_VALUES, sort: items.length + 1 })}>
                            新增套餐
                        </Button>,
                    ]}
                    pagination={false}
                />
            </Space>

            <Modal
                title={editing?.id ? "编辑套餐" : "新增套餐"}
                open={Boolean(editing)}
                width={640}
                confirmLoading={saving}
                onCancel={() => setEditing(null)}
                onOk={() => void save()}
                okText="保存"
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false} initialValues={DEFAULT_VALUES} style={{ marginTop: 16 }}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: "请输入套餐名称" }]}>
                                <Input maxLength={40} placeholder="例如：基础包" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="amountYuan" label="价格（元）" rules={[{ required: true, message: "请输入价格" }]}>
                                <InputNumber min={0.01} precision={2} step={1} style={{ width: "100%" }} addonAfter="元" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="credits" label="到账算力点" rules={[{ required: true, message: "请输入到账算力点" }]}>
                                <InputNumber min={1} step={10} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="bonus" label="赠送算力点" tooltip="用户实付金额对应的额外赠送，可为 0">
                                <InputNumber min={0} step={10} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="sort" label="排序" tooltip="数字越小越靠前">
                                <InputNumber min={0} step={1} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="enabled" label="是否上架" valuePropName="checked">
                                <Switch checkedChildren="在售" unCheckedChildren="下架" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${antToken.colorBorderSecondary}`, paddingTop: 12 }}>
                        <Typography.Text type="secondary">用户端展示价格 ¥{(form.getFieldValue("amountYuan") || 0).toFixed(2)}</Typography.Text>
                        <Typography.Text type="secondary">到账 {Number(form.getFieldValue("credits") || 0) + Number(form.getFieldValue("bonus") || 0)} 算力点</Typography.Text>
                    </div>
                </Form>
            </Modal>
        </main>
    );
}
