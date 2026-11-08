"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button, Input, Modal } from "antd";
import { AlertTriangle, HelpCircle, PenLine, Trash2 } from "lucide-react";

export type ConfirmTone = "danger" | "warning" | "default";

export type ConfirmOptions = {
    title: string;
    description?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    tone?: ConfirmTone;
    icon?: ReactNode;
};

const toneStyles: Record<ConfirmTone, { icon: string; fallback: ReactNode }> = {
    danger: { icon: "bg-red-500/10 text-red-500", fallback: <Trash2 className="size-4" /> },
    warning: { icon: "bg-amber-500/10 text-amber-500", fallback: <AlertTriangle className="size-4" /> },
    default: { icon: "bg-primary/10 text-primary", fallback: <HelpCircle className="size-4" /> },
};

function ConfirmDialogBody({ title, description, confirmText = "确认", cancelText = "取消", tone = "default", icon, loading = false, onConfirm, onCancel }: ConfirmOptions & { loading?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
    const [pending, setPending] = useState(false);
    const tones = toneStyles[tone];
    const handleConfirm = async () => {
        if (loading || pending) return;
        const result = onConfirm();
        if (result && typeof (result as Promise<void>).then === "function") {
            setPending(true);
            try {
                await result;
            } finally {
                setPending(false);
            }
        }
    };
    return (
        <>
            <div className="flex items-start gap-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tones.icon}`}>{icon ?? tones.fallback}</span>
                <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h3>
                    {description ? <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</div> : null}
                </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
                <Button onClick={onCancel} disabled={pending || loading}>
                    {cancelText}
                </Button>
                <Button type="primary" danger={tone === "danger"} loading={pending || loading} onClick={() => void handleConfirm()}>
                    {confirmText}
                </Button>
            </div>
        </>
    );
}

const dialogStyles = {
    content: {
        padding: 20,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--popover)",
        boxShadow: "0 24px 64px -24px rgba(0, 0, 0, 0.55)",
    },
    body: { padding: 0 },
};

export function ConfirmDialog({ open, ...options }: ConfirmOptions & { open: boolean; loading?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
    return (
        <Modal open={open} onCancel={options.onCancel} footer={null} closable={false} centered width={400} mask={{ closable: false }} destroyOnHidden styles={dialogStyles}>
            <ConfirmDialogBody {...options} />
        </Modal>
    );
}

type ConfirmRequest = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error("useConfirm 必须在 ConfirmProvider 内使用");
    return confirm;
}

/** 全局确认弹窗：统一删除/危险操作的确认样式，返回用户是否确认。 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [request, setRequest] = useState<ConfirmRequest | null>(null);
    const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })), []);
    const settle = useCallback((value: boolean) => {
        setRequest((current) => {
            current?.resolve(value);
            return null;
        });
    }, []);
    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog
                open={Boolean(request)}
                title={request?.title ?? ""}
                description={request?.description}
                confirmText={request?.confirmText}
                cancelText={request?.cancelText}
                tone={request?.tone}
                icon={request?.icon}
                onConfirm={() => settle(true)}
                onCancel={() => settle(false)}
            />
        </ConfirmContext.Provider>
    );
}

export type PromptOptions = {
    title: string;
    description?: ReactNode;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    validate?: (value: string) => string | null;
};

type PromptRequest = PromptOptions & { resolve: (value: string | null) => void };

const PromptContext = createContext<((options: PromptOptions) => Promise<string | null>) | null>(null);

export function usePrompt() {
    const prompt = useContext(PromptContext);
    if (!prompt) throw new Error("usePrompt 必须在 PromptProvider 内使用");
    return prompt;
}

export function PromptProvider({ children }: { children: ReactNode }) {
    const [request, setRequest] = useState<PromptRequest | null>(null);
    const [value, setValue] = useState("");
    const [error, setError] = useState("");
    const prompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => setRequest({ ...options, resolve })), []);
    const open = Boolean(request);
    const settle = (result: string | null) => {
        setRequest((current) => {
            current?.resolve(result);
            return null;
        });
        setValue("");
        setError("");
    };
    const confirmValue = () => {
        if (!request) return;
        const nextError = request.validate?.(value) || (value.trim() ? "" : "请输入名称");
        if (nextError) {
            setError(nextError);
            return;
        }
        settle(value);
    };
    return (
        <PromptContext.Provider value={prompt}>
            {children}
            <Modal open={open} onCancel={() => settle(null)} footer={null} closable={false} centered width={400} mask={{ closable: false }} destroyOnHidden styles={dialogStyles} afterOpenChange={(visible) => { if (visible) { setValue(request?.defaultValue || ""); setError(""); } }}>
                <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <PenLine className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h3 className="text-[15px] font-semibold leading-5 text-foreground">{request?.title ?? ""}</h3>
                        {request?.description ? <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{request.description}</div> : null}
                        <div className="mt-3">
                            <Input autoFocus value={value} placeholder={request?.placeholder} onChange={(event) => { setValue(event.target.value); if (error) setError(""); }} onPressEnter={confirmValue} status={error ? "error" : undefined} />
                            {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
                        </div>
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <Button onClick={() => settle(null)}>{request?.cancelText || "取消"}</Button>
                    <Button type="primary" onClick={confirmValue}>{request?.confirmText || "确定"}</Button>
                </div>
            </Modal>
        </PromptContext.Provider>
    );
}
