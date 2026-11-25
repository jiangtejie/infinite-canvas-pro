"use client";

import { Button } from "antd";
import { Lock, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ScriptEpisode } from "../types";
import { scriptSceneCompleteness } from "../utils/script-project";

type ScriptEpisodeSwitcherProps = {
    episodes: ScriptEpisode[];
    value: string;
    onChange: (id: string) => void;
    onAdd: () => Promise<void>;
};

export function ScriptEpisodeSwitcher({ episodes, value, onChange, onAdd }: ScriptEpisodeSwitcherProps) {
    return (
        <div className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="剧集切换">
            {episodes.map((episode) => {
                const completeness = episode.scenes.length
                    ? Math.round(episode.scenes.reduce((total, scene) => total + scriptSceneCompleteness(scene), 0) / episode.scenes.length)
                    : 0;
                const locked = Boolean(episode.lockedVersionId || episode.lockedVersionHash);
                return (
                    <button
                        key={episode.id}
                        type="button"
                        onClick={() => onChange(episode.id)}
                        aria-pressed={value === episode.id}
                        className={cn("flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors", value === episode.id ? "bg-acid/10 text-acid" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}
                    >
                        <span className="min-w-0">
                            <span className="flex items-center gap-1 text-[11px] font-medium">{episode.title}{locked ? <Lock className="size-2.5" /> : null}</span>
                            <span className="mt-0.5 block font-mono text-[8px] opacity-60">{episode.scenes.length} 场 · {completeness}%</span>
                        </span>
                    </button>
                );
            })}
            <Button size="small" type="text" icon={<Plus className="size-3" />} onClick={() => void onAdd()} className="shrink-0">加一集</Button>
        </div>
    );
}
