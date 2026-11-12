"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Flex, InputNumber, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { deleteAdminAICallLogs, fetchAdminAICallLogs, fetchAdminSettings, saveAdminSettings, type AdminAICallLog } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import { buildAdminTableProps } from "../components/admin-table-props";
import { AiLogDetailModal } from "./components/ai-log-detail-modal";
import { AiLogFilterBar } from "./components/ai-log-filter-bar";
import { buildAiLogColumns, type AiLogDetail } from "./components/ai-log-table-columns";
import { errorMessage } from "@/lib/utils";

export default function AdminAICallLogsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [clearDays, setClearDays] = useState(7);
    const [clearing, setClearing] = useState(false);
    const [detail, setDetail] = useState<AiLogDetail | null>(null);
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
        <main className="p-3 md:p-6">
            <Flex vertical gap={16} className="w-full">
                <AiLogFilterBar
                    keyword={keyword}
                    onSearch={searchLogs}
                    onReset={() => searchLogs("")}
                    localDirectReportEnabled={localDirectReportEnabled}
                    savingLocalDirectReport={savingLocalDirectReport}
                    onToggleLocalDirectReport={(checked) => void updateLocalDirectReport(checked)}
                />
                <ProTable<AdminAICallLog>
                    {...buildAdminTableProps({ scrollX: 1420, onReload: () => void logsQuery.refetch() })}
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
                    toolBarRender={() => [
                        <Space key="clear" wrap>
                            <span className="text-xs text-muted-foreground">清理超过</span>
                            <InputNumber min={1} value={clearDays} className="!w-20" onChange={(value) => setClearDays(Number(value) || 7)} />
                            <span className="text-xs text-muted-foreground">天前的日志</span>
                            <Button danger loading={clearing} onClick={() => void clearLogs()}>清理旧日志</Button>
                        </Space>,
                    ]}
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
            </Flex>
            <AiLogDetailModal detail={detail} onClose={() => setDetail(null)} />
        </main>
    );
}
