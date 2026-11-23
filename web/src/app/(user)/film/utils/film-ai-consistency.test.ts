import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmShot } from "@/lib/film/types";
import type { FilmGraphReviewContext, FilmGraphReviewInput, FilmGraphReviewScene, FilmGraphReviewShot } from "@/app/(user)/canvas/[id]/lib/film-review-input";
import { createEmptyCharacterProfile } from "./film-character";

import { buildFilmConsistencyContext, parseFilmConsistencyReview } from "./film-ai-consistency";

function makeShot(id: string, shotNo: string, patch: Partial<FilmShot> = {}): FilmShot {
    return { id, shotNo, shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [], ...patch };
}

const scene: FilmGraphReviewScene = { id: "sc1", name: "1-1 街道", episodeTitle: "第1集", location: "", time: "", mood: "", shotIds: ["sh1", "sh2"] };
const reviewContext = (asset?: FilmAsset, patch: Partial<FilmGraphReviewContext> = {}): FilmGraphReviewContext => ({ role: "character", nodeId: "character-node", source: "manual", name: asset?.name || "角色", asset, ...patch });
function makeInput(shots: FilmGraphReviewShot[] = [
    { id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [] },
    { id: "sh2", shot: makeShot("sh2", "02"), scene, contexts: [] },
]): FilmGraphReviewInput {
    return {
        title: "测试项目",
        scenes: [scene],
        shots,
        contexts: shots.flatMap((entry) => entry.contexts.map((item) => ({ ...item, shotId: entry.id }))),
        assets: { characters: [], locations: [], props: [], costumes: [], styles: [] },
        script: { text: "第1集" },
    };
}

const reviewJson = JSON.stringify({
    summary: "整体连续，个别景别跳跃",
    issues: [
        { level: "error", category: "style", message: "01 镜从全景直接跳特写", suggestion: "补一个中景过渡", shotNo: " 01 ", scene: "街道" },
        { level: "fatal", category: "misc", message: "第2集时间线冲突" },
        { level: "", message: "   " },
        { message: "缺少建立镜头", scene: "1-1 街道东侧" },
    ],
});

test("解析 JSON 对象并匹配镜头与场次", () => {
    const review = parseFilmConsistencyReview(`\`\`\`json\n${reviewJson}\n\`\`\``, makeInput());
    assert.equal(review.summary, "整体连续，个别景别跳跃");
    assert.equal(review.issues.length, 3);
    const first = review.issues[0];
    assert.equal(first.level, "error");
    assert.equal(first.category, "style");
    assert.equal(first.shotId, "sh1");
    assert.equal(first.sceneId, "sc1");
    assert.equal(first.suggestion, "补一个中景过渡");
    const second = review.issues[1];
    assert.equal(second.level, "warning");
    assert.equal(second.category, "continuity");
    assert.equal(second.shotId, undefined);
    assert.equal(second.sceneId, undefined);
    const third = review.issues[2];
    assert.equal(third.shotId, undefined);
    assert.equal(third.sceneId, "sc1");
    assert.equal(third.suggestion, undefined);
    assert.ok(review.scriptHash.length >= 8);
    assert.ok(review.reviewedAt.length > 0);
});

test("场次名支持双向 includes 模糊匹配", () => {
    const longSceneName = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "场次问题", scene: "街道" }] }), makeInput());
    assert.equal(longSceneName.issues[0].sceneId, "sc1");
    const shortSceneName = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "场次问题", scene: "1-1 街道东侧" }] }), makeInput());
    assert.equal(shortSceneName.issues[0].sceneId, "sc1");
});

test("disambiguates duplicate shot numbers using the reported scene and episode", () => {
    const secondScene: FilmGraphReviewScene = { id: "sc2", name: scene.name, episodeTitle: "第2集", location: "车站", time: "夜", mood: "雨", shotIds: ["sh3"] };
    const input = makeInput([
        { id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [] },
        { id: "sh3", shot: makeShot("sh3", "01"), scene: secondScene, contexts: [] },
    ]);
    input.scenes = [scene, secondScene];
    const review = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "问题", shotNo: "01", scene: scene.name, episode: "第2集" }] }), input);
    assert.equal(review.issues[0].shotId, "sh3");
    assert.equal(review.issues[0].sceneId, "sc2");
});

test("does not guess a shot id when duplicate shot numbers lack scene context", () => {
    const secondScene: FilmGraphReviewScene = { ...scene, id: "sc2", episodeTitle: "第2集", shotIds: ["sh3"] };
    const input = makeInput([
        { id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [] },
        { id: "sh3", shot: makeShot("sh3", "01"), scene: secondScene, contexts: [] },
    ]);
    input.scenes = [scene, secondScene];
    const review = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "问题", shotNo: "01" }] }), input);
    assert.equal(review.issues[0].shotId, undefined);
    assert.equal(review.issues[0].sceneId, undefined);
});

test("does not guess when duplicate shot numbers match multiple reported scenes", () => {
    const secondScene: FilmGraphReviewScene = { ...scene, id: "sc2", episodeTitle: "第2集", shotIds: ["sh3"] };
    const input = makeInput([
        { id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [] },
        { id: "sh3", shot: makeShot("sh3", "01"), scene: secondScene, contexts: [] },
    ]);
    input.scenes = [scene, secondScene];
    const review = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "问题", shotNo: "01", scene: "街道" }] }), input);
    assert.equal(review.issues[0].shotId, undefined);
    assert.equal(review.issues[0].sceneId, undefined);
});

test("does not guess when duplicate shot numbers share one scene", () => {
    const input = makeInput([
        { id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [] },
        { id: "sh2", shot: makeShot("sh2", "01"), scene, contexts: [] },
    ]);
    const review = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "问题", shotNo: "01", scene: scene.name, episode: scene.episodeTitle }] }), input);
    assert.equal(review.issues[0].shotId, undefined);
    assert.equal(review.issues[0].sceneId, undefined);
});

test("坏 level/category 归一化，超过 12 条截断", () => {
    const issues = Array.from({ length: 15 }, (_, index) => ({ level: "bad", category: "bad", message: `问题 ${index}` }));
    const review = parseFilmConsistencyReview(JSON.stringify({ summary: "多问题", issues }), makeInput());
    assert.equal(review.issues.length, 12);
    assert.ok(review.issues.every((issue) => issue.level === "warning" && issue.category === "continuity"));
    assert.ok(review.issues.every((issue) => issue.id.length > 0));
    assert.equal(new Set(review.issues.map((issue) => issue.id)).size, 12);
});

test("无 issues 返回空数组 + summary，无效 JSON 抛错", () => {
    const empty = parseFilmConsistencyReview(JSON.stringify({ summary: "整体良好", issues: [] }), makeInput());
    assert.deepEqual(empty.issues, []);
    assert.equal(empty.summary, "整体良好");
    assert.throws(() => parseFilmConsistencyReview("没有 JSON", makeInput()), /不是有效 JSON/);
    assert.throws(() => parseFilmConsistencyReview("{bad json}", makeInput()), /不是有效 JSON/);
});

test("缺少 message 的条目丢弃，summary 缺省为 undefined", () => {
    const review = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "  " }, { message: "有效问题" }] }), makeInput());
    assert.equal(review.issues.length, 1);
    assert.equal(review.issues[0].message, "有效问题");
    assert.equal(review.summary, undefined);
});

test("审阅上下文包含镜头角色绑定、别名、状态与签名", () => {
    const character: FilmAsset = { id: "c1", name: "沈星晴", aliases: ["小沈"], description: "红色短发", visualPrompt: "", status: "ready", concept: { images: [], locked: false }, character: createEmptyCharacterProfile(), createdAt: "", updatedAt: "" };
    const input = makeInput([{ id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [reviewContext(character, { continuity: { outfit: "湿外套", emotion: "克制" } })] }]);
    input.assets.characters = [character];
    const context = JSON.parse(buildFilmConsistencyContext(input));
    const shot = context.shots[0];
    assert.equal(shot.characters[0].characterId, "c1");
    assert.equal(shot.characters[0].name, "沈星晴");
    assert.deepEqual(shot.characters[0].aliases, ["小沈"]);
    assert.ok(shot.characters[0].signature.length > 0);
    assert.equal(shot.characters[0].continuity.outfit, "湿外套");
    assert.equal(shot.characters[0].continuity.emotion, "克制");
});

test("审阅上下文携带道具与场景变体信息", () => {
    const concept = { images: [], locked: false };
    const character: FilmAsset = {
        id: "c1", name: "沈星晴", aliases: [], description: "", visualPrompt: "", status: "ready", concept,
        character: { ...createEmptyCharacterProfile(), states: [{ id: "wet", name: "淋雨", description: "", costumeId: "cos1", condition: "", heldPropIds: ["p1"], look: concept }] },
        createdAt: "", updatedAt: "",
    };
    const costume: FilmAsset = { id: "cos1", name: "湿外套", aliases: [], description: "", visualPrompt: "", status: "ready", concept, createdAt: "", updatedAt: "" };
    const prop: FilmAsset = { id: "p1", name: "旧信", aliases: [], description: "", visualPrompt: "", status: "ready", concept, createdAt: "", updatedAt: "" };
    const location: FilmAsset = { id: "l1", name: "咖啡馆", aliases: [], description: "", visualPrompt: "", status: "ready", concept, location: { variants: [{ id: "v1", name: "夜·雨", description: "", concept }] }, createdAt: "", updatedAt: "" };
    const input = makeInput([{ id: "sh1", shot: makeShot("sh1", "01"), scene, contexts: [
        reviewContext(character, { stateId: "wet" }),
        { role: "prop", nodeId: "prop-node", source: "manual", name: "旧信", asset: prop },
        { role: "location", nodeId: "location-node", source: "manual", name: "咖啡馆", asset: location, variantId: "v1" },
    ] }]);
    input.assets.characters = [character];
    input.assets.costumes = [costume];
    input.assets.props = [prop];
    input.assets.locations = [location];
    const context = JSON.parse(buildFilmConsistencyContext(input));
    const contextShot = context.shots[0];
    assert.deepEqual(contextShot.characters[0].heldProps, ["旧信"]);
    assert.deepEqual(contextShot.props, ["旧信"]);
    assert.equal(contextShot.variant, "夜·雨");
    assert.deepEqual(context.props, ["旧信"]);
    assert.deepEqual(context.costumes, ["湿外套"]);
});
