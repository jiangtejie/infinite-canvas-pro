import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "影视 Studio" };

export default function FilmStudioLayout({ children }: { children: ReactNode }) {
    return children;
}
