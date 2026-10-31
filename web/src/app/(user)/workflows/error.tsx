"use client";

import { ErrorState } from "@/components/ui/state-panel";

export default function WorkflowsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <ErrorState className="h-full" title="工作流加载失败" description={error.message || "页面资源加载失败，请重试。"} onRetry={reset} />;
}
