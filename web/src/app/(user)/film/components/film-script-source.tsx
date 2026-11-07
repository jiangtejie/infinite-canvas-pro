"use client";

import { useState } from "react";
import { App, Button, Modal } from "antd";
import { ExternalLink, FileText, RefreshCw } from "lucide-react";

import { useScriptStore } from "../../script/stores/use-script-store";
import { createScriptDraft } from "../../script/utils/script-project";
import { buildFilmPlanFromDraft } from "../../script/utils/script-handoff";
import type { FilmProject } from "@/lib/film/types";
import { mergeFilmEpisodes } from "../utils/film-ai-parse";
import { bindFilmCast } from "../utils/film-cast-bind";

type ScriptPlanPreview = {
    scriptText: string;
    hash: string;
    episodeCount: number;
    shotCount: number;
    unchanged: boolean;
};

/** 影视工作台的剧本来源条：回看来源剧本，并按最新剧本覆盖/追加重新解析分镜。 */
export function FilmScriptSource({ project, onUpdate }: {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
}) {
    const { message } = App.useApp();
    const scriptProjects = useScriptStore((state) => state.projects);
    const scriptProject = project.scriptProjectId ? scriptProjects.find((item) => item.id === project.scriptProjectId) : undefined;
    const [preview, setPreview] = useState<ScriptPlanPreview | null>(null);

    if (!project.scriptProjectId) return null;

    const prepare = () => {
        if (!scriptProject) {
            message.warning("来源剧本已不存在，可能已被删除");
            return;
        }
        const plan = buildFilmPlanFromDraft(createScriptDraft(scriptProject, "重新同步用快照"));
        const shotCount = plan.episodes.reduce((total, episode) => total + episode.scenes.reduce((sum, scene) => sum + scene.shots.length, 0), 0);
        setPreview({
            scriptText: plan.scriptText,
            hash: plan.document.scriptHash,
            episodeCount: plan.episodes.length,
            shotCount,
            unchanged: plan.document.scriptHash === project.scriptHash,
        });
    };

    const apply = (mode: "replace" | "append") => {
        if (!scriptProject) return;
        const plan = buildFilmPlanFromDraft(createScriptDraft(scriptProject, "重新同步用快照"));
        const episodes = mode === "append"
            ? (() => {
                const next = structuredClone(project.episodes);
                mergeFilmEpisodes(next, plan.episodes);
                return bindFilmCast(next, project.characters || [], project.locations || []).episodes;
            })()
            : bindFilmCast(plan.episodes, project.characters || [], project.locations || []).episodes;
        onUpdate({ scriptText: plan.scriptText, episodes, scriptDocument: plan.document, scriptHash: plan.document.scriptHash });
        setPreview(null);
        message.success(mode === "append" ? "已按最新剧本追加分镜" : "已按最新剧本重新生成分镜");
    };

    return (
        <>
            <span className="chip chip-acid inline-flex items-center gap-1.5">
                <FileText className="size-3" aria-hidden />
                来自剧本{scriptProject ? `「${scriptProject.title}」` : ""}
            </span>
            {scriptProject ? (
                <Button size="small" type="text" icon={<ExternalLink className="size-3.5" />} href={`/script/${scriptProject.id}`}>
                    打开剧本
                </Button>
            ) : null}
            <Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onClick={prepare}>
                按最新剧本重新解析
            </Button>
            <span className="hidden text-[10px] text-muted-foreground/60 lg:inline">
                剧本修改后在这里同步；已生成的分镜图/视频不受影响
            </span>

            <Modal
                title="按最新剧本重新解析分镜？"
                open={Boolean(preview)}
                onCancel={() => setPreview(null)}
                footer={[
                    <Button key="cancel" onClick={() => setPreview(null)}>取消</Button>,
                    <Button key="append" onClick={() => apply("append")}>追加到现有分镜</Button>,
                    <Button key="replace" type="primary" danger onClick={() => apply("replace")}>覆盖现有分镜</Button>,
                ]}
                destroyOnHidden
            >
                {preview ? (
                    <div className="grid gap-3 py-1 text-xs leading-6 text-muted-foreground">
                        <p>最新剧本：{preview.episodeCount} 集 / {preview.shotCount} 个分镜；当前项目：{project.episodes.length} 集 / {project.episodes.reduce((total, episode) => total + episode.scenes.reduce((sum, scene) => sum + scene.shots.length, 0), 0)} 个分镜。</p>
                        {preview.unchanged ? <p className="text-acid">剧本内容与上次同步一致，重新解析会得到相同分镜。</p> : null}
                        <p>覆盖会替换现有剧集与分镜；追加会按集/场合并到现有分镜后面。已生成的图片和视频保存在镜头记录里，覆盖后不会保留。</p>
                    </div>
                ) : null}
            </Modal>
        </>
    );
}
