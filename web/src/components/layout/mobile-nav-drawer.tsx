"use client";

import { Drawer } from "antd";
import Link from "next/link";

import { navigationSections, navigationSectionTools, type NavigationTool, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const renderTool = (tool: NavigationTool) => {
        const Icon = tool.icon;
        const active = tool.slug === activeToolSlug;
        return (
            <Link
                key={tool.slug}
                href={`/${tool.slug}`}
                onClick={onClose}
                className={cn(
                    "relative flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] transition-colors",
                    active ? "bg-acid/[0.08]! font-medium text-acid-ink!" : "text-acid-ink! hover:bg-acid/[0.08]!",
                )}
            >
                {active ? <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-acid" aria-hidden /> : null}
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-[5px] border", active ? "border-acid/40 bg-acid/[0.08] text-acid-ink" : "border-border/60 bg-muted/40 text-acid-ink")}>
                    <Icon className="size-4" />
                </span>
                <span>{tool.label}</span>
            </Link>
        );
    };

    return (
        <Drawer title="导航" placement="left" size={280} open={open} onClose={onClose} styles={{ body: { paddingTop: 8 } }}>
            <div className="space-y-1.5">
                {navigationSections.map((section) => {
                    const tools: readonly NavigationTool[] = navigationSectionTools(section);
                    const sectionActive = tools.some((tool) => tool.slug === activeToolSlug);
                    return (
                        <div key={"groups" in section ? section.label : section.slug} className="space-y-1.5">
                            {"groups" in section ? (
                                <p className={cn("px-3 pt-2 font-mono text-[10px] tracking-[0.18em] uppercase", sectionActive ? "text-acid-ink" : "text-muted-foreground/60")}>
                                    {section.label}
                                </p>
                            ) : null}
                            {"groups" in section
                                ? section.groups.map((group, groupIndex) => (
                                    <div key={group.label || groupIndex} className="space-y-1.5">
                                        {group.label ? <p className={cn("px-3 pt-1 font-mono text-[10px] tracking-[0.18em] uppercase", group.items.some((item) => item.slug === activeToolSlug) ? "text-acid-ink" : "text-muted-foreground/60")}>{group.label}</p> : null}
                                        {group.items.map(renderTool)}
                                    </div>
                                ))
                                : renderTool(section)}
                        </div>
                    );
                })}
            </div>
        </Drawer>
    );
}
