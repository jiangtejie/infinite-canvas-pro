import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

// 测试里替换 axios adapter 时，补齐 AxiosResponse 的必填字段。
export function axiosResponse<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
    return { data, status, statusText: "OK", headers: {}, config };
}
