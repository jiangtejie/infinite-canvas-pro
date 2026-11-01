"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type Phase = "typing" | "holding" | "deleting";

/**
 * 逐字打字效果。传字符串只打一次，传数组会打字、停留、删除后循环下一条。
 * 用最长的一条做不可见占位，避免逐字和切换时布局跳动；开启“减少动态效果”时直接显示第一条。
 */
export function TypewriterText({ text, speed = 70, deleteSpeed = 34, hold = 1600, startDelay = 200, className }: {
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
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        setReduced(true);
        setCount(Array.from(phrases[0] || "").length);
        setPhase("holding");
    }, [phrases]);

    useEffect(() => {
        if (reduced) return;
        const chars = Array.from(phrases[phraseIndex] || "");
        if (phase === "typing") {
            if (count < chars.length) {
                const timer = window.setTimeout(() => setCount((value) => value + 1), count === 0 ? startDelay : speed);
                return () => window.clearTimeout(timer);
            }
            if (!looping) return;
            const timer = window.setTimeout(() => setPhase("deleting"), hold);
            return () => window.clearTimeout(timer);
        }
        if (phase === "deleting") {
            if (count > 0) {
                const timer = window.setTimeout(() => setCount((value) => value - 1), deleteSpeed);
                return () => window.clearTimeout(timer);
            }
            const timer = window.setTimeout(() => {
                setPhraseIndex((value) => (value + 1) % phrases.length);
                setPhase("typing");
            }, 260);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [count, deleteSpeed, hold, looping, phase, phraseIndex, phrases, reduced, speed, startDelay]);

    const visible = Array.from(phrases[phraseIndex] || "").slice(0, count).join("");
    const finished = !looping && count >= Array.from(phrases[0] || "").length;
    const showCaret = !finished && !reduced;

    return (
        <span className={cn("relative inline-block max-w-full align-bottom", className)}>
            <span className="invisible" aria-hidden>
                {longest}
            </span>
            <span className="absolute inset-0 whitespace-pre-wrap" aria-hidden>
                {visible}
                {showCaret ? <span className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.08em] bg-current motion-safe:animate-pulse" /> : null}
            </span>
        </span>
    );
}
