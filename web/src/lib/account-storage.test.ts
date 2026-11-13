import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";

import { accountStorageKey } from "./account-storage";

const BASE = "infinite-canvas:canvas_store";

function setAccount(id: string | null) {
    const user: AuthUser | null = id ? { id, username: id, displayName: id, avatarUrl: "", role: "user", credits: 0, createdAt: "", updatedAt: "" } : null;
    useUserStore.setState({ user });
}

test("未登录的业务数据落在 guest 分区", () => {
    setAccount(null);
    assert.equal(accountStorageKey(BASE), `${BASE}:guest`);
});

// 串号回归：同一浏览器上 A 退出再登录 B，两个账号必须落在不同分区，退出后回到 guest。
test("不同账号落在不同分区，退出后回到 guest", () => {
    setAccount("user-a");
    const a = accountStorageKey(BASE);
    setAccount("user-b");
    const b = accountStorageKey(BASE);
    assert.equal(a, `${BASE}:user-a`);
    assert.equal(b, `${BASE}:user-b`);
    assert.notEqual(a, b);
    setAccount(null);
    assert.equal(accountStorageKey(BASE), `${BASE}:guest`);
});

test("账号 id 里的分隔符被转义，不会拼出别的分区键", () => {
    setAccount("a:b/c");
    assert.equal(accountStorageKey(BASE), `${BASE}:a%3Ab%2Fc`);
});

test("同一账号重复取键稳定，不会被拆成多个分区", () => {
    setAccount("user-a");
    assert.equal(accountStorageKey(BASE), accountStorageKey(BASE));
});