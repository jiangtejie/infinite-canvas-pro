"use client";

import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/state-panel";

const CreativeWorkflowWorkspace = dynamic(
    () => import("@/components/workflows/creative-workflow-workspace").then((module) => module.CreativeWorkflowWorkspace),
    { ssr: false, loading: () => <LoadingState className="h-full" label="正在加载工作流..." /> },
);

export default function WorkflowsPage() {
    return <CreativeWorkflowWorkspace />;
}
