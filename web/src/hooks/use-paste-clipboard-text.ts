"use client";

import { App } from "antd";

/** 统一的「从剪贴板粘贴文本」入口：读到非空文本交给 onPaste，空/失败统一提示。 */
export function usePasteClipboardText() {
    const { message } = App.useApp();
    return async (onPaste: (text: string) => void) => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (!text) {
                message.error("剪切板里没有可读取的文本");
                return;
            }
            onPaste(text);
            message.success("已读取剪切板文本");
        } catch {
            message.error("剪切板里没有可读取的文本");
        }
    };
}