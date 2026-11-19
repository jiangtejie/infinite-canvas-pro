import assert from "node:assert/strict";
import test from "node:test";

import { resolveSaveIndicator } from "./save-indicator-state";

test("未登录只显示本机保存", () => {
    assert.deepEqual(resolveSaveIndicator("saved", "idle"), {
        visual: "saved",
        label: "已保存",
        suffix: "· 仅保存在本机浏览器",
        title: "数据仅保存在本机浏览器，换设备或清理浏览器缓存后会丢失，重要项目请用「导出」备份。",
    });
    assert.equal(resolveSaveIndicator("idle", "idle").visual, "idle");
});

test("本地错误优先于同步状态", () => {
    const state = resolveSaveIndicator("error", "error");
    assert.equal(state.visual, "error");
    assert.equal(state.label, "保存失败");
    assert.equal(state.suffix, "· 云端未同步");
});

test("同步失败不会被已保存覆盖，并单独提示", () => {
    const state = resolveSaveIndicator("saved", "error");
    assert.equal(state.visual, "sync-error");
    assert.equal(state.label, "同步失败");
    assert.equal(state.suffix, "· 云端未同步");
});

test("保存中与同步中分别显示，同步完成后显示已同步账号", () => {
    assert.equal(resolveSaveIndicator("saving", "syncing").visual, "saving");
    assert.equal(resolveSaveIndicator("saved", "syncing").visual, "syncing");
    const synced = resolveSaveIndicator("saved", "synced");
    assert.equal(synced.visual, "saved");
    assert.equal(synced.suffix, "· 已同步账号");
    assert.match(synced.title, /同步到账号/);
});
