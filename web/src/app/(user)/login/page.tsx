"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Segmented } from "antd";
import { Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PunkAura } from "@/components/ui/punk-aura";
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
    const isLoading = useUserStore((state) => state.isLoading);
    const allowRegister = useConfigStore((state) => state.publicSettings?.auth?.allowRegister !== false);
    const [mode, setMode] = useState<"login" | "register">("login");
    const redirect = safeRedirect(searchParams.get("redirect"));

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
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-transparent px-4 py-8 sm:px-6 sm:py-12">
            <div className="relative grid w-full max-w-[980px] overflow-hidden rounded-2xl border border-border bg-card/60 shadow-[0_40px_90px_-60px_rgba(0,0,0,0.8)] backdrop-blur-xl lg:grid-cols-[1.08fr_1fr]">
                <aside className="relative isolate hidden flex-col justify-between overflow-hidden border-r border-border/70 p-10 lg:flex">
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"><PunkAura className="punk-aura opacity-70" /></div>
                    <div aria-hidden className="neon-bloom-a -left-10 top-10 h-[240px] w-[300px] opacity-70" />
                    <div aria-hidden className="neon-bloom-b -bottom-16 right-0 h-[220px] w-[280px] opacity-50" />
                    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle,var(--grid-dot)_1px,transparent_1.2px)] [background-size:16px_16px] opacity-50" />
                    <div className="relative">
                        <span className="eyebrow">无限画布 / STUDIO</span>
                        <h2 className="mt-7 text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.045em] text-foreground">
                            登录，
                            <br />
                            让灵感继续。
                        </h2>
                        <p className="mt-5 max-w-[19rem] text-sm leading-7 text-muted-foreground">画布、素材与工作流在账号内同步；未登录时也可以先在本地创作。</p>
                    </div>
                    <ul className="relative mt-10 space-y-3 text-sm text-muted-foreground">
                        {["画布与生成记录自动保存", "素材跨设备同步", "工作流模板一次编排、反复复用"].map((item) => (
                            <li key={item} className="flex items-center gap-2.5">
                                <span className="grid size-4 shrink-0 place-items-center rounded-[2px] bg-acid text-[#0b0b09]">
                                    <Check className="size-3" strokeWidth={3} />
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className="relative mt-10 font-mono text-[10px] tracking-[0.22em] text-muted-foreground/50 uppercase">AI CREATION WORKSPACE</p>
                </aside>

                <section className="relative p-6 sm:p-9">
                    <div className="mb-7 flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-[3px] bg-acid">
                            <span
                                className="size-[18px] bg-[#0b0b09]"
                                style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }}
                                aria-label="无限画布"
                            />
                        </span>
                        <span className="text-[15px] font-semibold tracking-tight">无限画布</span>
                    </div>

                    <div className="mb-6">
                        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase">{mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}</p>
                        <h1 className="mt-2.5 text-2xl font-semibold tracking-[-0.02em] text-foreground">{mode === "register" ? "创建账号" : "账号登录"}</h1>
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
                        <Form.Item name="username" label={<span className="text-xs font-medium tracking-wide text-muted-foreground">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                            <Input prefix={<UserOutlined />} autoComplete="username" placeholder="请输入用户名" />
                        </Form.Item>
                        <Form.Item name="password" label={<span className="text-xs font-medium tracking-wide text-muted-foreground">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="请输入密码" />
                        </Form.Item>
                        {mode === "register" ? (
                            <Form.Item name="confirmPassword" label={<span className="text-xs font-medium tracking-wide text-muted-foreground">确认密码</span>} rules={[{ required: true, message: "请再次输入密码" }]}>
                                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" placeholder="请再次输入密码" />
                            </Form.Item>
                        ) : null}
                        <Button block type="primary" htmlType="submit" loading={isLoading} className="!mt-2">
                            {mode === "register" ? "注册并进入" : "登录"}
                        </Button>
                    </Form>
                    <p className="mt-6 font-mono text-[10px] leading-5 tracking-[0.12em] text-muted-foreground/50 uppercase">本地创作无需登录 · 登录后同步至账号</p>
                </section>
            </div>
        </main>
    );
}
