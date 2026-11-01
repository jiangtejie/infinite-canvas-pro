"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Segmented } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { fetchCurrentUser } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = {
    username: string;
    password: string;
    confirmPassword?: string;
};

// 仅放行站内相对路径，拦截开放重定向。浏览器会忽略 URL 中的 Tab/换行/回车，并把
// //host 或 /\host 解析为协议相对的跨站地址，因此先剥离控制字符，再拒绝 // 与 /\ 前缀。
function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/";
    }
    return cleaned;
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const login = useUserStore((state) => state.login);
    const register = useUserStore((state) => state.register);
    const setSession = useUserStore((state) => state.setSession);
    const isLoading = useUserStore((state) => state.isLoading);
    const allowRegister = useConfigStore((state) => state.publicSettings?.auth?.allowRegister !== false);
    const [mode, setMode] = useState<"login" | "register">("login");
    const redirect = safeRedirect(searchParams.get("redirect"));

    useEffect(() => {
        const token = searchParams.get("token");
        const error = searchParams.get("error");
        if (error) message.error(error);
        if (!token) return;
        void fetchCurrentUser(token).then((user) => {
            setSession(token, user);
            message.success("登录成功");
            router.replace(redirect);
            router.refresh();
        });
    }, [message, redirect, router, searchParams, setSession]);

    useEffect(() => {
        if (!allowRegister && mode === "register") setMode("login");
    }, [allowRegister, mode]);

    const submit = async (values: LoginFormValues) => {
        try {
            if (mode === "register" && !allowRegister) {
                message.error("当前未开放注册");
                return;
            }
            if (mode === "register" && values.password !== values.confirmPassword) {
                message.error("两次输入的密码不一致");
                return;
            }
            const action = mode === "register" ? register : login;
            const user = await action({ username: values.username, password: values.password });
            message.success(mode === "register" ? "注册成功" : "登录成功");
            router.replace(redirect);
            router.refresh();
            if (user.role !== "admin") router.replace("/");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background px-6 py-10">
            <section className="w-full max-w-[420px]">
                <div className="mb-7 text-center">
                    <span
                        className="mx-auto mb-4 block size-12 bg-foreground"
                        style={{
                            mask: "url(/logo.svg) center / contain no-repeat",
                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                        }}
                        aria-label="无限画布"
                    />
                    <h1 className="text-3xl font-semibold tracking-normal text-foreground">账号登录</h1>
                </div>

                <Form<LoginFormValues> layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                    <Form.Item>
                        <Segmented
                            block
                            value={mode}
                            onChange={(value) => setMode(value as "login" | "register")}
                            options={allowRegister ? [{ label: "登录", value: "login" }, { label: "注册", value: "register" }] : [{ label: "登录", value: "login" }]}
                        />
                    </Form.Item>
                    <Form.Item name="username" label={<span className="font-medium text-foreground">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                        <Input prefix={<UserOutlined />} autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label={<span className="font-medium text-foreground">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
                    </Form.Item>
                    {mode === "register" ? (
                        <Form.Item name="confirmPassword" label={<span className="font-medium text-foreground">确认密码</span>} rules={[{ required: true, message: "请再次输入密码" }]}>
                            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                        </Form.Item>
                    ) : null}
                    <Button block type="primary" htmlType="submit" loading={isLoading}>
                        {mode === "register" ? "注册" : "登录"}
                    </Button>
                </Form>
            </section>
        </main>
    );
}
