import assert from "node:assert/strict";
import test from "node:test";

import { MAX_MEDIA_VERSIONS, withImageVersion, withVideoVersion } from "./film-versions";
import type { FilmShot } from "../types";

const shot: FilmShot = { id: "s1", shotNo: "01", shotType: "", cameraMovement: "", duration: 5, description: "", dialogue: "", audio: "", prompt: "", status: "idle" };

test("生成图片时保留历史版本", () => {
    const first = withImageVersion(shot, "url-1");
    assert.equal(first.imageUrl, "url-1");
    assert.equal(first.imageVersions?.length, 1);
    const second = withImageVersion({ ...shot, ...first } as FilmShot, "url-2");
    assert.equal(second.imageUrl, "url-2");
    assert.deepEqual(second.imageVersions?.map((version) => version.url), ["url-1", "url-2"]);
});

test("历史版本最多保留 6 个", () => {
    let current = shot;
    for (let index = 1; index <= 9; index++) {
        current = { ...current, ...withImageVersion(current, `url-${index}`) } as FilmShot;
    }
    assert.equal(current.imageVersions?.length, MAX_MEDIA_VERSIONS);
    assert.equal(current.imageVersions?.[current.imageVersions.length - 1].url, "url-9");
});

test("视频同样保留版本并更新状态", () => {
    const result = withVideoVersion(shot, "video-1", "video:key");
    assert.equal(result.videoUrl, "video-1");
    assert.equal(result.videoStorageKey, "video:key");
    assert.equal(result.status, "video_ready");
    assert.equal(result.videoVersions?.length, 1);
});
