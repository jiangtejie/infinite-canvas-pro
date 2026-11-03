"use client";

import { useEffect, useRef, useState } from "react";
import { Carousel, type GetRef } from "antd";
import { Megaphone, X } from "lucide-react";

const ANNOUNCEMENTS = [
    <><Megaphone />TokenDance X 百亿 Token 补贴，一键登录即可接入，SD 2 Mini 低至 0.09元/秒 <a href="https://tokendance.space/" target="_blank" rel="noopener" className="text-[#e9e9e2]! underline! underline-offset-2">查看详情</a></>,
    <><Megaphone />无限画布现已支持 RunningHub X ComfyUI 工作流</>,
    <><Megaphone />微信交流群现已开放 <a href="https://qr.tdeh.uk/ai" target="_blank" rel="noopener" className="text-[#e9e9e2]! underline! underline-offset-2">扫码加入</a></>,
];
const DISMISSED_KEY = "infinite-canvas:announcement-dismissed";

export function AnnouncementBanner() {
    const [visible, setVisible] = useState(false);
    const [slide, setSlide] = useState({ index: 0, direction: "right" });
    const [paused, setPaused] = useState(false);
    const carouselRef = useRef<GetRef<typeof Carousel>>(null);

    useEffect(() => {
        try {
            setVisible(localStorage.getItem(DISMISSED_KEY) !== "1");
        } catch {
            setVisible(true);
        }
    }, []);

    if (!visible || !ANNOUNCEMENTS.length) return null;

    return (
        <section
            aria-label="站点公告"
            className="relative min-h-10 w-full shrink-0 border-b border-border/70 bg-[#0b0b09] text-[#e9e9e2]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-1 bg-acid sm:block" />
            <span className="pointer-events-none absolute left-5 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] text-acid uppercase sm:flex">
                <span className="size-1.5 bg-acid" />
                公告
            </span>
            <Carousel
                ref={carouselRef}
                autoplay={ANNOUNCEMENTS.length > 1 && !paused}
                autoplaySpeed={5000}
                effect="fade"
                speed={0}
                beforeChange={(_, next) => setSlide((current) => current.index === next ? current : { index: next, direction: "right" })}
                adaptiveHeight
                dots={false}
                rootClassName="isolate"
            >
                {ANNOUNCEMENTS.map((content, index) => (
                    <div key={index}>
                        <div className={`flex min-h-10 items-center justify-center gap-2 py-1 pr-14 pl-9 text-center text-[13px] text-[#e9e9e2] duration-300 in-[.slick-active]:animate-in in-[.slick-active]:fade-in sm:px-12 sm:text-sm ${slide.direction === "left" ? "in-[.slick-active]:slide-in-from-left-2" : "in-[.slick-active]:slide-in-from-right-2"}`}>
                            <span className="min-w-0 font-medium leading-[1.7] break-words [&_a]:whitespace-nowrap [&_a]:text-inherit [&_a]:underline-offset-2 [&_svg]:mr-2 [&_svg]:inline-block [&_svg]:size-4 [&_svg]:-translate-y-[2px] [&_svg]:align-middle">{content}</span>
                        </div>
                    </div>
                ))}
            </Carousel>
            {ANNOUNCEMENTS.length > 1 && (
                <div aria-label="选择公告" className="group/indicators absolute bottom-0.5 left-1/2 flex max-w-40 -translate-x-1/2">
                    {ANNOUNCEMENTS.map((_, index) => (
                        <button
                            key={index}
                            type="button"
                            aria-label={`显示第 ${index + 1} 条公告`}
                            aria-current={slide.index === index ? true : undefined}
                            className={`group/item flex h-2.5 shrink cursor-pointer items-end justify-center rounded-sm px-1 pb-0.5 transition-[width] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${slide.index === index ? "w-9" : "w-5"}`}
                            onClick={() => {
                                if (index === slide.index) return;
                                setSlide({ index, direction: index < slide.index ? "left" : "right" });
                                carouselRef.current?.goTo(index);
                            }}
                        >
                            <span className={`h-0.5 w-full rounded-full transition-[height,background-color] duration-150 group-hover/indicators:h-1.5 ${slide.index === index ? "bg-acid" : "bg-white/25 group-hover/item:bg-white/50"}`} />
                        </button>
                    ))}
                </div>
            )}
            <button
                type="button"
                aria-label="关闭公告"
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                onClick={() => {
                    setVisible(false);
                    try {
                        localStorage.setItem(DISMISSED_KEY, "1");
                    } catch {}
                }}
            >
                <X className="size-4" />
            </button>
        </section>
    );
}
