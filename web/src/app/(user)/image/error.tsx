"use client";

import { ErrorState } from "@/components/ui/state-panel";

export default function ImageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <ErrorState className="h-full" title="生图工作台加载失败" description={error.message || "页面资源加载失败，请重试。"} onRetry={reset} />;
}
