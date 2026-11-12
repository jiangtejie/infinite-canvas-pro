"use client";

import { Button, Col, Divider, Form, Input, InputNumber, Modal, Row, Select, Space, Typography, type FormInstance } from "antd";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type { AdminUser } from "@/services/api/admin";

type UserFormValues = Partial<AdminUser> & { password?: string };

const roleOptions = [
    { label: "普通用户", value: "user" },
    { label: "管理员", value: "admin" },
];

const statusOptions = [
    { label: "正常", value: "active" },
    { label: "禁用", value: "ban" },
];

export function UserEditorModal({
    editingUser,
    form,
    onCancel,
    onOk,
    onAdjustCredits,
}: {
    editingUser: Partial<AdminUser> | null;
    form: FormInstance<UserFormValues>;
    onCancel: () => void;
    onOk: () => void;
    onAdjustCredits: () => void;
}) {
    // Form 必须常驻挂载：Modal 关闭时内容不渲染，若 useForm 实例一直没有连接 Form，开发环境会报 "Instance created by useForm is not connected to any Form element"。
    return (
            <Form form={form} component={false} layout="vertical" requiredMark={false}>
                <Modal forceRender title={editingUser?.id ? "编辑用户" : "新增用户"} open={Boolean(editingUser)} width={680} onCancel={onCancel} onOk={onOk} okText="保存" cancelText="取消">
                    <Typography.Text strong>基础信息</Typography.Text>
                    <Row gutter={14}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="password" label={editingUser?.id ? "新密码" : "密码"} rules={editingUser?.id ? [] : [{ required: true, message: "请输入密码" }]}>
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="displayName" label="昵称">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="email" label="邮箱">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
                                <Select options={roleOptions} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
                                <Select options={statusOptions} />
                            </Form.Item>
                        </Col>
                    </Row>
                    {editingUser?.id ? (
                        <>
                            <Divider style={{ margin: "4px 0 16px" }} />
                            <Typography.Text strong>算力点调整</Typography.Text>
                            <Row gutter={14}>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="算力点">
                                        <Space.Compact style={{ width: "100%" }}>
                                            <Form.Item name="credits" noStyle>
                                                <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} />
                                            </Form.Item>
                                            <Button onClick={onAdjustCredits}>调整</Button>
                                        </Space.Compact>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </>
                    ) : null}
                </Modal>
            </Form>
    );
}

export function UserDeleteModal({
    deletingUser,
    onCancel,
    onOk,
}: {
    deletingUser: AdminUser | null;
    onCancel: () => void;
    onOk: () => Promise<void> | void;
}) {
    return (
        <ConfirmDialog
            open={Boolean(deletingUser)}
            title="删除用户"
            description={`确定删除「${deletingUser?.displayName || deletingUser?.username}」吗？删除后该账号将无法继续登录。`}
            confirmText="删除"
            tone="danger"
            onCancel={onCancel}
            onConfirm={onOk}
        />
    );
}
