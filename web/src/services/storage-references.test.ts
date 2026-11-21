import assert from "node:assert/strict";
import test from "node:test";

import { collectStorageReferenceKeys } from "@/lib/storage-reference-keys";
import { buildStorageReferenceSources } from "./storage-references";

test("film character and generation references are collected", () => {
    const key = "image:film-character";
    const sources = buildStorageReferenceSources({
        filmCast: { characters: [{ character: { card: { images: [{ storageKey: key }] }, states: [{ look: { images: [{ storageKey: key }] } }] } }], locations: [], props: [], costumes: [] },
        logKeys: [],
        otherAccounts: [],
    });
    assert.equal(collectStorageReferenceKeys(sources).has(key), true);
});

test("comic project and cast references are collected and cross-account safe", () => {
    const key = "image:cast";
    const sources = buildStorageReferenceSources({
        comicProjects: [{
            characters: [{
                references: { primary: { storageKey: key } },
                variants: [{ referenceImage: { storageKey: key } }],
            }],
        }],
        comicCast: {
            characters: [{ references: { face: { storageKey: key } } }],
            locations: [],
        },
        logKeys: [],
        otherAccounts: [],
    });
    assert.ok(sources.comicProjects);
    assert.ok(sources.comicCast);
    assert.equal(collectStorageReferenceKeys(sources).has(key), true);

    const withOtherAccount = buildStorageReferenceSources({
        comicProjects: [],
        comicCast: { characters: [], locations: [] },
        logKeys: [],
        otherAccounts: [{ state: { projects: [{ characters: [{ references: { fullBody: { storageKey: key } } }] }] } }],
    });
    assert.equal(collectStorageReferenceKeys(withOtherAccount).has(key), true);
});
