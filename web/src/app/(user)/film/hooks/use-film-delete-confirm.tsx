"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";

export type FilmDeleteConfirmOptions = {
    title: string;
    description?: string;
    detail?: string;
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
};

/** 影视模块统一的危险操作确认：删除项目/素材/角色/场景、清空剧本等，走全局 ConfirmDialog 样式。 */
export function useFilmDeleteConfirm() {
    const confirm = useConfirm();

    const confirmDelete = (options: FilmDeleteConfirmOptions) => {
        void confirm({
            title: options.title,
            description: options.description || options.detail ? (
                <div className="grid gap-1.5">
                    {options.description ? <span>{options.description}</span> : null}
                    {options.detail ? (
                        <span className="break-words rounded-md border border-border/60 bg-background/40 px-2 py-1 font-mono text-[10px] leading-5 text-muted-foreground/70">
                            {options.detail}
                        </span>
                    ) : null}
                </div>
            ) : undefined,
            confirmText: options.confirmText || "删除",
            tone: "danger",
        }).then((confirmed) => {
            if (confirmed) return options.onConfirm();
        });
    };

    return { confirmDelete };
}
