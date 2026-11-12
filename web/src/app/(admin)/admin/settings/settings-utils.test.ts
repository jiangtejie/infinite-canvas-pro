import assert from "node:assert/strict";
import test from "node:test";

import { isPermissionChange } from "./settings-utils";

test("permission change detection only matches permission switches", () => {
    assert.equal(isPermissionChange({ public: { modelChannel: { allowUserRemoteChannel: true } } }), true);
    assert.equal(isPermissionChange({ public: { modelChannel: { allowCustomChannel: false } } }), true);
    assert.equal(isPermissionChange({ public: { auth: { allowRegister: true } } }), true);
    assert.equal(isPermissionChange({ public: { modelChannel: {} } }), false);
    assert.equal(isPermissionChange({}), false);
});
