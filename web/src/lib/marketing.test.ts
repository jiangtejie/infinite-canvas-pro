import assert from "node:assert/strict";
import test from "node:test";

import { createMarketingBrand, createMarketingLocation, createMarketingOffering, createMarketingWorkspace } from "./marketing";

test("marketing factories create independent default entities", () => {
    const workspace = createMarketingWorkspace({ name: "直营餐饮", industry: "餐饮" });
    const other = createMarketingWorkspace();
    assert.notEqual(workspace.id, other.id);
    assert.deepEqual([workspace.name, workspace.industry, workspace.revision, workspace.ownerUserId], ["直营餐饮", "餐饮", 0, ""]);
    assert.deepEqual([workspace.brands, workspace.locations, workspace.offerings, workspace.listings], [[], [], [], []]);
    assert.deepEqual([workspace.facts, workspace.assets, workspace.forbidden], [[], [], []]);

    const brand = createMarketingBrand(workspace.id, { name: "好味道" });
    const location = createMarketingLocation(workspace.id, brand.id, { name: "西湖店", city: "杭州" });
    const offering = createMarketingOffering(workspace.id, brand.id, { name: "招牌饭" });
    assert.equal(brand.workspaceId, workspace.id);
    assert.equal(location.brandId, brand.id);
    assert.equal(offering.brandId, brand.id);
    assert.equal(location.kind, "store");
    assert.equal(offering.kind, "product");
    assert.notEqual(location.id, offering.id);
    assert.deepEqual([location.facts, location.assets, offering.forbidden], [[], [], []]);
});
