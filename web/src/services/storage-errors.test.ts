import assert from "node:assert/strict";
import test from "node:test";
import { isStorageFallbackAllowed, isStorageNotConfiguredError, StorageNotConfiguredError } from "./storage-errors";

test("incomplete user storage configuration is reported but does not allow local fallback", () => {
    const error = new Error("用户对象存储配置不完整");
    assert.equal(isStorageNotConfiguredError(error), true);
    assert.equal(isStorageFallbackAllowed(error), false);
});

test("disabled server storage allows local fallback", () => {
    assert.equal(isStorageFallbackAllowed(new Error("服务端对象存储未启用")), true);
    assert.equal(isStorageFallbackAllowed(new StorageNotConfiguredError()), true);
});

test("unrelated storage errors do not allow local fallback", () => {
    assert.equal(isStorageNotConfiguredError(new Error("上传失败")), false);
    assert.equal(isStorageFallbackAllowed(new Error("上传失败")), false);
});
