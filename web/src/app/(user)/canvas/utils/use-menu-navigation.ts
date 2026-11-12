"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

type MenuEscapeScope = "document" | "panel" | "none";

type UseMenuNavigationOptions = {
    /** 菜单是否打开；常驻挂载的菜单传 true。 */
    open: boolean;
    onClose: () => void;
    /** 菜单容器。 */
    panelRef: RefObject<HTMLElement | null>;
    /** 触发按钮：Esc 关闭后回焦，点外关闭时自动忽略它。 */
    triggerRef?: RefObject<HTMLElement | null>;
    /** 菜单项选择器，默认 "[role='menuitem']:not([disabled])"。 */
    itemSelector?: string;
    /** 打开时是否聚焦第一项，默认 true。 */
    autoFocus?: boolean;
    /** Esc 监听位置：document 全局（工具条下拉）、panel 菜单内（右键/创建菜单）；none 不处理。默认 "panel"。 */
    escapeScope?: MenuEscapeScope;
    /** panel 模式下 Esc 是否阻止冒泡；右键菜单保持 false，与画布 Esc 清理共存。默认 true。 */
    stopEscapePropagation?: boolean;
    /** 点外 pointerdown 关闭，默认 true。 */
    closeOnOutsidePointer?: boolean;
    /** 点外关闭时额外忽略的元素（例如包裹触发按钮的容器）。 */
    ignoreRef?: RefObject<HTMLElement | null>;
    /** 点外关闭时忽略的选择器（例如 ".ant-popover"）。 */
    ignoreSelector?: string;
    /** resize/滚动时关闭，默认 false。 */
    closeOnViewportChange?: boolean;
};

const DEFAULT_ITEM_SELECTOR = "[role='menuitem']:not([disabled])";

/** 画布浮层菜单的统一键盘漫游与关闭逻辑：方向键/Home/End、Esc 关闭、点外关闭。 */
export function useMenuNavigation({
    open,
    onClose,
    panelRef,
    triggerRef,
    itemSelector = DEFAULT_ITEM_SELECTOR,
    autoFocus = true,
    escapeScope = "panel",
    stopEscapePropagation = true,
    closeOnOutsidePointer = true,
    ignoreRef,
    ignoreSelector,
    closeOnViewportChange = false,
}: UseMenuNavigationOptions) {
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
        const panel = panelRef.current;
        if (!panel) return;
        if (event.key === "Escape") {
            if (escapeScope !== "panel") return;
            event.preventDefault();
            if (stopEscapePropagation) event.stopPropagation();
            onCloseRef.current();
            triggerRef?.current?.focus({ preventScroll: true });
            return;
        }
        const items = Array.from(panel.querySelectorAll<HTMLElement>(itemSelector));
        if (!items.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const current = items.indexOf(document.activeElement as HTMLElement);
            const offset = event.key === "ArrowDown" ? 1 : -1;
            items[(current + offset + items.length) % items.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        }
    }, [escapeScope, itemSelector, panelRef, stopEscapePropagation, triggerRef]);

    useEffect(() => {
        if (!open || !autoFocus) return;
        panelRef.current?.querySelector<HTMLElement>(itemSelector)?.focus({ preventScroll: true });
    }, [autoFocus, itemSelector, open, panelRef]);

    useEffect(() => {
        if (!open || escapeScope !== "document") return;
        const closeOnEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onCloseRef.current();
            triggerRef?.current?.focus({ preventScroll: true });
        };
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [escapeScope, open, triggerRef]);

    useEffect(() => {
        if (!open || !closeOnOutsidePointer) return;
        const closeOnPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (panelRef.current?.contains(target)) return;
            if (triggerRef?.current?.contains(target)) return;
            if (ignoreRef?.current?.contains(target)) return;
            if (ignoreSelector && target instanceof Element && target.closest(ignoreSelector)) return;
            onCloseRef.current();
        };
        const closeOnScroll = () => onCloseRef.current();
        document.addEventListener("pointerdown", closeOnPointerDown, true);
        if (closeOnViewportChange) {
            window.addEventListener("resize", closeOnScroll);
            window.addEventListener("scroll", closeOnScroll, true);
        }
        return () => {
            document.removeEventListener("pointerdown", closeOnPointerDown, true);
            if (closeOnViewportChange) {
                window.removeEventListener("resize", closeOnScroll);
                window.removeEventListener("scroll", closeOnScroll, true);
            }
        };
    }, [closeOnOutsidePointer, closeOnViewportChange, ignoreRef, ignoreSelector, open, panelRef, triggerRef]);

    return { handleKeyDown };
}
