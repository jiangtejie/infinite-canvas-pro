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
                                "relative flex items-center gap-3 rounded-xl px-3 py-3 text-base transition-colors",
                                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                            )}
                        >
                            {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-foreground" aria-hidden /> : null}
                            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", active ? "border-border bg-background text-foreground" : "border-transparent bg-muted/60 text-muted-foreground")}>
                                <Icon className="size-4.5" />
                            </span>
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
