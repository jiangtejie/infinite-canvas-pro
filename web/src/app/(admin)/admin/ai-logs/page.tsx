"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Button, Flex, InputNumber, Space, Tag, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import { deleteAdminAICallLogs, fetchAdminAICallLogs, fetchAdminSettings, saveAdminSettings, type AdminAICallLog } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import { AiLogDetailModal } from "./components/ai-log-detail-modal";
import { AiLogFilterBar } from "./components/ai-log-filter-bar";
import { buildAiLogColumns, type AiLogDetail } from "./components/ai-log-table-columns";

export default function AdminAICallLogsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [logs, setLogs] = useState<AdminAICallLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [clearDays, setClearDays] = useState(7);
    const [clearing, setClearing] = useState(false);
    const [detail, setDetail] = useState<AiLogDetail | null>(null);
    const [localDirectReportEnabled, setLocalDirectReportEnabled] = useState(false);
    const [savingLocalDirectReport, setSavingLocalDirectReport] = useState(false);

    const loadLogs = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const result = await fetchAdminAICallLogs(token, { keyword, page, pageSize });
            setLogs(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取 AI 调用日志失败");
        } finally {
            setLoading(false);
        }
    };

    const loadLogsRef = useRef(loadLogs);
    loadLogsRef.current = loadLogs;

    useEffect(() => {
        void loadLogsRef.current();
    }, [token, page, pageSize]);

    useEffect(() => {
        if (!token) return;
        fetchAdminSettings(token)
            .then((settings) => setLocalDirectReportEnabled(settings.private.aiLog?.localDirectReportEnabled === true))
            .catch(() => undefined);
    }, [token]);

    const clearLogs = async () => {
        if (!token) return;
        setClearing(true);
        try {
            const result = await deleteAdminAICallLogs(token, clearDays);
            message.success(`已清理 ${result.removedFiles} 个日志文件`);
            setPage(1);
            await loadLogs();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "清理 AI 调用日志失败");
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
            message.error(error instanceof Error ? error.message : "保存本地直连日志设置失败");
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
                    setKeyword={setKeyword}
                    onSearch={() => {
                        setPage(1);
                        void loadLogs();
                    }}
                    onReset={() => {
                        setKeyword("");
                        setPage(1);
                        void loadLogs();
                    }}
                    localDirectReportEnabled={localDirectReportEnabled}
                    savingLocalDirectReport={savingLocalDirectReport}
                    onToggleLocalDirectReport={(checked) => void updateLocalDirectReport(checked)}
                />
                <ProTable<AdminAICallLog>
                    rowKey="id"
                    columns={columns as ProColumns<AdminAICallLog>[]}
                    dataSource={logs}
                    loading={loading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1420 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>AI 调用日志</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void loadLogs() }}
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
                        total,
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
