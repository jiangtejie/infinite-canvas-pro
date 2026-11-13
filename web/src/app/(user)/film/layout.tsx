import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "影视项目" };

export default function FilmLayout({ children }: { children: ReactNode }) {
    return children;
}