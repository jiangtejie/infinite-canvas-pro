import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "我的画布" };

export default function CanvasLayout({ children }: { children: ReactNode }) {
    return children;
}
