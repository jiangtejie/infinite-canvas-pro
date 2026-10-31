import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "生图工作台" };

export default function ImageLayout({ children }: { children: ReactNode }) {
    return children;
}
