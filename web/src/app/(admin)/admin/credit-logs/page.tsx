"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Form, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminCreditLog } from "@/services/api/admin";

import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminPagination, buildAdminTableProps } from "../components/admin-table-props";
import { CreditLogFilterBar } from "./components/credit-log-filter-bar";
import { CreditLogDeleteModal, CreditLogEditorModal } from "./components/credit-log-modals";
import { buildCreditLogColumns } from "./components/credit-log-table-columns";
import { useAdminCreditLogs } from "./use-admin-credit-logs";

type CreditLogFormValues = Partial<AdminCreditLog>;

export default function AdminCreditLogsPage() {
    const { logs, keyword, date, page, pageSize, total, isLoading, searchLogs, changePage, changePageSize, resetFilters, refreshLogs, saveLog: saveAdminLog, deleteLog } = useAdminCreditLogs();
    const [form] = Form.useForm<CreditLogFormValues>();
    const [editingLog, setEditingLog] = useState<Partial<AdminCreditLog> | null>(null);
    const [deletingLog, setDeletingLog] = useState<AdminCreditLog | null>(null);

    useEffect(() => {
        if (editingLog) form.setFieldsValue({ type: "admin_adjust", amount: 0, balance: 0, ...editingLog });
    }, [editingLog, form]);

    const saveLog = async () => {
        const value = await form.validateFields();
        await saveAdminLog({ ...editingLog, ...value });
        setEditingLog(null);
    };

    const deleteSelectedLog = async () => {
        if (!deletingLog) return;
        await deleteLog(deletingLog.id);
        setDeletingLog(null);
    };

    const columns = buildCreditLogColumns({ onEdit: setEditingLog, onDelete: setDeletingLog });

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingLog({ type: "admin_adjust", amount: 0, balance: 0 })}>
                        新增记录
                    </Button>
                }
            />
            <CreditLogFilterBar keyword={keyword} date={date} onSearch={searchLogs} onReset={resetFilters} />
            <ProTable<AdminCreditLog>
                {...buildAdminTableProps({ scrollX: 1000, onReload: () => void refreshLogs() })}
                rowKey="id"
                columns={columns}
                dataSource={logs}
                loading={isLoading}
                headerTitle={
                    <Space>
                        <Typography.Text strong>算力点日志</Typography.Text>
                        <Tag>{total} 条</Tag>
                    </Space>
                }
                pagination={buildAdminPagination({ page, pageSize, total, changePage, changePageSize })}
            />

            <CreditLogEditorModal editingLog={editingLog} form={form} onCancel={() => setEditingLog(null)} onOk={() => void saveLog()} />
            <CreditLogDeleteModal deletingLog={deletingLog} onCancel={() => setDeletingLog(null)} onOk={() => void deleteSelectedLog()} />
        </main>
    );
}
