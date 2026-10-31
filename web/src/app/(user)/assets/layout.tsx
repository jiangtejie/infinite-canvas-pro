import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "我的素材" };

export default function AssetsLayout({ children }: { children: ReactNode }) {
    return children;
}
