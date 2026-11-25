import type { ScriptContentSnapshot, ScriptProjectDocument } from "@/app/(user)/script/types";
import { snapshotScriptContent } from "@/app/(user)/script/utils/script-document";

export function fixtureSnapshot(): ScriptContentSnapshot {
    return snapshotScriptContent(fixtureDocument());
}

export function fixtureDocument(id = "project-1"): ScriptProjectDocument {
    const updatedAt = "2026-11-25T00:00:00.000Z";
    return {
        schemaVersion: 2,
        id,
        title: "测试剧本",
        format: "tv",
        genre: "悬疑",
        logline: "阿健发现咖啡馆的秘密。",
        theme: "信任",
        synopsis: "一次偶然的跟踪。",
        actOne: "阿健收到照片。",
        actTwo: "老板娘试图隐瞒。",
        actThree: "真相揭晓。",
        characters: [{
            id: "character-1",
            name: "阿健",
            role: "主角",
            want: "查明真相",
            need: "学会信任",
            flaw: "多疑",
            arc: "从怀疑到相信",
            description: "年轻记者。",
        }],
        episodes: [
            {
                id: "episode-1",
                no: 1,
                title: "照片",
                scenes: [
                    {
                        id: "scene-1",
                        no: 1,
                        interiorExterior: "内景",
                        location: "咖啡馆",
                        timeOfDay: "日",
                        characters: ["阿健"],
                        goal: "确认照片来源",
                        conflict: "老板娘回避",
                        turn: "发现另一张照片",
                        outcome: "决定跟踪",
                        summary: "阿健询问照片。",
                        content: "阿健推门进来。",
                        notes: "保持克制。",
                        revision: 1,
                        updatedAt,
                    },
                    {
                        id: "scene-2",
                        no: 2,
                        interiorExterior: "外景",
                        location: "咖啡馆门口",
                        timeOfDay: "日",
                        characters: ["阿健", "老板娘"],
                        goal: "跟上老板娘",
                        conflict: "路口人多",
                        turn: "老板娘消失",
                        outcome: "阿健失去目标",
                        summary: "阿健跟丢目标。",
                        content: "老板娘跟在身后。",
                        notes: "",
                        revision: 1,
                        updatedAt,
                    },
                ],
            },
            {
                id: "episode-2",
                no: 2,
                title: "跟踪",
                scenes: [{
                    id: "scene-3",
                    no: 1,
                    interiorExterior: "内景",
                    location: "旧仓库",
                    timeOfDay: "夜",
                    characters: ["阿健"],
                    goal: "找到照片中的人",
                    conflict: "仓库大门紧锁",
                    turn: "发现侧门",
                    outcome: "进入仓库",
                    summary: "阿健进入仓库。",
                    content: "仓库里传来脚步声。",
                    notes: "",
                    revision: 1,
                    updatedAt,
                }],
            },
        ],
        publications: [],
        createdAt: "2026-11-24T00:00:00.000Z",
        updatedAt,
    };
}
