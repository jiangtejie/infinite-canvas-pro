"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type Phase = "typing" | "deleting";

/**
 * 逐字打字效果。传字符串只打一次，传数组会打字、停留、删除后循环下一条。
 * 用最长的一条做不可见占位，避免逐字和切换时布局跳动。
 * 开启“减少动态效果”时保留打字但放慢速度，并去掉光标闪烁。
 */
export function TypewriterText({ text, speed = 62, deleteSpeed = 26, hold = 2400, startDelay = 200, className }: {
    text: string | string[];
    speed?: number;
    deleteSpeed?: number;
    hold?: number;
    startDelay?: number;
    className?: string;
}) {
    const phrases = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);
    const longest = useMemo(() => phrases.reduce((current, item) => (Array.from(item).length > Array.from(current).length ? item : current), phrases[0] || ""), [phrases]);
    const looping = phrases.length > 1;
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [count, setCount] = useState(0);
    const [phase, setPhase] = useState<Phase>("typing");
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(query.matches);
        const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const typingSpeed = reduced ? 110 : speed;
    const removalSpeed = reduced ? 70 : deleteSpeed;

    useEffect(() => {
        const chars = Array.from(phrases[phraseIndex] || "");
        if (phase === "typing") {
            if (count < chars.length) {
                const timer = window.setTimeout(() => setCount((value) => value + 1), count === 0 ? startDelay : typingSpeed);
                return () => window.clearTimeout(timer);
            }
            if (!looping) return undefined;
            const timer = window.setTimeout(() => setPhase("deleting"), hold);
            return () => window.clearTimeout(timer);
        }
        if (count > 0) {
            const timer = window.setTimeout(() => setCount((value) => value - 1), removalSpeed);
            return () => window.clearTimeout(timer);
        }
        const timer = window.setTimeout(() => {
            setPhraseIndex((value) => (value + 1) % phrases.length);
            setPhase("typing");
        }, 260);
        return () => window.clearTimeout(timer);
    }, [count, hold, looping, phase, phraseIndex, phrases, removalSpeed, startDelay, typingSpeed]);

    const visible = Array.from(phrases[phraseIndex] || "").slice(0, count).join("");
    const finished = !looping && count >= Array.from(phrases[0] || "").length;

    return (
        <span className={cn("relative inline-block max-w-full align-bottom", className)}>
            <span className="invisible" aria-hidden>
                {longest}
            </span>
            <span className="absolute inset-0 whitespace-pre-wrap" aria-hidden>
                {visible}
                {finished ? null : <span className={cn("ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.08em] bg-foreground", !reduced && "motion-safe:animate-pulse")} />}
            </span>
        </span>
    );
}
