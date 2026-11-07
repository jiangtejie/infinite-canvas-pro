import { FileTextOutlined, FolderOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

import type { AgentSkillFile } from "@/services/api/agent-skills";

export type SkillTreeNode = {
    key: string;
    title: string;
    kind: AgentSkillFile["kind"];
    sort: number;
    icon: ReactNode;
    isLeaf?: boolean;
    children?: SkillTreeNode[];
};

export function buildSkillTree(files: AgentSkillFile[]): SkillTreeNode[] {
    const roots: SkillTreeNode[] = [];
    const folders = new Map<string, SkillTreeNode>();
    const records = new Map(files.map((item) => [item.path, item]));
    const ensureFolder = (folderPath: string): SkillTreeNode | null => {
        if (!folderPath) return null;
        const existing = folders.get(folderPath);
        if (existing) return existing;
        const parentPath = folderPath.split("/").slice(0, -1).join("/");
        const node: SkillTreeNode = { key: folderPath, title: folderPath.split("/").at(-1) || folderPath, kind: "folder", sort: records.get(folderPath)?.sort || 0, icon: <FolderOutlined />, children: [] };
        const parent = ensureFolder(parentPath);
        (parent?.children || roots).push(node);
        folders.set(folderPath, node);
        return node;
    };
    files.filter((item) => item.kind === "folder").forEach((item) => ensureFolder(item.path));
    files.filter((item) => item.kind === "file").forEach((item) => {
        const parent = ensureFolder(item.path.split("/").slice(0, -1).join("/"));
        (parent?.children || roots).push({ key: item.path, title: item.path.split("/").at(-1) || item.path, kind: "file", sort: item.sort, icon: <FileTextOutlined />, isLeaf: true });
    });
    const sort = (items: SkillTreeNode[]) => items.sort((left, right) => left.sort - right.sort || (left.kind === right.kind ? left.title.localeCompare(right.title) : left.kind === "folder" ? -1 : 1)).forEach((item) => { if (item.children) sort(item.children); });
    sort(roots);
    return [{ key: "SKILL.md", title: "SKILL.md", kind: "file", sort: -1, icon: <FileTextOutlined />, isLeaf: true }, ...roots];
}

export function normalizeSkillEntryName(value: string, kind: AgentSkillFile["kind"]) {
    const name = value.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) return "";
    return kind === "file" && !/\.(?:md|markdown|txt)$/i.test(name) ? `${name}.md` : name;
}

export function isSkillPathWithin(value: string, parentPath: string) {
    return value === parentPath || value.startsWith(`${parentPath}/`);
}

export function skillEntryParentPath(value: string) {
    return value.split("/").slice(0, -1).join("/");
}

export function compareSkillEntries(left: AgentSkillFile, right: AgentSkillFile) {
    return left.sort - right.sort || (left.kind === right.kind ? left.path.localeCompare(right.path) : left.kind === "folder" ? -1 : 1);
}

export function nextSkillEntrySort(files: AgentSkillFile[], parentPath: string) {
    return files.filter((item) => skillEntryParentPath(item.path) === parentPath).reduce((maximum, item) => Math.max(maximum, item.sort), -1) + 1;
}

export function replaceSkillPathPrefix(value: string, previousPath: string, nextPath: string) {
    return isSkillPathWithin(value, previousPath) ? nextPath + value.slice(previousPath.length) : value;
}
