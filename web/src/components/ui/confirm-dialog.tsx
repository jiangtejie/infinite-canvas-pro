"use client";

import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from "react";
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
    /** 弹窗宽度，默认 440；长内容审阅用更宽的值。 */
    width?: number | string;
    /** 正文放到标题下方占满整行，适合长内容；默认与标题同列。 */
    stacked?: boolean;
};

const toneStyles: Record<ConfirmTone, { fallback: ReactNode; style: CSSProperties }> = {
    danger: {
        fallback: <Trash2 className="size-5" />,
        style: {
            background: "color-mix(in oklch, var(--destructive) 12%, transparent)",
            color: "var(--destructive)",
            boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--destructive) 22%, transparent)",
        },
    },
    warning: {
        fallback: <AlertTriangle className="size-5" />,
        style: {
            background: "color-mix(in oklch, #f59e0b 12%, transparent)",
            color: "#f59e0b",
            boxShadow: "inset 0 0 0 1px color-mix(in oklch, #f59e0b 24%, transparent)",
        },
    },
    default: {
        fallback: <HelpCircle className="size-5" />,
        style: {
            background: "var(--acid-soft)",
            color: "color-mix(in oklch, var(--acid) 62%, var(--foreground))",
            boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--acid) 28%, transparent)",
        },
    },
};

function DialogHeader({ title, description, tone = "default", icon, stacked = false }: { title: string; description?: ReactNode; tone?: ConfirmTone; icon?: ReactNode; stacked?: boolean }) {
    const tones = toneStyles[tone];
    return (
        <div>
            <div className={`flex items-start gap-4 px-6 pt-6 ${stacked && description ? "pb-3" : "pb-5"}`}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={tones.style}>
                    {icon ?? tones.fallback}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="text-base font-semibold leading-6 tracking-[-0.01em] text-foreground">{title}</h3>
                    {!stacked && description ? <div className="mt-2 text-[13px] leading-6 text-muted-foreground">{description}</div> : null}
                </div>
            </div>
            {stacked && description ? <div className="px-6 pb-5 text-[13px] leading-6">{description}</div> : null}
        </div>
    );
}

function DialogFooter({ children }: { children: ReactNode }) {
    return (
        <div
            className="flex items-center justify-end gap-2.5 rounded-b-2xl px-6 py-4"
            style={{
                borderTop: "1px solid var(--border)",
                background: "color-mix(in oklch, var(--foreground) 3%, transparent)",
            }}
        >
            {children}
        </div>
    );
}

function ConfirmDialogBody({ title, description, confirmText = "确认", cancelText = "取消", tone = "default", icon, stacked, loading = false, onConfirm, onCancel }: ConfirmOptions & { loading?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
    const [pending, setPending] = useState(false);
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
        <div className="flex flex-col">
            <DialogHeader title={title} description={description} tone={tone} icon={icon} stacked={stacked} />
            <DialogFooter>
                <Button size="large" className="!min-w-[88px]" onClick={onCancel} disabled={pending || loading}>
                    {cancelText}
                </Button>
                <Button size="large" className="!min-w-[88px]" type="primary" danger={tone === "danger"} loading={pending || loading} onClick={() => void handleConfirm()}>
                    {confirmText}
                </Button>
            </DialogFooter>
        </div>
    );
}

const dialogStyles = {
    content: {
        padding: 0,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--popover)",
        boxShadow: "inset 0 1px 0 var(--glass-highlight), 0 32px 80px -32px rgba(0, 0, 0, 0.62)",
    },
    body: { padding: 0 },
};

export function ConfirmDialog({ open, ...options }: ConfirmOptions & { open: boolean; loading?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
    return (
        <Modal open={open} onCancel={options.onCancel} footer={null} closable={false} centered width={options.width ?? 440} mask={{ closable: false }} destroyOnHidden styles={dialogStyles}>
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
                width={request?.width}
                stacked={request?.stacked}
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
            <Modal open={open} onCancel={() => settle(null)} footer={null} closable={false} centered width={440} mask={{ closable: false }} destroyOnHidden styles={dialogStyles} afterOpenChange={(visible) => { if (visible) { setValue(request?.defaultValue || ""); setError(""); } }}>
                <div className="flex flex-col">
                    <DialogHeader title={request?.title ?? ""} description={request?.description} tone="default" icon={<PenLine className="size-5" />} />
                    <div className="px-6 pb-5">
                        <Input size="large" autoFocus value={value} placeholder={request?.placeholder} onChange={(event) => { setValue(event.target.value); if (error) setError(""); }} onPressEnter={confirmValue} status={error ? "error" : undefined} />
                        {error ? <p className="mt-1.5 text-xs text-red-500">{error}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button size="large" className="!min-w-[88px]" onClick={() => settle(null)}>
                            {request?.cancelText || "取消"}
                        </Button>
                        <Button size="large" className="!min-w-[88px]" type="primary" onClick={confirmValue}>
                            {request?.confirmText || "确定"}
                        </Button>
                    </DialogFooter>
                </div>
            </Modal>
        </PromptContext.Provider>
    );
}
