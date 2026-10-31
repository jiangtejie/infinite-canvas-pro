import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "工作流" };

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
    return children;
}
