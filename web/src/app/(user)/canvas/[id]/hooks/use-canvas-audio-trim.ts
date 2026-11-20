"use client";

import { useEffect, useRef, useState } from "react";

import type { CanvasNodeData } from "../../types";

type TrimMessage = { error: (text: string) => void };

export function useCanvasAudioTrim(node: CanvasNodeData | null, message: TrimMessage) {
    const [audioTrimStart, setAudioTrimStart] = useState(0);
    const [audioTrimEnd, setAudioTrimEnd] = useState(0);
    const [audioTrimDuration, setAudioTrimDuration] = useState(0);
    const [audioTrimPlaying, setAudioTrimPlaying] = useState(false);
    const audioTrimRef = useRef<HTMLAudioElement | null>(null);
    const audioTrimTooShort = Math.round((audioTrimEnd - audioTrimStart) * 100) < 50;

    useEffect(() => {
        setAudioTrimPlaying(false);
        const src = node?.metadata?.content;
        if (!src) return;

        const audio = new Audio(src);
        audioTrimRef.current = audio;
        audio.preload = "metadata";
        setAudioTrimStart(0);
        setAudioTrimEnd(0);
        setAudioTrimDuration(0);

        audio.onloadedmetadata = () => {
            const duration = Number.isFinite(audio.duration) ? Math.floor(audio.duration * 100) / 100 : 0;
            setAudioTrimDuration(duration);
            setAudioTrimEnd(duration);
        };
        audio.onplay = () => setAudioTrimPlaying(true);
        audio.onpause = () => setAudioTrimPlaying(false);
        audio.onended = () => setAudioTrimPlaying(false);
        audio.onerror = () => message.error("音频加载失败");

        return () => {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            audioTrimRef.current = null;
        };
    }, [node?.id, node?.metadata?.content, message]);

    useEffect(() => {
        if (!audioTrimPlaying) return;

        let frame = 0;
        const checkEnd = () => {
            const audio = audioTrimRef.current;
            if (!audio || audio.paused) return;
            if (audio.currentTime >= audioTrimEnd) audio.pause();
            else frame = requestAnimationFrame(checkEnd);
        };

        frame = requestAnimationFrame(checkEnd);
        return () => cancelAnimationFrame(frame);
    }, [audioTrimEnd, audioTrimPlaying]);

    return { audioTrimStart, setAudioTrimStart, audioTrimEnd, setAudioTrimEnd, audioTrimDuration, audioTrimPlaying, audioTrimTooShort, audioTrimRef };
}
