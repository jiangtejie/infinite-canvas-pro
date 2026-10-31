"use client";

import dynamic from "next/dynamic";

const CreativeWorkflowWorkspace = dynamic(
    () => import("@/components/workflows/creative-workflow-workspace").then((module) => module.CreativeWorkflowWorkspace),
    { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载工作流...</div> },
);

export default function WorkflowsPage() {
    return <CreativeWorkflowWorkspace />;
}
