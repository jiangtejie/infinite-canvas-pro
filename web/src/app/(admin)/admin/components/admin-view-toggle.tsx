"use client";

import { Segmented } from "antd";
import { LayoutGrid, List } from "lucide-react";

export type AdminViewMode = "grid" | "list";

export function AdminViewToggle({ value, onChange }: { value: AdminViewMode; onChange: (value: AdminViewMode) => void }) {
    return (
        <Segmented
            size="small"
            value={value}
            onChange={(next) => onChange(next as AdminViewMode)}
            options={[
                {
                    value: "grid",
                    label: (
                        <span className="inline-flex items-center gap-1">
                            <LayoutGrid className="size-3.5" />
                            网格
                        </span>
                    ),
                },
                {
                    value: "list",
                    label: (
                        <span className="inline-flex items-center gap-1">
                            <List className="size-3.5" />
                            列表
                        </span>
                    ),
                },
            ]}
        />
    );
}
