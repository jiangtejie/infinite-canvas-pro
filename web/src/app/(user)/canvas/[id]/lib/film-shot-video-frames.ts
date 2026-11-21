import type { FilmFrameSource, FilmVideoMode } from "@/lib/film/types";
import type { VideoReferenceInput } from "@/services/api/video";
import type { ReferenceImage } from "@/types/image";
import type { FilmShotNodeData } from "../../types";

export function filmVideoMode(payload?: Pick<FilmShotNodeData, "videoMode">): FilmVideoMode {
    return payload?.videoMode === "frames" ? "frames" : "reference";
}

export function filmFrameReady(frame?: FilmFrameSource): boolean {
    return Boolean(frame?.url || frame?.storageKey);
}

export function filmVideoFrameBlockReason(mode: FilmVideoMode, firstFrame?: FilmFrameSource): string {
    return mode === "frames" && !filmFrameReady(firstFrame) ? "首尾帧模式需要先选择首帧" : "";
}

export function filmVideoInput(mode: FilmVideoMode, images: ReferenceImage[], shotId: string): VideoReferenceInput {
    if (mode === "frames") {
        return {
            firstFrame: images.find((image) => image.id === `${shotId}-first`) ?? null,
            lastFrame: images.find((image) => image.id === `${shotId}-last`) ?? null,
        };
    }
    return { references: images };
}
