"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { AlertTriangle } from "lucide-react";

export type FilmDeleteConfirmOptions = {
    title: string;
    description?: string;
    detail?: string;
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
};

export function FilmDeleteConfirmModal({ options, onCancel }: { options: FilmDeleteConfirmOptions | null; onCancel: () => void }) {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!options) setLoading(false);
    }, [options]);

    const confirm = async () => {
        if (!options) return;
        setLoading(true);
        try {
            await options.onConfirm();
            onCancel();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={Boolean(options)} footer={null} width={420} centered closable={false} mask={{ closable: !loading }} onCancel={onCancel} destroyOnHidden>
            {options ? (
                <div className="grid gap-4 pt-1">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-hot/35 bg-hot/10 text-hot">
                            <AlertTriangle className="size-5" />
                        </span>
                        <div className="grid min-w-0 gap-1">
                            <h3 className="break-words text-[15px] font-semibold leading-6 text-foreground">{options.title}</h3>
                            <p className="text-[11px] leading-5 text-muted-foreground/80">{options.description || "删除后无法恢复。"}</p>
                        </div>
                    </div>
                    {options.detail ? (
                        <div className="break-words rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-[10px] leading-5 text-muted-foreground/70">
                            {options.detail}
                        </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button size="large" disabled={loading} onClick={onCancel}>取消</Button>
                        <Button size="large" type="primary" danger loading={loading} onClick={() => void confirm()}>{options.confirmText || "删除"}</Button>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
