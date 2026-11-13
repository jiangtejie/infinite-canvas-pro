"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { App, Button, Empty, Space, Tag, theme, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";

import { AgentSkillCover } from "@/components/agent-skill-cover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AgentSkill } from "@/services/api/agent-skills";
import { deleteAdminAgentSkill, fetchAdminAgentSkills } from "@/services/api/admin";
import { deleteStoredImages } from "@/services/image-storage";
import { invalidateAgentSkillCache } from "@/stores/use-agent-skill-store";
import { useUserStore } from "@/stores/use-user-store";

import { AdminGallerySkeleton } from "../components/admin-gallery-skeleton";
import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminTableProps } from "../components/admin-table-props";
import { AdminViewToggle, type AdminViewMode } from "../components/admin-view-toggle";
import { SkillEditorModal } from "./components/skill-editor-modal";
import { SkillFilterBar } from "./components/skill-filter-bar";
import { SkillGalleryCard } from "./components/skill-gallery-card";
import { errorMessage } from "@/lib/utils";

export default function AdminSkillsPage() {
    const { message } = App.useApp();
    const { token: antToken } = theme.useToken();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [view, setView] = useState<AdminViewMode>("grid");
    const [editingSkill, setEditingSkill] = useState<Partial<AgentSkill> | null>(null);
    const [deletingSkill, setDeletingSkill] = useState<AgentSkill | null>(null);
    const query = useQuery({ queryKey: ["admin", "agent-skills", token], queryFn: () => fetchAdminAgentSkills(token), enabled: Boolean(token), retry: false });
    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminAgentSkill(token, id),
        onSuccess: async () => {
            invalidateAgentSkillCache();
            await queryClient.invalidateQueries({ queryKey: ["admin", "agent-skills"] });
            message.success("Skill 已删除");
        },
        onError: (error) => message.error(errorMessage(error, "删除失败")),
    });
    const skills = useMemo(() => {
        const queryText = keyword.trim().toLowerCase();
        return (query.data || []).filter((skill) => {
            if (status === "enabled" && !skill.enabled) return false;
            if (status === "disabled" && skill.enabled) return false;
            if (!queryText) return true;
            return `${skill.name} ${skill.description} ${skill.content}`.toLowerCase().includes(queryText);
        });
    }, [keyword, status, query.data]);

    const columns: ProColumns<AgentSkill>[] = [
        {
            title: "封面",
            dataIndex: "coverUrl",
            width: 72,
            render: (_, item) => <AgentSkillCover name={item.name} coverUrl={item.coverUrl} coverStorageKey={item.coverStorageKey} size={40} iconSize={18} borderColor={antToken.colorBorder} background={antToken.colorFillQuaternary} />,
        },
        {
            title: "名称",
            dataIndex: "name",
            width: 220,
            render: (_, item) => <Typography.Text strong>{item.name}</Typography.Text>,
        },
        {
            title: "描述",
            dataIndex: "description",
            ellipsis: true,
            render: (_, item) => <Typography.Text type="secondary">{item.description || "未填写"}</Typography.Text>,
        },
        { title: "状态", dataIndex: "enabled", width: 88, render: (_, item) => <Tag color={item.enabled ? "success" : "default"}>{item.enabled ? "已启用" : "已停用"}</Tag> },
        { title: "排序", dataIndex: "sort", width: 72 },
        { title: "更新时间", dataIndex: "updatedAt", width: 150, render: (_, item) => <span className="font-mono text-[11px] text-muted-foreground">{dayjs(item.updatedAt).isValid() ? dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm") : "-"}</span> },
        {
            title: "操作",
            key: "actions",
            width: 88,
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingSkill(item)} /></Tooltip>
                    <Tooltip title="删除"><Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingSkill(item)} /></Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <>
                        <AdminViewToggle value={view} onChange={setView} />
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingSkill({ enabled: true, sort: 0 })}>
                            新增 Skill
                        </Button>
                    </>
                }
            />
            <SkillFilterBar
                keyword={keyword}
                status={status}
                onSearch={setKeyword}
                changeStatus={setStatus}
                onReset={() => {
                    setKeyword("");
                    setStatus("");
                }}
            />

            {view === "grid" ? (
                <div className="flex flex-col gap-4">
                    <p className="text-[13px] text-muted-foreground">共 {skills.length} 个 Skill</p>
                    {query.isFetching && !skills.length ? (
                        <AdminGallerySkeleton count={6} className="xl:grid-cols-3" />
                    ) : skills.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {skills.map((skill) => (
                                <SkillGalleryCard key={skill.id} skill={skill} onEdit={setEditingSkill} onDelete={setDeletingSkill} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[var(--admin-line)] bg-card/40">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Skill">
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingSkill({ enabled: true, sort: 0 })}>
                                    新增 Skill
                                </Button>
                            </Empty>
                        </div>
                    )}
                </div>
            ) : (
                <ProTable<AgentSkill>
                    {...buildAdminTableProps({ onReload: () => void query.refetch() })}
                    rowKey="id"
                    columns={columns}
                    dataSource={skills}
                    loading={query.isFetching || deleteMutation.isPending}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>系统预设 Skill</Typography.Text>
                            <Tag>{skills.length} 条</Tag>
                        </Space>
                    }
                    pagination={{ defaultPageSize: 10, showSizeChanger: true }}
                />
            )}

            <SkillEditorModal editingSkill={editingSkill} onClose={() => setEditingSkill(null)} />

            <ConfirmDialog
                open={Boolean(deletingSkill)}
                title="删除 Skill"
                description={`确定删除「${deletingSkill?.name}」吗？删除后不可恢复。`}
                confirmText="删除"
                tone="danger"
                onCancel={() => setDeletingSkill(null)}
                onConfirm={async () => {
                    if (!deletingSkill) return;
                    await deleteMutation.mutateAsync(deletingSkill.id);
                    if (deletingSkill.coverStorageKey) await deleteStoredImages([deletingSkill.coverStorageKey]).catch(() => undefined);
                    setDeletingSkill(null);
                }}
            />
        </main>
    );
}
