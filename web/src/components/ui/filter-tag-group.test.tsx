import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FilterTagGroup } from "./filter-tag-group";

test("filter tags expose one keyboard target per option", () => {
    const markup = renderToStaticMarkup(
        <FilterTagGroup
            inline
            options={["全部", "图片"]}
            isSelected={(value) => value === "全部"}
            onSelect={() => {}}
        />,
    );

    assert.equal((markup.match(/<button\b/g) || []).length, 2);
    assert.equal((markup.match(/role="button"/g) || []).length, 0);
    assert.equal((markup.match(/tabindex="0"/g) || []).length, 0);
    assert.equal((markup.match(/aria-pressed="true"/g) || []).length, 1);
    assert.equal((markup.match(/aria-pressed="false"/g) || []).length, 1);
    assert.ok(!markup.includes("ant-tag-checkable"));
});
