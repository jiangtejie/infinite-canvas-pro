import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { WorkflowRef } from "@/lib/workflow-channel";

import type { GenerationLog } from "./history";

export type VideoTaskRun = { id: string; controller: AbortController; backend?: GenerationLog["taskBackend"]; submission?: Promise<GenerationLog>; poll?: Promise<void>; settledLog?: GenerationLog; stopping?: boolean };

export type VideoGenerationSnapshot = {
    text: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
    firstFrame?: ReferenceImage | null;
    lastFrame?: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    taskCount: number;
    workflowRef?: WorkflowRef | null;
};
