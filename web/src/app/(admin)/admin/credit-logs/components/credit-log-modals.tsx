"use client";

import { Col, Form, Input, InputNumber, Modal, Row, type FormInstance } from "antd";

import type { AdminCreditLog } from "@/services/api/admin";

type CreditLogFormValues = Partial<AdminCreditLog>;

export function CreditLogEditorModal({
    editingLog,
    form,
    onCancel,
    onOk,
}: {
    editingLog: Partial<AdminCreditLog> | null;
    form: FormInstance<CreditLogFormValues>;
    onCancel: () => void;
    onOk: () => void;
}) {
    return (
            <Modal forceRender title={editingLog?.id ? "编辑日志" : "新增日志"} open={Boolean(editingLog)} width={680} onCancel={onCancel} onOk={onOk} okText="保存" cancelText="取消">
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="type" label="类型" rules={[{ required: true, message: "请输入类型" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="amount" label="变动数量" rules={[{ required: true, message: "请输入变动数量" }]}>
                                <InputNumber step={0.01} precision={2} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="balance" label="变动后余额" rules={[{ required: true, message: "请输入变动后余额" }]}>
                                <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="relatedId" label="关联 ID">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="createdAt" label="创建时间">
                                <Input placeholder="不填则新增时自动生成" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="remark" label="备注">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="extra" label="扩展信息">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
    );
}

export function CreditLogDeleteModal({
    deletingLog,
    onCancel,
    onOk,
}: {
    deletingLog: AdminCreditLog | null;
    onCancel: () => void;
    onOk: () => Promise<void> | void;
}) {
    return (
            <Modal
                title="删除日志"
                open={Boolean(deletingLog)}
                onCancel={onCancel}
                onOk={onOk}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除这条算力点日志吗？
            </Modal>
    );
}
