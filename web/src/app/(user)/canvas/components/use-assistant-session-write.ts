"use client";

import { useCallback, useRef } from "react";

import type { CanvasAssistantMessage, CanvasAssistantSession } from "../types";

/**
 * 助手会话的读写与选中会话同步：面板只负责渲染，写入统一走这里。
 */
export function useAssistantSessionWrite(onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null) => void) {
    const sessionsRef = useRef<CanvasAssistantSession[]>([]);
    const activeSessionIdRef = useRef<string | null>(null);

    const syncSessions = useCallback((sessions: CanvasAssistantSession[], activeSessionId: string | null) => {
        sessionsRef.current = sessions;
        activeSessionIdRef.current = activeSessionId;
    }, []);

    const commitSessions = useCallback(
        (nextSessions: CanvasAssistantSession[], nextActiveSessionId: string | null = activeSessionIdRef.current) => {
            sessionsRef.current = nextSessions;
            activeSessionIdRef.current = nextActiveSessionId;
            onSessionsChange(nextSessions, nextActiveSessionId);
        },
        [onSessionsChange],
    );

    const updateSession = useCallback(
        (sessionId: string, updater: (session: CanvasAssistantSession) => CanvasAssistantSession) => {
            commitSessions(sessionsRef.current.map((session) => (session.id === sessionId ? updater(session) : session)));
        },
        [commitSessions],
    );

    const appendMessage = useCallback(
        (sessionId: string, message: CanvasAssistantMessage) => {
            updateSession(sessionId, (session) => ({
                ...session,
                title: session.messages.length ? session.title : message.text.slice(0, 18) || "新对话",
                messages: [...session.messages, message],
                updatedAt: new Date().toISOString(),
            }));
        },
        [updateSession],
    );

    const updateMessage = useCallback(
        (sessionId: string, messageId: string, patch: Partial<CanvasAssistantMessage>) => {
            updateSession(sessionId, (session) => ({
                ...session,
                messages: session.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
                updatedAt: new Date().toISOString(),
            }));
        },
        [updateSession],
    );

    return { sessionsRef, activeSessionIdRef, syncSessions, commitSessions, updateSession, appendMessage, updateMessage };
}
