import assert from "node:assert/strict";
import test from "node:test";

import { collectImageStorageKeys, collectStorageReferenceKeys } from "./storage-reference-keys";

test("storage reference keys cover film, cast, logs and other accounts", () => {
    const data = {
        assets: [{ kind: "image", data: { storageKey: "image:asset" } }],
        projects: [{ metadata: { storageKey: "server:canvas", content: "blob:preview" } }],
        filmProjects: [{ episodes: [{ shots: [{ storageKey: "image:shot" }] }] }],
        filmCast: { characters: [{ profile: { parts: { face: { images: [{ storageKey: "server:cast" }] } }, card: { storageKey: "image:card" } } }] },
        logKeys: ["video:log", "server:log", "file:log"],
        otherAccounts: [{ state: { projects: [{ nodes: [{ storageKey: "image:other" }] }] } }],
    };
    const keys = collectStorageReferenceKeys(data);
    assert.deepEqual([...keys].sort(), ["file:log", "image:asset", "image:card", "image:other", "image:shot", "server:canvas", "server:cast", "server:log", "video:log"]);
});

test("image key collector maps known urls and captures node urls", () => {
    const captured = new Map<string, string>();
    const known = new Map([["https://example.test/a", "image:a"]]);
    const keys = collectImageStorageKeys({ nodes: [{ content: "https://example.test/a", storageKey: "image:node", url: "blob:node" }] }, new Set<string>(), known, captured);
    assert.deepEqual([...keys].sort(), ["image:a", "image:node"]);
    assert.equal(captured.get("https://example.test/a"), "image:node");
});
