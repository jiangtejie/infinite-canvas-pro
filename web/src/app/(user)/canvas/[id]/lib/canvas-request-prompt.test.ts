import assert from "node:assert/strict";
import test from "node:test";

import { appendImageNegativePrompt } from "../../components/canvas-node-generation";
import { applyCameraPrompt } from "../../utils/canvas-camera";
import { resolveImageNegativePrompt } from "../../utils/canvas-negative-prompt";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { buildCanvasNodeRequestPrompt } from "./canvas-request-prompt";

test("复刻审阅与生图共用最终提示词编译，包含引用、负面词和相机控制", async () => {
    const nodes: CanvasNodeData[] = [{
        id: "image-1",
        type: CanvasNodeType.Image,
        title: "复刻主图",
        position: { x: 0, y: 0 },
        width: 512,
        height: 512,
        metadata: {
            prompt: "画面 @[node:text-1]",
            negativePrompt: "模糊",
            cameraControl: { enabled: true, camera: "推进", lens: "35mm", focalLength: 35, aperture: 2.8 },
        },
    }, {
        id: "text-1",
        type: CanvasNodeType.Text,
        title: "参考文字",
        position: { x: 0, y: 0 },
        width: 512,
        height: 256,
        metadata: { content: "参考文字", status: "success" },
    }];
    const compiled = await buildCanvasNodeRequestPrompt({ nodeId: "image-1", mode: "image", prompt: "画面 @[node:text-1]", nodes, connections: [{ id: "edge-1", fromNodeId: "text-1", toNodeId: "image-1" }] });
    const expectedBase = "画面 @[node:text-1]\n\n参考文字";
    const expectedPrompt = appendImageNegativePrompt(
        applyCameraPrompt(expectedBase, nodes[0].metadata!.cameraControl),
        resolveImageNegativePrompt(expectedBase, "模糊", true),
    );
    assert.equal(compiled.requestPrompt, expectedPrompt);
    assert.equal(compiled.effectivePrompt, expectedBase);
});
