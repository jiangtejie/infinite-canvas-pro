import type { FilmShot, FilmVideoMode, FilmVideoSegment } from "@/lib/film/types";
import { filmShotTypeLabel } from "./film-shot-types";

export type FilmShotPromptScene = {
    episodeTitle?: string;
    name?: string;
    location?: string;
    time?: string;
    mood?: string;
    notes?: string;
};

export type FilmShotPromptInput = {
    shot: FilmShot;
    medium: "image" | "video";
    scene?: FilmShotPromptScene;
    characters?: string[];
    location?: string;
    continuity?: string;
    style?: string;
    previousInstruction?: string;
    anchorInstruction?: string;
    videoSegments?: FilmVideoSegment[];
    videoMode?: FilmVideoMode;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
};

export type FilmShotPromptSection = {
    key: string;
    title: string;
    lines: string[];
};

export type FilmShotPromptSpec = {
    sections: FilmShotPromptSection[];
    negative: string[];
};

/** 把镜头的全部专业维度拆成结构化分区；图片/视频共用同一份 Spec。 */
export function buildFilmShotPromptSpec(input: FilmShotPromptInput): FilmShotPromptSpec {
    const { shot, medium, scene } = input;
    const sections: FilmShotPromptSection[] = [];
    const push = (key: string, title: string, lines: Array<string | false | undefined>) => {
        const clean = lines.filter((line): line is string => Boolean(line && line.trim())).map((line) => line.trim());
        if (clean.length) sections.push({ key, title, lines: clean });
    };

    const sceneTitle = [scene?.episodeTitle, scene?.name].filter(Boolean).join(" · ");
    push("scene", "场景", [
        sceneTitle && `场次：${sceneTitle}`,
        scene?.location && `地点：${scene.location}`,
        scene?.time && `时间：${scene.time}`,
        scene?.mood && `氛围：${scene.mood}`,
        scene?.notes && `场次备注：${scene.notes}`,
    ]);
    push("characters", "角色与场景", [...(input.characters || []), input.location || ""]);
    push("subject", "主体与动作", [shot.description && `画面动作：${shot.description}`]);

    const camera = [
        shot.shotType && `景别：${filmShotTypeLabel(shot.shotType)}`,
        shot.cameraMovement && `运镜：${shot.cameraMovement}`,
        shot.composition && `构图：${shot.composition}`,
        shot.lighting && `光线：${shot.lighting}`,
        shot.colorTone && `色彩：${shot.colorTone}`,
        shot.lens && `焦段：${shot.lens}`,
        shot.transition && `转场：${shot.transition}`,
    ].filter((item): item is string => Boolean(item));
    push("camera", "镜头语言", camera.length ? [camera.join("；")] : []);

    const performance = shot.performance;
    const performanceLines = [
        performance?.objective && `目标：${performance.objective}`,
        performance?.emotion && `情绪：${performance.emotion}`,
        performance?.subtext && `潜台词：${performance.subtext}`,
        performance?.bodyLanguage && `肢体：${performance.bodyLanguage}`,
        performance?.intensity && `强度：${performance.intensity}/5`,
    ].filter((item): item is string => Boolean(item));
    push("performance", "表演", performanceLines.length ? [performanceLines.join("；")] : []);

    push("coverage", "叙事作用", [shot.coverage && `覆盖：${shot.coverage}`]);

    const sound = shot.soundDesign;
    const soundLines = [
        shot.audio && `声音参考：${shot.audio}`,
        sound?.ambience && `环境声：${sound.ambience}`,
        sound?.sfx && `音效：${sound.sfx}`,
        sound?.music && `音乐：${sound.music}`,
        ...(medium === "video" ? [
            sound?.dialogueTone && `台词语气：${sound.dialogueTone}`,
            shot.dialogue && `台词：${shot.dialogue}`,
        ] : []),
    ].filter((item): item is string => Boolean(item));
    push("sound", medium === "video" ? "声音" : "声音氛围", soundLines.length ? [soundLines.join("；")] : []);

    push("continuity", "连续性", input.continuity ? input.continuity.split(/\n+/) : []);
    push("style", "视觉风格", input.style ? [input.style] : []);
    push("direction", "创作补充", shot.prompt ? shot.prompt.split(/\n+/) : []);
    if (medium === "video") push("action", "动作补充", shot.videoPrompt ? [shot.videoPrompt] : []);
    push("references", "参考衔接", [input.previousInstruction, input.anchorInstruction]);

    if (medium === "video" && input.videoSegments?.length) {
        const timeline = [...input.videoSegments]
            .sort((left, right) => left.start - right.start)
            .map((segment) => `${formatSeconds(segment.start)}-${formatSeconds(segment.end)}s：${segment.prompt.trim() || "保持当前画面状态"}`)
            .join("；");
        push("timeline", "时间节拍", [timeline]);
    }

    if (medium === "video") {
        const constraints = input.videoMode === "frames"
            ? [
                input.hasFirstFrame && "保持首帧中的人物外观、构图与光线，不要切镜。",
                input.hasLastFrame && "最后一段需要落在尾帧指定的人物状态、构图与光线上。",
            ]
            : ["保持角色与场景外观一致，不要切镜。"];
        push("video-constraints", "视频约束", constraints);
    }

    const negative = [
        shot.negativePrompt?.trim(),
        medium === "video" ? "画面跳变、镜头切换、人物变形、闪烁、字幕与水印" : "",
    ].filter((value): value is string => Boolean(value));
    return { sections, negative };
}

export function renderFilmShotPromptSpec(spec: FilmShotPromptSpec) {
    const blocks = spec.sections.map((section) => `【${section.title}】\n${section.lines.join("\n")}`);
    if (spec.negative.length) blocks.push(`【避免】\n${spec.negative.join("；")}`);
    return blocks.join("\n\n");
}

export function buildFilmShotPrompt(input: FilmShotPromptInput) {
    return renderFilmShotPromptSpec(buildFilmShotPromptSpec(input));
}

function formatSeconds(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
