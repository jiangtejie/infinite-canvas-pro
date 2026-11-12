"use client";

import { Col, Form, Input, InputNumber, Modal, Row, Switch, Typography, theme, type FormInstance } from "antd";

import { DEFAULT_PACKAGE_VALUES, type PackageFormValues } from "../recharge-package-utils";

export function RechargePackageModal({
    editing,
    form,
    saving,
    onCancel,
    onSave,
}: {
    editing: PackageFormValues | null;
    form: FormInstance<PackageFormValues>;
    saving: boolean;
    onCancel: () => void;
    onSave: () => void;
}) {
    const { token: antToken } = theme.useToken();
    return (
            // Form 必须始终挂载：Modal 关闭时内容不渲染，若 useForm 实例一直没有连接 Form，
            // 开发环境会报 "Instance created by useForm is not connected to any Form element"。
            <Form form={form} component={false} layout="vertical" requiredMark={false} initialValues={DEFAULT_PACKAGE_VALUES}>
                <Modal
                    title={editing?.id ? "编辑套餐" : "新增套餐"}
                    open={Boolean(editing)}
                    width={640}
                    confirmLoading={saving}
                    onCancel={onCancel}
                    onOk={onSave}
                    okText="保存"
                    cancelText="取消"
                    forceRender
                >
                    <div style={{ marginTop: 16 }}>
                    <Row gutter={14}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: "请输入套餐名称" }]}>
                                <Input maxLength={40} placeholder="例如：基础包" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="amountYuan" label="价格（元）" rules={[{ required: true, message: "请输入价格" }]}>
                                <InputNumber min={0.01} precision={2} step={1} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="credits" label="到账算力点" rules={[{ required: true, message: "请输入到账算力点" }]}>
                                <InputNumber min={1} step={10} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="bonus" label="赠送算力点" tooltip="用户实付金额对应的额外赠送，可为 0">
                                <InputNumber min={0} step={10} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="sort" label="排序" tooltip="数字越小越靠前">
                                <InputNumber min={0} step={1} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="enabled" label="是否上架" valuePropName="checked">
                                <Switch checkedChildren="在售" unCheckedChildren="下架" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${antToken.colorBorderSecondary}`, paddingTop: 12 }}>
                        <Typography.Text type="secondary">用户端展示价格 ¥{(form.getFieldValue("amountYuan") || 0).toFixed(2)}</Typography.Text>
                        <Typography.Text type="secondary">到账 {Number(form.getFieldValue("credits") || 0) + Number(form.getFieldValue("bonus") || 0)} 算力点</Typography.Text>
                    </div>
                    </div>
                </Modal>
            </Form>
    );
}
