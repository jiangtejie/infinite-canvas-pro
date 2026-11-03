import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

import { generationReferenceUrls, selectAudioReference, withCanvasVideoAdvancedConfig } from "./canvas-generation-helpers";

const basePrompt = [{ prompt: "base", duration: "5" }];
const baseElements = [{ name: "base", description: "", references: [] }];
const config = { model: "not-kie-model", videoModel: "not-kie-model", videoMultiPrompt: basePrompt, videoElementList: baseElements, videoNegativePrompt: "neg", videoMultiShot: "true", videoShotType: "custom" } as unknown as AiConfig;

const image = (patch: Partial<ReferenceImage>): ReferenceImage => ({ id: "r", dataUrl: "", ...patch } as ReferenceImage);
const audio = (id: string): ReferenceAudio => ({ id } as ReferenceAudio);

test("audio reference selection follows the selected id, then single reference", () => {
    const mimo = { ...config, model: "mimo-v2.5-tts-voiceclone", audioModel: "mimo-v2.5-tts-voiceclone" } as AiConfig;
    assert.equal(selectAudioReference(mimo, { mimoVoiceCloneAudioNodeId: "b" }, [audio("a"), audio("b")])?.id, "b");
    assert.equal(selectAudioReference(mimo, {}, [audio("a")])?.id, "a");
    assert.throws(() => selectAudioReference(mimo, {}, []), /请连接参考音频节点/);
    assert.throws(() => selectAudioReference(mimo, {}, [audio("a"), audio("b")]), /多个音频节点/);
});

test("video advanced config lets per-generation lists override defaults", () => {
    const prompts = [{ prompt: "a", duration: "5" }, { prompt: "b", duration: "5" }];
    const elements = [{ name: "x", description: "", references: [] }];
    const overridden = withCanvasVideoAdvancedConfig(config, { videoMultiPrompt: prompts, videoElementList: elements });
    assert.deepEqual(overridden.videoMultiPrompt, prompts);
    assert.deepEqual(overridden.videoElementList, elements);
    assert.equal(overridden.videoNegativePrompt, "neg");
    const fallback = withCanvasVideoAdvancedConfig(config, { videoMultiPrompt: [], videoElementList: [] });
    assert.deepEqual(fallback.videoMultiPrompt, basePrompt);
    assert.deepEqual(fallback.videoElementList, baseElements);
});

test("generation reference urls keep first/last/image/video/audio order", () => {
    const urls = generationReferenceUrls({
        firstFrame: image({ url: "first" }),
        lastFrame: image({ storageKey: "last" }),
        referenceImages: [image({ url: "i1" }), image({ dataUrl: "data:image/png;base64,abc" })],
        referenceVideos: [{ storageKey: "v1" }, { url: "v2" }],
        referenceAudios: [{ url: "a1" }],
    });
    assert.deepEqual(urls, ["first", "last", "i1", "v1", "v2", "a1"]);
});
