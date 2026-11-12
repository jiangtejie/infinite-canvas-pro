"use client";

import { ErrorState } from "@/components/ui/state-panel";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <ErrorState className="h-full min-h-[60vh]" title="页面出错了" description={error.message || "页面渲染失败，请重试。"} detail={process.env.NODE_ENV === "production" ? undefined : error.stack} onRetry={reset} />;
}
