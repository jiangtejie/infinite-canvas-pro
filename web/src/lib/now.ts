/** 事件或异步回调中的时间读取；渲染期间请使用 useState 惰性初始化。 */
export function nowMs() {
    return Date.now();
}

export function nowPerformanceMs() {
    return performance.now();
}
