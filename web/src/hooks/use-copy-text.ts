"use client";

import { useCallback } from "react";
import { App } from "antd";
import copy from "copy-to-clipboard";

export function useCopyText() {
    const { message } = App.useApp();

    return useCallback((value: string, successText = "已复制") => {
        if (!copy(value)) {
            message.error("复制失败，请手动选择文本");
            return;
        }
        message.success(successText);
    }, [message]);
}
