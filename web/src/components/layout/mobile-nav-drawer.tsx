"use client";

import { Drawer } from "antd";
import Link from "next/link";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer title="导航" placement="left" size={280} open={open} onClose={onClose} className="md:hidden" styles={{ body: { paddingTop: 8 } }}>
            <div className="space-y-1.5">
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            href={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "relative flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] transition-colors",
                                active ? "bg-acid/[0.08] font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                            )}
                        >
                            {active ? <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-acid" aria-hidden /> : null}
                            <span className={cn("grid size-8 shrink-0 place-items-center rounded-[5px] border", active ? "border-border bg-background text-acid" : "border-border/60 bg-muted/40 text-muted-foreground")}>
                                <Icon className="size-4" />
                            </span>
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
