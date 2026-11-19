import assert from "node:assert/strict";
import test from "node:test";

import { createComicCharacter, createComicLocation, createComicProject } from "./comic-project";
import { comicCharacterLibraryUsageIndex, comicLocationLibraryUsageIndex } from "./comic-library-usage";

test("角色库使用统计覆盖项目、副本与页格绑定", () => {
    const first = createComicProject({ title: "第一册" });
    const character = createComicCharacter(1);
    character.id = "copy-1";
    character.sourceLibraryCharacterId = "library-1";
    first.characters = [character];
    const panel = first.chapters[0]!.pages[0]!.panels[0]!;
    panel.characterBindings = [{ characterId: "copy-1", source: "manual", characterNameSnapshot: character.name }];
    const second = createComicProject({ title: "第二册" });
    const copy = createComicCharacter(1);
    copy.id = "copy-2";
    copy.sourceLibraryCharacterId = "library-1";
    second.characters = [copy];

    const usage = comicCharacterLibraryUsageIndex([first, second]).get("library-1");
    assert.ok(usage);
    assert.equal(usage.projects, 2);
    assert.equal(usage.copies, 2);
    assert.equal(usage.bindings, 1);
    assert.deepEqual(usage.projectTitles, ["第一册", "第二册"]);
});

test("场景库使用统计按副本计数", () => {
    const project = createComicProject({ title: "外景" });
    const location = createComicLocation(1);
    location.id = "location-copy";
    location.sourceLibraryLocationId = "library-location";
    project.locations = [location];
    const usage = comicLocationLibraryUsageIndex([project]).get("library-location");
    assert.ok(usage);
    assert.equal(usage.projects, 1);
    assert.equal(usage.copies, 1);
    assert.equal(usage.bindings, 0);
});
