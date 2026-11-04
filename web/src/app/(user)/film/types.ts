export type FilmStage = "script" | "storyboard";

export type FilmShotStatus = "idle" | "image_ready" | "video_ready" | "failed";

export type FilmShot = {
    id: string;
    shotNo: string;
    shotType: string;
    duration: number;
    description: string;
    dialogue: string;
    audio: string;
    prompt: string;
    status: FilmShotStatus;
};

export type FilmScene = {
    id: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    shots: FilmShot[];
};

export type FilmEpisode = {
    id: string;
    title: string;
    scenes: FilmScene[];
};

export type FilmProject = {
    id: string;
    title: string;
    visualStyle: string;
    stage: FilmStage;
    scriptText: string;
    episodes: FilmEpisode[];
    createdAt: string;
    updatedAt: string;
};
