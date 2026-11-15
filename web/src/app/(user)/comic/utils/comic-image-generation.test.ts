import assert from "node:assert/strict";
import test from "node:test";

import { createComicCharacter, createComicPage, createComicProject } from "./comic-project";
import { buildComicPanelPrompt } from "./comic-image-generation";

test("panel prompt includes style and only referenced cast details", () => {
    const project = createComicProject({ title: "测试", genre: "校园" });
    project.styleGuide = "黑白网点，强对比光影";
    const character = createComicCharacter(1);
    character.name = "林夏";
    character.appearance = "短发，校服";
    project.characters = [character];
    const page = createComicPage(1);
    page.panels[0]!.description = "林夏走进旧校舍，窗外有光";
    const prompt = buildComicPanelPrompt(project, page, page.panels[0]!);
    assert.match(prompt, /黑白网点/);
    assert.match(prompt, /林夏/);
    assert.match(prompt, /短发/);
    assert.match(prompt, /不要画对白框/);
    assert.doesNotMatch(prompt, /其他角色/);
});
