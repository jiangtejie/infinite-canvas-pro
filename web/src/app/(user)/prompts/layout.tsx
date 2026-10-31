import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "提示词库" };

export default function PromptsLayout({ children }: { children: ReactNode }) {
    return children;
}
