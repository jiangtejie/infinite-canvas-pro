type ConfirmationTask<T> = () => Promise<T>;

/**
 * 串行排队执行确认请求：画布一批动作可能并行执行，但确认卡同一时刻只能展示一个。
 * 前一个失败或取消不会中断后续确认。
 */
export function createConfirmationQueue() {
    let tail: Promise<unknown> = Promise.resolve();
    return function enqueue<T>(task: ConfirmationTask<T>): Promise<T> {
        const next = tail.then(task, task);
        tail = next.then(() => undefined, () => undefined);
        return next;
    };
}
