"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Flex, Form, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminCreditLog } from "@/services/api/admin";

import { CreditLogFilterBar } from "./components/credit-log-filter-bar";
import { CreditLogDeleteModal, CreditLogEditorModal } from "./components/credit-log-modals";
import { buildCreditLogColumns } from "./components/credit-log-table-columns";
import { useAdminCreditLogs } from "./use-admin-credit-logs";

type CreditLogFormValues = Partial<AdminCreditLog>;

export default function AdminCreditLogsPage() {
    const { logs, keyword, date, page, pageSize, total, isLoading, searchLogs, changePage, changePageSize, resetFilters, refreshLogs, saveLog: saveAdminLog, deleteLog } = useAdminCreditLogs();
    const [form] = Form.useForm<CreditLogFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingLog, setEditingLog] = useState<Partial<AdminCreditLog> | null>(null);
    const [deletingLog, setDeletingLog] = useState<AdminCreditLog | null>(null);

    useEffect(() => setKeywordText(keyword), [keyword]);

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
        <main className="p-3 md:p-6">
            <Flex vertical gap={16}>
                <CreditLogFilterBar keywordText={keywordText} setKeywordText={setKeywordText} date={date} searchLogs={searchLogs} resetFilters={resetFilters} />
                <ProTable<AdminCreditLog>
                    rowKey="id"
                    columns={columns}
                    dataSource={logs}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1000 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>算力点日志</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshLogs() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingLog({ type: "admin_adjust", amount: 0, balance: 0 })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Flex>

            <CreditLogEditorModal editingLog={editingLog} form={form} onCancel={() => setEditingLog(null)} onOk={() => void saveLog()} />
            <CreditLogDeleteModal deletingLog={deletingLog} onCancel={() => setDeletingLog(null)} onOk={() => void deleteSelectedLog()} />
        </main>
    );
}
