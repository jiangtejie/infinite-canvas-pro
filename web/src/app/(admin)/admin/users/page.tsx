"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { App, Button, Flex, Form, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminUser } from "@/services/api/admin";

import { buildAdminPagination, buildAdminTableProps } from "../components/admin-table-props";
import { UserFilterBar } from "./components/user-filter-bar";
import { UserDeleteModal, UserEditorModal } from "./components/user-modals";
import { buildUserColumns } from "./components/user-table-columns";
import { useAdminUsers } from "./use-admin-users";

type UserFormValues = Partial<AdminUser> & { password?: string };

export default function AdminUsersPage() {
    const { users, keyword, page, pageSize, total, isLoading, searchUsers, changePage, changePageSize, resetFilters, refreshUsers, saveUser: saveAdminUser, adjustCredits, deleteUser } = useAdminUsers();
    const { message } = App.useApp();
    const [form] = Form.useForm<UserFormValues>();
    const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

    useEffect(() => {
        if (editingUser) form.setFieldsValue({ role: "user", status: "active", ...editingUser, password: "" });
    }, [editingUser, form]);

    const saveUser = async () => {
        const value = await form.validateFields();
        const userValue = { ...value };
        delete userValue.credits;
        await saveAdminUser({ ...editingUser, ...userValue, password: value.password || undefined });
        setEditingUser(null);
    };

    const saveCredits = async () => {
        if (!editingUser?.id) return;
        const credits = form.getFieldValue("credits");
        if (typeof credits !== "number") {
            void message.warning("请输入算力点后再调整");
            return;
        }
        await adjustCredits(editingUser.id, credits);
    };

    const deleteSelectedUser = async () => {
        if (!deletingUser) return;
        await deleteUser(deletingUser.id);
        setDeletingUser(null);
    };

    const columns = buildUserColumns({ onEdit: setEditingUser, onDelete: setDeletingUser });

    return (
        <main className="p-3 md:p-6">
            <Flex vertical gap={16}>
                <UserFilterBar keyword={keyword} onSearch={searchUsers} onReset={resetFilters} />
                <ProTable<AdminUser>
                    {...buildAdminTableProps({ onReload: () => void refreshUsers() })}
                    rowKey="id"
                    columns={columns}
                    dataSource={users}
                    loading={isLoading}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>用户列表</Typography.Text>
                            <Tag>{total} 人</Tag>
                        </Space>
                    }
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingUser({ role: "user", status: "active" })}>
                            新增
                        </Button>,
                    ]}
                    pagination={buildAdminPagination({ page, pageSize, total, unit: "人", changePage, changePageSize })}
                />
            </Flex>

            <UserEditorModal editingUser={editingUser} form={form} onCancel={() => setEditingUser(null)} onOk={() => void saveUser()} onAdjustCredits={() => void saveCredits()} />
            <UserDeleteModal deletingUser={deletingUser} onCancel={() => setDeletingUser(null)} onOk={() => void deleteSelectedUser()} />
        </main>
    );
}
