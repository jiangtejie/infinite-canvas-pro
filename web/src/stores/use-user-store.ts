"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { errorMessage } from "@/lib/utils";
import { AUTH_TOKEN_KEY, fetchCurrentUser, login, register, type AuthPayload, type AuthUser } from "@/services/api/auth";
import { errorStatus } from "@/services/api/request";

type UserStore = {
    token: string;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    /** 最近一次校验登录态失败的原因；网络错误时保留登录态，供 UI 提示。 */
    lastError: string;
    setSession: (token: string, user: AuthUser) => void;
    clearSession: () => void;
    hydrateUser: () => Promise<void>;
    login: (payload: AuthPayload) => Promise<AuthUser>;
    register: (payload: AuthPayload) => Promise<AuthUser>;
};

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            token: "",
            user: null,
            isReady: false,
            isLoading: false,
            lastError: "",
            setSession: (token, user) => set({ token, user, isReady: true, lastError: "" }),
            clearSession: () => set({ token: "", user: null, isReady: true, lastError: "" }),
            hydrateUser: async () => {
                const token = get().token;
                if (!token) {
                    set({ user: null, isReady: true });
                    return;
                }
                set({ isLoading: true });
                try {
                    const user = await fetchCurrentUser(token);
                    if (user.role === "guest") {
                        set({ token: "", user: null, isReady: true, isLoading: false, lastError: "" });
                        return;
                    }
                    set({ user, isReady: true, isLoading: false, lastError: "" });
                } catch (error) {
                    const message = errorMessage(error, "登录状态校验失败");
                    const status = errorStatus(error);
                    if (status === 401 || status === 403) {
                        set({ token: "", user: null, isReady: true, isLoading: false, lastError: message });
                        return;
                    }
                    // 网络错误/超时：保留登录态与已有用户信息，仅记录失败原因。
                    set({ isReady: true, isLoading: false, lastError: message });
                }
            },
            login: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await login(payload);
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
            register: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await register(payload);
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
        }),
        {
            name: AUTH_TOKEN_KEY,
            partialize: (state) => ({ token: state.token }),
            onRehydrateStorage: () => (state) => {
                if (state) state.isReady = false;
            },
        },
    ),
);
