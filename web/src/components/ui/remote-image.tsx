"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

const REMOTE_IMAGE_TIMEOUT_MS = 10000;

/** 远程图片统一加载态：先骨架、超时或失败给占位，避免卡片出现无解释的空白。 */
export function RemoteImage({ src, alt, className, imgClassName }: { src: string; alt: string; className?: string; imgClassName?: string }) {
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setReady(false);
        setFailed(false);
        const timer = window.setTimeout(() => setFailed(true), REMOTE_IMAGE_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [src]);

    return (
        <div className={cn("relative overflow-hidden bg-muted/35", className)}>
            {!ready && !failed ? <span aria-hidden className="absolute inset-0 animate-pulse bg-muted/55" /> : null}
            {failed && !ready ? (
                <div role="img" aria-label={`${alt}（加载失败）`} className="absolute inset-0 grid place-items-center bg-muted/45 text-muted-foreground/50">
                    <ImageOff className="size-5" aria-hidden />
                </div>
            ) : null}
            <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className={cn("size-full object-cover transition-opacity duration-300", ready ? "opacity-100" : "opacity-0", imgClassName)}
                onLoad={() => setReady(true)}
                onError={() => setFailed(true)}
            />
        </div>
    );
}
