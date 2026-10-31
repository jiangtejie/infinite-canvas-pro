import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "画布编辑" };

export default function CanvasEditorLayout({ children }: { children: ReactNode }) {
    return children;
}
