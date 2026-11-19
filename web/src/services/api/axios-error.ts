import axios from "axios";

type ErrorPayload = { error?: { message?: string }; msg?: string; code?: number };

/** 提取 axios 错误中的服务端消息、状态码与原始响应，供各请求层按自己的形状返回。 */
export function axiosErrorInfo(error: unknown) {
    if (!axios.isAxiosError<ErrorPayload>(error)) return null;
    const responseData = error.response?.data;
    return {
        status: error.response?.status,
        payload: responseData,
        message: responseData?.msg || responseData?.error?.message || "",
        axiosMessage: error.message,
    };
}
