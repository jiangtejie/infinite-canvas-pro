import type { Metadata } from "next";
import Script from "next/script";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AppProviders } from "@/components/layout/app-providers";
import { appFontFamily } from "@/lib/app-font";
import "./globals.css";
import React from "react";

export const metadata: Metadata = {
    title: {
        default: "矩灵AI",
        template: "%s | 矩灵AI",
    },
    description: "面向 AI 自媒体的创作工作台，画布、生图、视频与素材一站式完成",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" suppressHydrationWarning className="font-sans">
            <head>
                <link rel="preconnect" href="https://gcore.jsdelivr.net" crossOrigin="" />
                <link rel="dns-prefetch" href="https://gcore.jsdelivr.net" />
            </head>
            <body
                suppressHydrationWarning
                className="bg-background text-foreground antialiased"
                style={{ fontFamily: appFontFamily }}
            >
                <Script
                    id="theme-script"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `try{var s=JSON.parse(localStorage.getItem("infinite-canvas:theme_store")||"{}");var t=s.state&&s.state.theme==="light"?"light":"dark";document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t}catch(e){}`,
                    }}
                />
                <AntdRegistry>
                    <AppProviders>{children}</AppProviders>
                </AntdRegistry>
            </body>
        </html>
    );
}
