"use client";

import { CaretDownFilled, DeleteOutlined, EditOutlined, FileAddOutlined, FolderAddOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, ConfigProvider, Flex, Form, Input, InputNumber, Modal, Space, Switch, theme, Tooltip, Tree, Typography } from "antd";
import { type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState } from "react";

import { AgentSkillCoverEditor } from "@/components/agent-skill-cover";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { AGENT_SKILL_CONTENT_MAX_LENGTH, type AgentSkill, type AgentSkillFile } from "@/services/api/agent-skills";
import { fetchAdminAgentSkillFiles, saveAdminAgentSkill } from "@/services/api/admin";
import { deleteStoredImages } from "@/services/image-storage";
import { invalidateAgentSkillCache } from "@/stores/use-agent-skill-store";
import { useUserStore } from "@/stores/use-user-store";

import { buildSkillTree, compareSkillEntries, isSkillPathWithin, nextSkillEntrySort, normalizeSkillEntryName, replaceSkillPathPrefix, skillEntryParentPath, type SkillTreeNode } from "../skill-file-utils";

export function SkillEditorModal({ editingSkill, onClose }: { editingSkill: Partial<AgentSkill> | null; onClose: () => void }) {
    const { message } = App.useApp();
    const prompt = usePrompt();
    const confirm = useConfirm();
    const { token: antToken } = theme.useToken();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [form] = Form.useForm<Partial<AgentSkill>>();
    const [skillFiles, setSkillFiles] = useState<AgentSkillFile[]>([]);
    const [selectedTreePath, setSelectedTreePath] = useState("SKILL.md");
    const [selectedFilePath, setSelectedFilePath] = useState("SKILL.md");
    const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
    const [folderDropPath, setFolderDropPath] = useState("");
    const folderDropPathRef = useRef("");
    const dragStartYRef = useRef(0);
    const dragEntryPathRef = useRef("");
    const dropLineRef = useRef<{ element: HTMLElement; parentPath: string; insertIndex: number } | null>(null);
    const editingCoverUrl = Form.useWatch("coverUrl", form);
    const editingCoverStorageKey = Form.useWatch("coverStorageKey", form);
    const [rootSkillContent, setRootSkillContent] = useState("");
    const filesQuery = useQuery({ queryKey: ["admin", "agent-skills", editingSkill?.id, "files"], queryFn: () => fetchAdminAgentSkillFiles(token, editingSkill!.id!), enabled: Boolean(token && editingSkill?.id), retry: false });
    const saveMutation = useMutation({
        mutationFn: (skill: Partial<AgentSkill>) => saveAdminAgentSkill(token, skill),
        onSuccess: async (_, skill) => {
            invalidateAgentSkillCache();
            await queryClient.invalidateQueries({ queryKey: ["admin", "agent-skills"] });
            message.success(skill.id ? "Skill 已保存" : "Skill 已新增");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    useEffect(() => {
        if (!editingSkill) return;
        form.setFieldsValue({ name: "", description: "", coverUrl: "", coverStorageKey: "", content: "", enabled: true, sort: 0, ...editingSkill });
        setRootSkillContent(editingSkill.content || "");
        setSkillFiles([]);
        setSelectedTreePath("SKILL.md");
        setSelectedFilePath("SKILL.md");
        setExpandedPaths([]);
    }, [editingSkill, form]);

    useEffect(() => {
        if (!editingSkill?.id || !filesQuery.data) return;
        setSkillFiles(filesQuery.data);
        setExpandedPaths(filesQuery.data.filter((item) => item.kind === "folder").map((item) => item.path));
    }, [editingSkill?.id, filesQuery.data]);

    const treeData = useMemo(() => buildSkillTree(skillFiles), [skillFiles]);
    const selectedContent = selectedFilePath === "SKILL.md" ? rootSkillContent : skillFiles.find((item) => item.path === selectedFilePath)?.content || "";
    const clearDropLine = () => {
        dropLineRef.current?.element.removeAttribute("data-skill-drop-line");
        dropLineRef.current = null;
    };
    const clearDropTarget = () => {
        clearDropLine();
        folderDropPathRef.current = "";
        setFolderDropPath("");
    };

    const setSelectedContent = (content: string) => {
        if (selectedFilePath === "SKILL.md") {
            setRootSkillContent(content);
            return;
        }
        setSkillFiles((current) => current.map((item) => item.path === selectedFilePath ? { ...item, content } : item));
    };

    const createSkillEntry = async (kind: AgentSkillFile["kind"]) => {
        const selectedEntry = skillFiles.find((item) => item.path === selectedTreePath);
        const parentPath = selectedEntry?.kind === "folder" ? selectedEntry.path : selectedTreePath === "SKILL.md" ? "" : selectedTreePath.split("/").slice(0, -1).join("/");
        const name = await prompt({
            title: kind === "folder" ? "创建文件夹" : "创建 Markdown",
            placeholder: kind === "folder" ? "文件夹名称" : "文件名称",
            confirmText: "创建",
            validate: (value) => {
                const fileName = normalizeSkillEntryName(value, kind);
                if (!fileName) return "请输入有效名称";
                const nextPath = [parentPath, fileName].filter(Boolean).join("/");
                if (nextPath.toLowerCase() === "skill.md" || skillFiles.some((item) => item.path.toLowerCase() === nextPath.toLowerCase())) return "同名文件或文件夹已存在";
                return null;
            },
        });
        if (name === null) return;
        const fileName = normalizeSkillEntryName(name, kind);
        if (!fileName) {
            message.error("请输入有效名称");
            return;
        }
        const nextPath = [parentPath, fileName].filter(Boolean).join("/");
        setSkillFiles((current) => [...current, { path: nextPath, kind, content: "", sort: nextSkillEntrySort(current, parentPath) }]);
        setSelectedTreePath(nextPath);
        if (kind === "file") setSelectedFilePath(nextPath);
        if (parentPath) setExpandedPaths((current) => [...new Set([...current, parentPath])]);
    };

    const renameSkillEntry = async (entryPath: string, kind: AgentSkillFile["kind"]) => {
        const parentPath = entryPath.split("/").slice(0, -1).join("/");
        const name = await prompt({
            title: kind === "folder" ? "重命名文件夹" : "重命名文件",
            defaultValue: entryPath.split("/").at(-1) || entryPath,
            confirmText: "确定",
            validate: (value) => {
                const fileName = normalizeSkillEntryName(value, kind);
                if (!fileName) return "请输入有效名称";
                const nextPath = [parentPath, fileName].filter(Boolean).join("/");
                if (nextPath !== entryPath && (nextPath.toLowerCase() === "skill.md" || skillFiles.some((item) => !isSkillPathWithin(item.path, entryPath) && item.path.toLowerCase() === nextPath.toLowerCase()))) return "同名文件或文件夹已存在";
                return null;
            },
        });
        if (name === null) return;
        const fileName = normalizeSkillEntryName(name, kind);
        if (!fileName) {
            message.error("请输入有效名称");
            return;
        }
        const nextPath = [parentPath, fileName].filter(Boolean).join("/");
        if (nextPath === entryPath) return;
        setSkillFiles((current) => current.map((item) => isSkillPathWithin(item.path, entryPath) ? { ...item, path: replaceSkillPathPrefix(item.path, entryPath, nextPath) } : item));
        setSelectedTreePath((current) => replaceSkillPathPrefix(current, entryPath, nextPath));
        setSelectedFilePath((current) => replaceSkillPathPrefix(current, entryPath, nextPath));
        setExpandedPaths((current) => [...new Set(current.map((item) => replaceSkillPathPrefix(item, entryPath, nextPath)))]);
    };

    const deleteSkillEntry = async (entryPath: string, kind: AgentSkillFile["kind"]) => {
        const confirmed = await confirm({
            title: kind === "folder" ? "删除文件夹" : "删除文件",
            description: kind === "folder" ? `确定删除「${entryPath}」及其中全部文件吗？` : `确定删除「${entryPath}」吗？`,
            confirmText: "删除",
            tone: "danger",
        });
        if (!confirmed) return;
        setSkillFiles((current) => current.filter((item) => !isSkillPathWithin(item.path, entryPath)));
        setSelectedTreePath((current) => isSkillPathWithin(current, entryPath) ? "SKILL.md" : current);
        setSelectedFilePath((current) => isSkillPathWithin(current, entryPath) ? "SKILL.md" : current);
        setExpandedPaths((current) => current.filter((item) => !isSkillPathWithin(item, entryPath)));
    };

    const moveSkillEntry = (entryPath: string, kind: AgentSkillFile["kind"], parentPath: string, insertIndex?: number) => {
        if (entryPath === "SKILL.md") return;
        if (kind === "folder" && isSkillPathWithin(parentPath, entryPath)) return;
        const nextPath = [parentPath, entryPath.split("/").at(-1)].filter(Boolean).join("/");
        const occupiedPaths = new Set(skillFiles.filter((item) => !isSkillPathWithin(item.path, entryPath)).map((item) => item.path.toLowerCase()));
        const movedPaths = skillFiles.filter((item) => isSkillPathWithin(item.path, entryPath)).map((item) => replaceSkillPathPrefix(item.path, entryPath, nextPath).toLowerCase());
        if (movedPaths.some((path) => path === "skill.md" || occupiedPaths.has(path))) {
            message.error("目标位置存在同名文件或文件夹");
            return;
        }
        setSkillFiles((current) => {
            const moved = current.map((item) => isSkillPathWithin(item.path, entryPath) ? { ...item, path: replaceSkillPathPrefix(item.path, entryPath, nextPath) } : item);
            const movingEntry = moved.find((item) => item.path === nextPath);
            if (!movingEntry) return moved;
            const siblings = moved.filter((item) => item.path !== nextPath && skillEntryParentPath(item.path) === parentPath).sort(compareSkillEntries);
            const insertAt = Math.max(0, Math.min(insertIndex ?? siblings.length, siblings.length));
            siblings.splice(insertAt, 0, movingEntry);
            const sortByPath = new Map(siblings.map((item, index) => [item.path, index]));
            return moved.map((item) => sortByPath.has(item.path) ? { ...item, sort: sortByPath.get(item.path)! } : item);
        });
        setSelectedTreePath((current) => replaceSkillPathPrefix(current, entryPath, nextPath));
        setSelectedFilePath((current) => replaceSkillPathPrefix(current, entryPath, nextPath));
        setExpandedPaths((current) => [...new Set([...current.map((item) => replaceSkillPathPrefix(item, entryPath, nextPath)), ...(parentPath ? [parentPath] : [])])]);
    };

    const handleFolderDrop = (event: DragEvent<HTMLDivElement>) => {
        const folderPath = folderDropPathRef.current;
        if (!folderPath) return;
        event.preventDefault();
        event.stopPropagation();
        const entryPath = dragEntryPathRef.current;
        const movingEntry = skillFiles.find((item) => item.path === entryPath);
        clearDropTarget();
        dragEntryPathRef.current = "";
        if (movingEntry) moveSkillEntry(entryPath, movingEntry.kind, folderPath);
    };

    const saveSkill = async () => {
        const values = await form.validateFields();
        if (!rootSkillContent.trim()) {
            message.error("请输入 SKILL.md 内容");
            return;
        }
        if (Array.from(rootSkillContent).length > AGENT_SKILL_CONTENT_MAX_LENGTH) {
            message.error("SKILL.md 不能超过 20000 字");
            return;
        }
        const oversized = skillFiles.find((item) => item.kind === "file" && Array.from(item.content).length > AGENT_SKILL_CONTENT_MAX_LENGTH);
        if (oversized) {
            message.error(`${oversized.path} 不能超过 20000 字`);
            return;
        }
        await saveMutation.mutateAsync({ ...editingSkill, ...values, content: rootSkillContent, files: skillFiles });
        if (editingSkill?.coverStorageKey && editingSkill.coverStorageKey !== values.coverStorageKey) await deleteStoredImages([editingSkill.coverStorageKey]).catch(() => undefined);
        onClose();
    };

    // Form 必须常驻挂载：Modal 关闭时内容不渲染，若 useForm 实例一直没有连接 Form，开发环境会报 "Instance created by useForm is not connected to any Form element"。
    return (
            <Form form={form} component={false} layout="vertical" requiredMark={false}>
                <Modal forceRender title={editingSkill?.id ? "编辑 Skill" : "新增 Skill"} open={Boolean(editingSkill)} width={1120} footer={null} onCancel={onClose}>
                    <Form.Item name="coverUrl" hidden><Input /></Form.Item>
                    <Form.Item name="coverStorageKey" hidden><Input /></Form.Item>
                    <Form.Item name="content" hidden><Input /></Form.Item>
                    <div className="grid h-[min(680px,calc(100vh-180px))] gap-6 md:grid-cols-[380px_minmax(0,1fr)]">
                        <div className="flex min-h-0 flex-col pb-5">
                            <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入 Skill 名称" }]}><Input /></Form.Item>
                            <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
                            <Form.Item label="封面图片">
                                <AgentSkillCoverEditor name={editingSkill?.name || "Skill"} coverUrl={editingCoverUrl} coverStorageKey={editingCoverStorageKey} size={72} iconSize={26} borderColor={antToken.colorBorder} background={antToken.colorFillQuaternary} onChange={(value) => form.setFieldsValue(value)} />
                            </Form.Item>
                            <Flex align="end" gap={12}>
                                <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ marginBottom: 0 }}><Switch /></Form.Item>
                                <Form.Item name="sort" label="排序" style={{ marginBottom: 0 }}><InputNumber min={0} precision={0} className="!w-20" /></Form.Item>
                                <Button type="primary" loading={saveMutation.isPending || filesQuery.isFetching} disabled={Boolean(editingSkill?.id && filesQuery.isError)} style={{ marginLeft: "auto" }} onClick={() => void saveSkill()}>保存</Button>
                            </Flex>
                            <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-lg border p-3" style={{ borderColor: antToken.colorBorder }}>
                                <Flex align="center" justify="space-between">
                                    <Typography.Text strong>目录</Typography.Text>
                                    <Space size={2}>
                                        <Tooltip title="创建文件夹"><Button type="text" size="small" disabled={filesQuery.isFetching || filesQuery.isError} icon={<FolderAddOutlined />} onClick={() => createSkillEntry("folder")} /></Tooltip>
                                        <Tooltip title="创建 Markdown"><Button type="text" size="small" disabled={filesQuery.isFetching || filesQuery.isError} icon={<FileAddOutlined />} onClick={() => createSkillEntry("file")} /></Tooltip>
                                    </Space>
                                </Flex>
                                <div className="thin-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto" onDropCapture={handleFolderDrop}>
                                    {filesQuery.isFetching ? <Typography.Text type="secondary">正在加载目录…</Typography.Text> : filesQuery.isError ? <Typography.Text type="danger">目录加载失败，请关闭后重试</Typography.Text> : (
                                        <ConfigProvider theme={{ components: { Tree: { indentSize: 12, switcherSize: 16 } } }}>
                                            <Tree
                                                blockNode
                                                className="skill-file-tree [&_.ant-tree-drop-indicator]:!hidden"
                                                style={{ "--skill-tree-drop-color": antToken.colorPrimary } as CSSProperties}
                                                draggable={{ icon: false, nodeDraggable: (node) => String(node.key) !== "SKILL.md" }}
                                                treeData={treeData}
                                                styles={{ item: { paddingInline: 0 }, itemTitle: { display: "inline-flex", width: "100%", minWidth: 0, verticalAlign: "top" }, itemSwitcher: { display: "none" } }}
                                                titleRender={(treeNode) => {
                                                    const node = treeNode as SkillTreeNode;
                                                    const movingInside = folderDropPath === node.key;
                                                    const expanded = expandedPaths.includes(node.key);
                                                    return (
                                                        <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-1" data-skill-path={node.key} data-skill-kind={node.kind}>
                                                            {node.kind === "folder" && node.children?.length ? (
                                                                <button type="button" aria-label={expanded ? "收起文件夹" : "展开文件夹"} aria-expanded={expanded} className="pointer-events-auto flex size-4 shrink-0 items-center justify-center" onClick={(event) => { event.stopPropagation(); setExpandedPaths((current) => current.includes(node.key) ? current.filter((path) => path !== node.key) : [...current, node.key]); }}>
                                                                    <CaretDownFilled className={`text-[10px] transition-transform ${expanded ? "" : "-rotate-90"}`} />
                                                                </button>
                                                            ) : null}
                                                            <span className="flex size-4 shrink-0 items-center justify-center">{movingInside ? <FolderOpenOutlined /> : node.icon}</span>
                                                            <span className="min-w-0 flex-1 truncate">{node.title}</span>
                                                            {movingInside ? <Typography.Text type="secondary" className="shrink-0 text-xs">移入</Typography.Text> : node.key === "SKILL.md" ? null : (
                                                                <Space size={0} className="pointer-events-auto" onClick={(event) => event.stopPropagation()}>
                                                                    <Tooltip title="重命名"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => renameSkillEntry(String(node.key), node.kind)} /></Tooltip>
                                                                    <Tooltip title="删除"><Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => deleteSkillEntry(String(node.key), node.kind)} /></Tooltip>
                                                                </Space>
                                                            )}
                                                        </span>
                                                    );
                                                }}
                                                selectedKeys={[folderDropPath || selectedTreePath]}
                                                expandedKeys={expandedPaths}
                                                allowDrop={({ dragNode, dropNode }) => {
                                                    const entryPath = String(dragNode.key);
                                                    const targetPath = String(dropNode.key);
                                                    return entryPath !== "SKILL.md" && (entryPath === targetPath || !isSkillPathWithin(targetPath, entryPath));
                                                }}
                                                onDrop={(info) => {
                                                    const dragNode = info.dragNode as unknown as SkillTreeNode;
                                                    const folderPath = folderDropPathRef.current;
                                                    const dropLine = dropLineRef.current;
                                                    clearDropTarget();
                                                    dragEntryPathRef.current = "";
                                                    if (folderPath) {
                                                        moveSkillEntry(String(dragNode.key), dragNode.kind, folderPath);
                                                        return;
                                                    }
                                                    if (dropLine) moveSkillEntry(String(dragNode.key), dragNode.kind, dropLine.parentPath, dropLine.insertIndex);
                                                }}
                                                onDragStart={({ event, node }) => { dragStartYRef.current = event.clientY; dragEntryPathRef.current = String(node.key); }}
                                                onDragOver={({ event, node }) => {
                                                    const target = node as unknown as SkillTreeNode;
                                                    const entryPath = dragEntryPathRef.current;
                                                    const targetPath = String(target.key);
                                                    const bounds = event.currentTarget.getBoundingClientRect();
                                                    const offset = (event.clientY - bounds.top) / bounds.height;
                                                    const canDrop = entryPath !== "SKILL.md" && entryPath !== targetPath && !isSkillPathWithin(targetPath, entryPath);
                                                    const nextPath = canDrop && target.kind === "folder" && offset > 0.1 && offset < 0.9 ? targetPath : "";
                                                    clearDropLine();
                                                    if (canDrop && !nextPath) {
                                                        const parentPath = targetPath === "SKILL.md" ? "" : skillEntryParentPath(targetPath);
                                                        const siblings = skillFiles.filter((item) => !isSkillPathWithin(item.path, entryPath) && skillEntryParentPath(item.path) === parentPath).sort(compareSkillEntries);
                                                        const targetIndex = targetPath === "SKILL.md" ? -1 : siblings.findIndex((item) => item.path === targetPath);
                                                        const after = targetPath === "SKILL.md" || event.clientY >= dragStartYRef.current;
                                                        const insertIndex = targetIndex < 0 ? 0 : targetIndex + (after ? 1 : 0);
                                                        event.currentTarget.setAttribute("data-skill-drop-line", after ? "bottom" : "top");
                                                        dropLineRef.current = { element: event.currentTarget, parentPath, insertIndex };
                                                    }
                                                    folderDropPathRef.current = nextPath;
                                                    setFolderDropPath((current) => current === nextPath ? current : nextPath);
                                                }}
                                                onDragEnd={() => { clearDropTarget(); dragEntryPathRef.current = ""; }}
                                                onDragEnter={(info) => setExpandedPaths(info.expandedKeys.map(String))}
                                                onExpand={(keys) => setExpandedPaths(keys.map(String))}
                                                onSelect={(keys) => {
                                                    const nextPath = String(keys[0] || "");
                                                    if (!nextPath) return;
                                                    setSelectedTreePath(nextPath);
                                                    if (nextPath === "SKILL.md" || skillFiles.some((item) => item.path === nextPath && item.kind === "file")) setSelectedFilePath(nextPath);
                                                }}
                                            />
                                            <style jsx global>{`
                                                .skill-file-tree .ant-tree-treenode {
                                                    position: relative;
                                                }
                                                .skill-file-tree .ant-tree-treenode[data-skill-drop-line]::after {
                                                    position: absolute;
                                                    right: 0;
                                                    left: 0;
                                                    z-index: 2;
                                                    height: 2px;
                                                    background: var(--skill-tree-drop-color);
                                                    content: "";
                                                    pointer-events: none;
                                                }
                                                .skill-file-tree .ant-tree-treenode[data-skill-drop-line="top"]::after {
                                                    top: 0;
                                                }
                                                .skill-file-tree .ant-tree-treenode[data-skill-drop-line="bottom"]::after {
                                                    bottom: 0;
                                                }
                                            `}</style>
                                        </ConfigProvider>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-col pb-5">
                            <Flex align="center" justify="space-between" className="mb-2">
                                <Typography.Text>Skill 内容</Typography.Text>
                                <Typography.Text type="secondary" className="max-w-[70%] truncate text-xs">{selectedFilePath}</Typography.Text>
                            </Flex>
                            <Input.TextArea value={selectedContent} count={{ max: AGENT_SKILL_CONTENT_MAX_LENGTH, strategy: (value) => Array.from(value).length, show: ({ count, maxLength }) => `${count} / ${maxLength}`, exceedFormatter: (value, { max }) => Array.from(value).slice(0, max).join("") }} classNames={{ root: "min-h-0 flex-1" }} styles={{ root: { height: "100%" }, textarea: { height: "100%", resize: "none" } }} onChange={(event) => setSelectedContent(event.target.value)} />
                        </div>
                    </div>
                </Modal>
            </Form>
    );
}
