"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { App, Button, Card, Col, Flex, Form, Input, Modal, Row, Space, Tag, theme, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";

import { AgentSkillCover } from "@/components/agent-skill-cover";
import type { AgentSkill } from "@/services/api/agent-skills";
import { deleteAdminAgentSkill, fetchAdminAgentSkills } from "@/services/api/admin";
import { deleteStoredImages } from "@/services/image-storage";
import { invalidateAgentSkillCache } from "@/stores/use-agent-skill-store";
import { useUserStore } from "@/stores/use-user-store";

import { SkillEditorModal } from "./components/skill-editor-modal";

export default function AdminSkillsPage() {
    const { message } = App.useApp();
    const { token: antToken } = theme.useToken();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [keyword, setKeyword] = useState("");
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
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });
    const skills = useMemo(() => {
        const queryText = keyword.trim().toLowerCase();
        if (!queryText) return query.data || [];
        return (query.data || []).filter((skill) => `${skill.name} ${skill.description} ${skill.content}`.toLowerCase().includes(queryText));
    }, [keyword, query.data]);

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
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="420px">
                                <Form.Item label="关键词"><Input.Search value={keyword} allowClear enterButton={<SearchOutlined />} placeholder="搜索名称、描述或内容" onChange={(event) => setKeyword(event.target.value)} /></Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item><Button icon={<ReloadOutlined />} onClick={() => void query.refetch()}>刷新</Button></Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AgentSkill>
                    rowKey="id"
                    columns={columns}
                    dataSource={skills}
                    loading={query.isFetching || deleteMutation.isPending}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1000 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={<Space><Typography.Text strong>系统预设 Skill</Typography.Text><Tag>{skills.length} 条</Tag></Space>}
                    options={false}
                    pagination={{ defaultPageSize: 10, showSizeChanger: true }}
                    toolBarRender={() => [<Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingSkill({ enabled: true, sort: 0 })}>新增</Button>]}
                />
            </Flex>

            <SkillEditorModal editingSkill={editingSkill} onClose={() => setEditingSkill(null)} />

            <Modal title="删除 Skill" open={Boolean(deletingSkill)} onCancel={() => setDeletingSkill(null)} onOk={async () => { if (!deletingSkill) return; await deleteMutation.mutateAsync(deletingSkill.id); if (deletingSkill.coverStorageKey) await deleteStoredImages([deletingSkill.coverStorageKey]).catch(() => undefined); setDeletingSkill(null); }} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingSkill?.name}」吗？
            </Modal>
        </main>
    );
}
