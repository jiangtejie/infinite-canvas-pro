import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "素材库" };

export default function AssetLibraryLayout({ children }: { children: ReactNode }) {
    return children;
}
