import { errorMessage } from "@/lib/utils";

/** 云存储未配置：前端直接抛出，或后端 storage 接口返回同名文案。 */
export class StorageNotConfiguredError extends Error {
    constructor(message = "服务端对象存储未启用") {
        super(message);
        this.name = "StorageNotConfiguredError";
    }
}

export function isStorageNotConfiguredError(error: unknown) {
    if (error instanceof StorageNotConfiguredError) return true;
    const message = errorMessage(error, "");
    return message.includes("服务端对象存储未启用") || message.includes("用户对象存储配置不完整");
}

export function isStorageFallbackAllowed(error: unknown) {
    if (error instanceof StorageNotConfiguredError) return true;
    return errorMessage(error, "").includes("服务端对象存储未启用");
}