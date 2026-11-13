"use client";

import { Button, Col, Divider, Drawer, Form, Input, InputNumber, Row, Select, Space, type FormInstance } from "antd";
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

export function UserEditorDrawer({
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
    // Form 必须常驻挂载：Drawer 关闭时内容不渲染，若 useForm 实例一直没有连接 Form，开发环境会报 "Instance created by useForm is not connected to any Form element"。
    return (
        <Form form={form} component={false} layout="vertical" requiredMark={false}>
            <Drawer
                title={editingUser?.id ? "编辑用户" : "新增用户"}
                open={Boolean(editingUser)}
                size={560}
                onClose={onCancel}
                forceRender
                footer={
                    <div className="flex justify-end gap-2">
                        <Button onClick={onCancel}>取消</Button>
                        <Button type="primary" onClick={onOk}>
                            保存
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-5">
                    <section>
                        <p className="mb-3 text-[13px] font-semibold text-foreground">基础信息</p>
                        <Row gutter={14}>
                            <Col xs={24} sm={12}>
                                <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="displayName" label="昵称">
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col xs={24}>
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
                    </section>

                    <Divider style={{ margin: 0 }} />

                    <section>
                        <p className="mb-3 text-[13px] font-semibold text-foreground">安全</p>
                        <Form.Item name="password" label={editingUser?.id ? "新密码" : "密码"} rules={editingUser?.id ? [] : [{ required: true, message: "请输入密码" }]}>
                            <Input.Password autoComplete="new-password" placeholder={editingUser?.id ? "留空表示不修改密码" : undefined} />
                        </Form.Item>
                    </section>

                    {editingUser?.id ? (
                        <>
                            <Divider style={{ margin: 0 }} />
                            <section>
                                <p className="mb-3 text-[13px] font-semibold text-foreground">算力点</p>
                                <Form.Item label="算力点">
                                    <Space.Compact style={{ width: "100%" }}>
                                        <Form.Item name="credits" noStyle>
                                            <InputNumber min={0} step={0.01} precision={2} style={{ width: "100%" }} />
                                        </Form.Item>
                                        <Button onClick={onAdjustCredits}>调整</Button>
                                    </Space.Compact>
                                </Form.Item>
                            </section>
                        </>
                    ) : null}
                </div>
            </Drawer>
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
