import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";

import { changeRemixSettingsMode, createInitialRemixSettings, parseRemixSetupMemory, readRemixSetupMemory, REMIX_DEFAULT_GOALS, saveRemixSetupMemory } from "./remix-setup-memory";
import type { RemixSkillSelection } from "./remix-types";

const selections = [
    { workspaceId: "w", scope: "workspace" },
    { workspaceId: "w", scope: "brand", brandId: "b" },
    { workspaceId: "w", scope: "location", locationId: "l" },
    { workspaceId: "w", scope: "offering", brandId: "b", offeringIds: ["o"] },
] as const;

test("四种资料范围都能保存和恢复", () => {
    for (const selection of selections) {
        const memory = parseRemixSetupMemory({ selection, skills: [] });
        assert.deepEqual(memory.selection, selection);
    }
});

test("模式、植入方式、目标、范围和 Skill 能完整恢复", () => {
    const memory = parseRemixSetupMemory({
        mode: "marketing",
        placement: "promotion",
        goal: "为门店周末活动吸引附近客流",
        selection: selections[2],
        skills: [{ id: "skill-1", source: "system", name: "本地探店" }],
    });
    assert.equal(memory.mode, "marketing");
    assert.equal(memory.placement, "promotion");
    assert.equal(memory.goal, "为门店周末活动吸引附近客流");
    assert.deepEqual(memory.selection, selections[2]);
    assert.deepEqual(memory.skills, [{ id: "skill-1", source: "system", name: "本地探店" }]);
});

test("非法模式、植入方式和超长目标不会写入记忆", () => {
    const memory = parseRemixSetupMemory({ mode: "unknown", placement: "unknown", goal: "x".repeat(1001), skills: [] });
    assert.equal(memory.mode, undefined);
    assert.equal(memory.placement, undefined);
    assert.equal(memory.goal, undefined);
});

test("初始化恢复模式与常用设置，Agent 显式要求和 Skill 优先", () => {
    const memory = parseRemixSetupMemory({ mode: "marketing", placement: "recommendation", goal: "记住的目标", skills: [{ id: "old", source: "system", name: "旧 Skill" }] });
    const explicit: RemixSkillSelection[] = [{ id: "new", source: "user", name: "新 Skill" }];
    const settings = createInitialRemixSettings(memory, { instruction: "Agent 的明确要求", initialSkills: explicit });
    assert.deepEqual(settings, { mode: "marketing", placement: "recommendation", goal: "记住的目标", instruction: "Agent 的明确要求", skills: explicit });
    assert.equal(createInitialRemixSettings(memory, { instruction: "", initialSkills: [] }).skills[0]?.id, "old");
});

test("切换模式只替换默认目标，不抹掉用户自定义目标", () => {
    const initial = createInitialRemixSettings({ skills: [] }, { instruction: "", initialSkills: [] });
    const marketing = changeRemixSettingsMode(initial, "marketing");
    assert.equal(marketing.goal, REMIX_DEFAULT_GOALS.marketing);
    const custom = { ...marketing, goal: "吸引周末到店" };
    assert.equal(changeRemixSettingsMode(custom, "content").goal, "吸引周末到店");
    assert.equal(changeRemixSettingsMode(marketing, "content").goal, REMIX_DEFAULT_GOALS.content);
});

test("非法范围、错误字段和重复商品被过滤", () => {
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "unknown" }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "brand" }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "offering", brandId: "b", offeringIds: [] }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "offering", brandId: "b", offeringIds: ["o", "o"] }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "location", locationId: "l", offeringIds: ["o", "o"] }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "workspace", locationId: "l" }, skills: [] }).selection, undefined);
});

test("记忆按账号分区，不读取其他账号的选择", () => {
    const storage = new Map<string, string>();
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalUser = useUserStore.getState().user;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem: (key: string) => storage.get(key) || null,
                setItem: (key: string, value: string) => storage.set(key, value),
                removeItem: (key: string) => storage.delete(key),
            },
        },
    });
    try {
        const user = (id: string | null): AuthUser | null => id ? { id, username: id, displayName: id, avatarUrl: "", role: "user", credits: 0, createdAt: "", updatedAt: "" } : null;
        useUserStore.setState({ user: user("a") });
        saveRemixSetupMemory({ selection: selections[1], skills: [] });
        useUserStore.setState({ user: user("b") });
        assert.equal(readRemixSetupMemory().selection, undefined);
        useUserStore.setState({ user: user("a") });
        assert.deepEqual(readRemixSetupMemory().selection, selections[1]);
    } finally {
        useUserStore.setState({ user: originalUser });
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
    }
});
