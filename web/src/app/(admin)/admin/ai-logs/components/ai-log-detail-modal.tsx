"use client";

import { Modal } from "antd";

import type { AiLogDetail } from "./ai-log-table-columns";

export function AiLogDetailModal({ detail, onClose }: { detail: AiLogDetail | null; onClose: () => void }) {
    return (
        <Modal title={detail?.title || "AI 调用详情"} open={Boolean(detail)} width="min(1100px, 92vw)" footer={null} onCancel={onClose} destroyOnHidden>
            <pre className="max-h-[72vh] whitespace-pre-wrap break-words overflow-auto rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-foreground">{detail?.value || "-"}</pre>
        </Modal>
    );
}
