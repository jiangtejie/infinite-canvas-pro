"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Flex, Form, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminUser } from "@/services/api/admin";

import { UserFilterBar } from "./components/user-filter-bar";
import { UserDeleteModal, UserEditorModal } from "./components/user-modals";
import { buildUserColumns } from "./components/user-table-columns";
import { useAdminUsers } from "./use-admin-users";

type UserFormValues = Partial<AdminUser> & { password?: string };

export default function AdminUsersPage() {
    const { users, keyword, page, pageSize, total, isLoading, searchUsers, changePage, changePageSize, resetFilters, refreshUsers, saveUser: saveAdminUser, adjustCredits, deleteUser } = useAdminUsers();
    const [form] = Form.useForm<UserFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

    useEffect(() => setKeywordText(keyword), [keyword]);

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
        await adjustCredits(editingUser.id, form.getFieldValue("credits") || 0);
    };

    const deleteSelectedUser = async () => {
        if (!deletingUser) return;
        await deleteUser(deletingUser.id);
        setDeletingUser(null);
    };

    const columns = buildUserColumns({ onEdit: setEditingUser, onDelete: setDeletingUser });

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <UserFilterBar keywordText={keywordText} setKeywordText={setKeywordText} searchUsers={searchUsers} resetFilters={resetFilters} />
                <ProTable<AdminUser>
                    rowKey="id"
                    columns={columns}
                    dataSource={users}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1000 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>用户列表</Typography.Text>
                            <Tag>{total} 人</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshUsers() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingUser({ role: "user", status: "active" })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 人`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Flex>

            <UserEditorModal editingUser={editingUser} form={form} onCancel={() => setEditingUser(null)} onOk={() => void saveUser()} onAdjustCredits={() => void saveCredits()} />
            <UserDeleteModal deletingUser={deletingUser} onCancel={() => setDeletingUser(null)} onOk={() => void deleteSelectedUser()} />
        </main>
    );
}
