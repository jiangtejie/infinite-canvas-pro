import { Home, LogIn } from "lucide-react";
import Link from "next/link";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { PunkAura } from "@/components/ui/punk-aura";

export default function NotFound() {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AnnouncementBanner />
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-transparent px-5 py-10 text-foreground">
                <section className="relative isolate w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card/70 px-7 py-10 text-center backdrop-blur-xl sm:px-10">
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"><PunkAura className="punk-aura opacity-50" /></div>
                    <div aria-hidden className="neon-bloom-a -left-8 top-0 h-[180px] w-[240px] opacity-60" />
                    <div aria-hidden className="hazard-tape absolute right-0 top-0 h-1.5 w-24 opacity-60" />
                    <span className="eyebrow relative inline-flex items-center gap-2"><span className="punk-signal" aria-hidden />404 / NOT FOUND</span>
                    <div className="relative mt-6 font-mono text-6xl font-semibold tracking-tight text-foreground/90">
                        4<span className="text-acid">0</span>4
                    </div>
                    <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">页面不存在</h1>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">这个地址没有对应的页面，可能已经移动或被合并。</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground! px-4 text-sm font-medium text-background! transition hover:opacity-90">
                            <Home className="size-4" />
                            返回首页
                        </Link>
                        <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background! px-4 text-sm font-medium text-foreground! transition hover:border-acid/45 hover:bg-accent!">
                            <LogIn className="size-4" />
                            去登录
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
