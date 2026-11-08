import { cn } from "@/lib/utils";

const AURA_BACKGROUND = [
    "radial-gradient(56% 58% at 18% 72%, var(--neon-b), transparent 70%)",
    "radial-gradient(52% 56% at 82% 26%, var(--neon-a), transparent 72%)",
    "repeating-radial-gradient(ellipse at 50% 28%, transparent 0 26px, color-mix(in oklch, var(--acid) 9%, transparent) 27px 28px, transparent 29px 54px)",
    "repeating-linear-gradient(0deg, transparent 0 41px, color-mix(in oklch, var(--foreground) 5%, transparent) 42px, transparent 43px)",
    "repeating-linear-gradient(90deg, transparent 0 41px, color-mix(in oklch, var(--foreground) 5%, transparent) 42px, transparent 43px)",
    "linear-gradient(115deg, transparent 32%, color-mix(in oklch, var(--acid) 8%, transparent) 48%, transparent 64%)",
].join(", ");

/**
 * 纯 CSS 朋克光场：之前是持续运行的 WebGL 着色器（全屏 rAF + 噪声 + 指针视差），
 * 在集显/笔记本上会长期占用 GPU，这里改为静态多层渐变，保留氛围但不再产生渲染开销。
 */
export function PunkAura({ className }: { className?: string }) {
    return <div aria-hidden="true" className={cn("punk-aura", className)} style={{ backgroundImage: AURA_BACKGROUND, backgroundBlendMode: "screen" }} />;
}
