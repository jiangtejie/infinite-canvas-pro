export function canReuseRemixFreshness(cache: ReadonlyMap<string, string>, runId: string, approvalKey: string) {
    return cache.get(runId) === approvalKey;
}
