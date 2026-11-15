import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "漫画工作台" };

export default function ComicLayout({ children }: { children: ReactNode }) {
    return children;
}
