import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "视频工作台" };

export default function VideoLayout({ children }: { children: ReactNode }) {
    return children;
}
