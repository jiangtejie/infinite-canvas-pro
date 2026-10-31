import { Home, LogIn } from "lucide-react";
import Link from "next/link";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";

export default function NotFound() {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AnnouncementBanner />
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background px-6 py-10 text-foreground">
                <section className="w-full max-w-md text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-lg border border-border bg-card text-2xl font-semibold shadow-sm">404</div>
                    <h1 className="text-3xl font-semibold tracking-normal">页面不存在</h1>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">这个地址没有对应的页面，可能已经移动或被合并到其他入口。</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90">
                            <Home className="size-4" />
                            返回首页
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-accent"
                        >
                            <LogIn className="size-4" />
                            去登录
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
