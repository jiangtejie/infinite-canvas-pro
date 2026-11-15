import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "角色与场景库" };

export default function ComicLibraryLayout({ children }: { children: ReactNode }) {
    return children;
}
