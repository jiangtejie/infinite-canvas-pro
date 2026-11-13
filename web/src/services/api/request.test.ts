import assert from "node:assert/strict";
import test from "node:test";

import { isSessionExpired } from "./request";

test("authenticated 401 on a business endpoint expires the session", () => {
    assert.equal(isSessionExpired(401, "/api/v1/account/profile", true), true);
    assert.equal(isSessionExpired(401, "/api/auth/me", true), true);
    assert.equal(isSessionExpired(401, "/api/admin/users", true), true);
});

test("credential endpoints treat 401 as a wrong password, not an expired session", () => {
    assert.equal(isSessionExpired(401, "/api/auth/login", true), false);
    assert.equal(isSessionExpired(401, "/api/auth/register", true), false);
});

test("requests without a token never expire the session", () => {
    assert.equal(isSessionExpired(401, "/api/agent-skills", false), false);
    assert.equal(isSessionExpired(401, "/api/v1/account/profile", false), false);
});

// 403 是「这个资源没权限」而不是「会话失效」，清登录态会把无权访问误判成掉线。
test("only 401 expires the session", () => {
    for (const status of [0, 200, 400, 403, 404, 429, 500]) {
        assert.equal(isSessionExpired(status, "/api/v1/account/profile", true), false);
    }
});