import axios from "axios";

export type ApiParams = Record<string, string | string[] | number | number[] | undefined>;

/** 已登录请求收到 401：由 ClientRootInit 统一清登录态并提示一次，避免每个调用方各处理一遍。 */
export const SESSION_EXPIRED_EVENT = "infinite-canvas:session-expired";

// 登录/注册接口的 401 是账号密码错误，不是会话失效，不能据此清掉已有登录态。
const CREDENTIAL_ENDPOINTS = ["/api/auth/login", "/api/auth/register"];

/** 只有带凭据的非登录接口收到 401 才算会话失效；公开接口与密码错误都不该清登录态。 */
export function isSessionExpired(status: number, url: string, authorized: boolean) {
    return status === 401 && authorized && !CREDENTIAL_ENDPOINTS.includes(url);
}

type ApiResponse<T> = {
    code: number;
    data: T;
    msg: string;
};

/** 请求层错误：message 文案不变，额外携带 HTTP status（网络错误/未知状态为 0）。 */
function apiError(message: string, status: number) {
    return Object.assign(new Error(message), { status });
}

/** 读取请求层错误状态码；非请求层错误（无数字 status）返回 undefined。 */
export function errorStatus(error: unknown): number | undefined {
    const status = error instanceof Error ? (error as Error & { status?: unknown }).status : undefined;
    return typeof status === "number" ? status : undefined;
}

export function compactApiParams(params: ApiParams) {
    return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && (!Array.isArray(value) || value.length > 0))) as ApiParams;
}

export function serializeApiParams(params?: ApiParams) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) value.forEach((item) => queryParams.append(key, String(item)));
        else queryParams.set(key, String(value));
    }
    return queryParams;
}

export async function apiGet<T>(url: string, params?: ApiParams, token?: string) {
    return apiRequest<T>({
        url,
        method: "GET",
        params: params || undefined,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
}

export async function apiPost<T>(url: string, body?: unknown, token?: string) {
    return apiRequest<T>({
        url,
        method: "POST",
        data: body ?? {},
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
}

export async function apiDelete<T>(url: string, token?: string) {
    return apiRequest<T>({
        url,
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
}

async function apiRequest<T>(config: { url: string; method: "GET" | "POST" | "DELETE"; params?: ApiParams; data?: unknown; headers?: Record<string, string> }) {
    let response;
    try {
        response = await axios.request<ApiResponse<T>>({
            url: config.url,
            method: config.method,
            params: config.params,
            paramsSerializer: { serialize: (params) => serializeApiParams(params as ApiParams).toString() },
            data: config.data,
            headers: config.headers,
            validateStatus: () => true,
        });
    } catch {
        throw apiError("接口连接失败，请确认后端服务已启动", 0);
    }

    // 放在响应体校验之前：401 也可能来自网关且不带 JSON 体，同样要触发会话失效。
    if (isSessionExpired(response.status, config.url, Boolean(config.headers?.Authorization))) {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }

    const result = response.data;
    if (!result || typeof result !== "object") {
        throw apiError(response.status === 404 ? "接口不存在，请确认后端服务已启动" : "接口返回异常，请稍后重试", response.status);
    }

    const payload = result as ApiResponse<T>;
    if (response.status < 200 || response.status >= 300 || payload.code !== 0) {
        throw apiError(payload.msg || "请求失败", response.status);
    }

    return payload.data;
}
