"use client";

import { MoreOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useQuery } from "@tanstack/react-query";
import { App, Button, InputNumber, Popover, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { deleteAdminAICallLogs, fetchAdminAICallLogs, fetchAdminSettings, saveAdminSettings, type AdminAICallLog } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminTableProps } from "../components/admin-table-props";
import { AiLogDetailDrawer } from "./components/ai-log-detail-drawer";
import { AiLogFilterBar } from "./components/ai-log-filter-bar";
import { buildAiLogColumns } from "./components/ai-log-table-columns";
import { errorMessage } from "@/lib/utils";

export default function AdminAICallLogsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [clearDays, setClearDays] = useState(7);
    const [clearing, setClearing] = useState(false);
    const [maintenanceOpen, setMaintenanceOpen] = useState(false);
    const [detail, setDetail] = useState<AdminAICallLog | null>(null);
    const [localDirectReportEnabled, setLocalDirectReportEnabled] = useState(false);
    const [savingLocalDirectReport, setSavingLocalDirectReport] = useState(false);

    const logsQuery = useQuery({
        queryKey: ["admin", "ai-logs", token, keyword, page, pageSize],
        queryFn: () => fetchAdminAICallLogs(token, { keyword, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    useEffect(() => {
        if (!logsQuery.isError) return;
        message.error(errorMessage(logsQuery.error, "读取 AI 调用日志失败"));
    }, [logsQuery.error, logsQuery.isError, message]);

    useEffect(() => {
        if (!token) return;
        fetchAdminSettings(token)
            .then((settings) => setLocalDirectReportEnabled(settings.private.aiLog?.localDirectReportEnabled === true))
            .catch((error) => message.error(errorMessage(error, "读取后台设置失败")));
    }, [message, token]);

    const searchLogs = (value: string) => {
        if (value !== keyword || page !== 1) {
            setKeyword(value);
            setPage(1);
            return;
        }
        void logsQuery.refetch();
    };

    const clearLogs = async () => {
        if (!token) return;
        setClearing(true);
        try {
            const result = await deleteAdminAICallLogs(token, clearDays);
            message.success(`已清理 ${result.removedFiles} 个日志文件`);
            setMaintenanceOpen(false);
            if (page === 1) await logsQuery.refetch();
            else setPage(1);
        } catch (error) {
            message.error(errorMessage(error, "清理 AI 调用日志失败"));
        } finally {
            setClearing(false);
        }
    };

    const updateLocalDirectReport = async (checked: boolean) => {
        if (!token) return;
        const previous = localDirectReportEnabled;
        setLocalDirectReportEnabled(checked);
        setSavingLocalDirectReport(true);
        try {
            const settings = await fetchAdminSettings(token);
            await saveAdminSettings(token, {
                ...settings,
                private: {
                    ...settings.private,
                    aiLog: {
                        ...settings.private.aiLog,
                        localDirectReportEnabled: checked,
                    },
                },
            });
            message.success(checked ? "已开启本地直连日志上报" : "已关闭本地直连日志上报");
        } catch (error) {
            setLocalDirectReportEnabled(previous);
            message.error(errorMessage(error, "保存本地直连日志设置失败"));
        } finally {
            setSavingLocalDirectReport(false);
        }
    };

    const columns = buildAiLogColumns({ onDetail: setDetail });

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <Popover
                        trigger="click"
                        placement="bottomRight"
                        open={maintenanceOpen}
                        onOpenChange={setMaintenanceOpen}
                        content={
                            <div className="w-64 space-y-3">
                                <div>
                                    <p className="text-xs font-medium text-foreground">清理旧日志</p>
                                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">删除超过指定天数的 AI 调用日志文件，删除后不可恢复。</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <InputNumber min={1} value={clearDays} className="!w-20" onChange={(value) => setClearDays(Number(value) || 7)} />
                                    <span className="text-xs text-muted-foreground">天前</span>
                                    <Button danger size="small" loading={clearing} className="ml-auto" onClick={() => void clearLogs()}>
                                        清理
                                    </Button>
                                </div>
                            </div>
                        }
                    >
                        <Button icon={<MoreOutlined />}>维护</Button>
                    </Popover>
                }
            />
            <AiLogFilterBar
                keyword={keyword}
                onSearch={searchLogs}
                onReset={() => searchLogs("")}
                localDirectReportEnabled={localDirectReportEnabled}
                savingLocalDirectReport={savingLocalDirectReport}
                onToggleLocalDirectReport={(checked) => void updateLocalDirectReport(checked)}
            />
            <ProTable<AdminAICallLog>
                {...buildAdminTableProps({ onReload: () => void logsQuery.refetch() })}
                rowKey="id"
                columns={columns as ProColumns<AdminAICallLog>[]}
                dataSource={logsQuery.data?.items || []}
                loading={logsQuery.isFetching}
                headerTitle={
                    <Space>
                        <Typography.Text strong>AI 调用日志</Typography.Text>
                        <Tag>{logsQuery.data?.total || 0} 条</Tag>
                    </Space>
                }
                pagination={{
                    current: page,
                    pageSize,
                    total: logsQuery.data?.total || 0,
                    showSizeChanger: true,
                    onChange: (nextPage, nextPageSize) => {
                        setPage(nextPage);
                        setPageSize(nextPageSize);
                    },
                }}
            />
            <AiLogDetailDrawer log={detail} onClose={() => setDetail(null)} />
        </main>
    );
}
