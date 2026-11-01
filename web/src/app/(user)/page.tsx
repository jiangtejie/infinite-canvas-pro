"use client";

import { ArrowRight, Clapperboard, ExternalLink, ImageIcon, PenLine } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { App, Button, Image, Tag } from "antd";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { cn } from "@/lib/utils";
import { uploadAssetMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { AssetPickerModal } from "./canvas/components/asset-picker-modal";
import { CanvasAssistantComposer } from "./canvas/components/canvas-assistant-composer";
import { useCanvasStore } from "./canvas/stores/use-canvas-store";
import { canvasResourceLabel } from "./canvas/utils/canvas-resource-references";
import { HomeBannerCarousel, type HomeBanner } from "./home-banner-carousel";
import {
    MAX_CANVAS_AGENT_SKILLS,
    CanvasNodeType,
    type CanvasAgentConfig,
    type CanvasAgentSkillSelection,
    type CanvasAssistantReference,
    type InsertAssetPayload,
    type PendingAgentAsset,
} from "./canvas/types";


const HOME_HERO_TITLES = ["从一个想法开始创作", "从一张参考图开始创作", "从一段视频开始创作", "从一句提示词开始创作"];

const HOME_BANNERS: HomeBanner[] = [
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.7/img/infinite-canvas/88.webp", videoUrl: "", linkUrl: "https://88api.ai/sign-up?aff=25ty", alt: "88API 创作服务" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.6/img/infinite-canvas/metaso.webp", videoUrl: "", linkUrl: "https://metaso.cn/minimax-h3/?s=tt", alt: "秘塔搜索创作服务" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.5/img/infinite-canvas/3ddirectortl.webp", videoUrl: "", linkUrl: "", alt: "三维导演工具展示" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webp", videoUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webm", linkUrl: "", alt: "Agent 工作流演示" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/panorama.webp", videoUrl: "", linkUrl: "", alt: "全景创作展示" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/3ddirector.webp", videoUrl: "", linkUrl: "", alt: "三维导演案例" },
];

const HOME_STARTERS = [
    { label: "设计一张封面", icon: ImageIcon, prompt: "帮我设计一张自媒体封面，先和我确认主题、标题与视觉风格，再整理画面方案。" },
    { label: "策划视频分镜", icon: Clapperboard, prompt: "帮我策划一条 30 秒短视频，先确认主题和受众，再整理脚本、镜头与画面提示词。" },
    { label: "梳理创作灵感", icon: PenLine, prompt: "帮我梳理一个内容选题，先询问我的创作方向，再给出三个不同角度的创意方案。" },
];

function toPendingAgentAsset(payload: InsertAssetPayload, label: string): PendingAgentAsset {
    const nodeId = nanoid();
    let reference: CanvasAssistantReference;
    if (payload.kind === "text") {
        reference = { id: nodeId, type: CanvasNodeType.Text, title: payload.title, label, text: payload.content };
    } else {
        const common = { id: nodeId, title: payload.title, label, storageKey: payload.storageKey, mimeType: payload.mimeType };
        if (payload.kind === "image") reference = { ...common, type: CanvasNodeType.Image, dataUrl: payload.dataUrl };
        else if (payload.kind === "video") reference = { ...common, type: CanvasNodeType.Video, url: payload.url };
        else reference = { ...common, type: CanvasNodeType.Audio, url: payload.url };
    }
    return { nodeId, payload, reference };
}

export default function IndexPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const effectiveConfig = useEffectiveConfig();
    const createProject = useCanvasStore((state) => state.createProject);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [pendingAssets, setPendingAssets] = useState<PendingAgentAsset[]>([]);
    const [selectedSkills, setSelectedSkills] = useState<CanvasAgentSkillSelection[]>([]);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [agentConfig, setAgentConfig] = useState<CanvasAgentConfig>(() => ({
        textApiMode: "chat",
        autoGenerateMedia: false,
        imageQuality: effectiveConfig.quality,
        imageSize: effectiveConfig.size,
        videoQuality: effectiveConfig.vquality,
        videoSize: effectiveConfig.videoSize,
    }));
    const composerRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const pendingAssetCountsRef = useRef<Record<InsertAssetPayload["kind"], number>>({ text: 0, image: 0, video: 0, audio: 0 });

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"));
    }, [message]);

    const addPendingAsset = (payload: InsertAssetPayload) => {
        const asset = toPendingAgentAsset(payload, canvasResourceLabel(payload.kind, pendingAssetCountsRef.current[payload.kind]++));
        setPendingAssets((current) => [...current, asset]);
        setPrompt((current) => `${current}${current.endsWith(" ") ? "" : " "}${asset.reference.label} `);
    };

    const uploadFile = async (file: File) => {
        try {
            if (file.type.startsWith("image/")) {
                const uploaded = await uploadImage(file);
                addPendingAsset({ kind: "image", dataUrl: uploaded.url, title: file.name, ...uploaded });
            } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
                const uploaded = await uploadAssetMediaFile(file);
                if (file.type.startsWith("video/")) addPendingAsset({ kind: "video", title: file.name, ...uploaded });
                else addPendingAsset({ kind: "audio", title: file.name, ...uploaded });
            } else {
                throw new Error("仅支持图片、视频和音频文件");
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材上传失败");
        }
    };

    const onUploadInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void uploadFile(file);
    };

    const submit = (nextPrompt = prompt, referenceIds = pendingAssets.map((asset) => asset.nodeId)) => {
        const text = nextPrompt.trim();
        if (!text || submitting) return;
        if (!hydrated) {
            message.info("画布数据正在加载，请稍后再试");
            return;
        }
        setSubmitting(true);
        const titles = new Set(useCanvasStore.getState().projects.map(({ title }) => title));
        let title = "无限画布";
        for (let i = 1; titles.has(title); i++) title = `无限画布 ${i}`;
        const projectId = createProject(title, {
            agentConfig,
            pendingAgentRequest: { prompt: text, assets: pendingAssets.filter((asset) => referenceIds.includes(asset.nodeId)), skills: selectedSkills },
        });
        router.push(`/canvas/${projectId}`);
    };

    const applyStarter = (text: string) => {
        setPrompt((current) => current.trim() ? `${current}\n${text}` : text);
        window.requestAnimationFrame(() => {
            const editor = composerRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
            if (!editor) return;
            editor.focus();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        });
    };

    const selectSkill = (skill: CanvasAgentSkillSelection) => {
        const existingIndex = selectedSkills.findIndex((selected) => selected.id === skill.id && selected.source === skill.source);
        if (existingIndex >= 0) return setSelectedSkills(selectedSkills.map((selected, index) => index === existingIndex ? skill : selected));
        if (selectedSkills.length >= MAX_CANVAS_AGENT_SKILLS) return void message.warning(`最多选择 ${MAX_CANVAS_AGENT_SKILLS} 个 Skill`);
        setSelectedSkills([...selectedSkills, skill]);
    };

    return (
        <main className="relative h-full overflow-x-hidden overflow-y-auto bg-background text-foreground">
            <section className="relative mx-auto min-h-full max-w-7xl px-4 sm:px-6">
                <section className="relative flex flex-col items-center pb-8 pt-10 sm:pb-10 sm:pt-14 lg:pt-16" aria-labelledby="home-title">
                    <div className="mb-6 max-w-3xl text-center sm:mb-8">
                        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground">AI 创作工作台</p>
                        <h1 id="home-title" aria-label="从一个想法开始创作" className="mt-3 text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-foreground">
                            <TypewriterText text={HOME_HERO_TITLES} />
                        </h1>
                        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted-foreground sm:max-w-xl sm:text-base">描述目标、添加参考，让灵感在无限画布上成形。</p>
                    </div>
                    <div ref={composerRef} className="w-full max-w-[820px] rounded-3xl bg-muted/30 px-1 pb-1 pt-3 ring-1 ring-border/50 transition-colors focus-within:bg-muted/50 focus-within:ring-ring/40 motion-reduce:transition-none">
                        <CanvasAssistantComposer
                            prompt={prompt}
                            isRunning={false}
                            references={pendingAssets.map((asset) => asset.reference)}
                            selectedSkills={selectedSkills}
                            agentConfig={agentConfig}
                            onAgentConfigChange={(patch) => setAgentConfig((current) => ({ ...current, ...patch }))}
                            onPromptChange={setPrompt}
                            onReferenceIdsChange={(ids) => setPendingAssets((current) => current.filter((asset) => ids.includes(asset.nodeId)))}
                            onSkillSelect={selectSkill}
                            onSkillRemove={(id, source) => setSelectedSkills((current) => current.filter((skill) => skill.id !== id || skill.source !== source))}
                            onSubmit={submit}
                            onOpenUpload={() => uploadInputRef.current?.click()}
                            onOpenAssets={() => setAssetPickerOpen(true)}
                            onPasteImage={(file) => void uploadFile(file)}
                        />
                    </div>
                    <div className="mt-4 flex w-full max-w-[820px] flex-wrap items-center justify-center gap-2" role="group" aria-label="创作示例，点击填入输入框">
                        {HOME_STARTERS.map(({ label, icon: Icon, prompt: starterPrompt }) => (
                            <button key={label} type="button" disabled={submitting} onClick={() => applyStarter(starterPrompt)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 px-3 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:px-4 sm:text-sm">
                                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-6 w-screen shrink-0 sm:mt-8">
                        <HomeBannerCarousel banners={HOME_BANNERS} />
                    </div>
                    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*" onChange={onUploadInputChange} />
                </section>

                <section className="relative mx-auto mb-12 max-w-6xl border-t border-border/70 pt-8 sm:mb-16 sm:pt-10" aria-labelledby="home-showcase-title">
                    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                        <div className="max-w-xl">
                            <p className="mb-2 text-xs font-medium tracking-[0.16em] text-muted-foreground">灵感与参考</p>
                            <h2 id="home-showcase-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">沉淀每一次好结果</h2>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">收藏喜欢的风格与提示词，让下一次创作有迹可循。</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button type="text" href="https://prompts.tdeh.top/" target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-3.5" />} iconPlacement="end">外部提示词仓库</Button>
                            <Button href="/prompts" icon={<ArrowRight className="size-4" />} iconPlacement="end">浏览提示词库</Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 auto-rows-[240px] gap-3 sm:grid-cols-2 sm:auto-rows-[210px] sm:gap-4 lg:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setPreviewIndex(index);
                                    setPreviewOpen(true);
                                }}
                                aria-label={`预览：${item.title}`}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                    index === 0 && "lg:col-span-2 lg:row-span-2",
                                    index === 3 && "lg:col-span-2",
                                )}
                            >
                                <img src={item.coverUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-4 pt-12 text-white sm:p-5 sm:pt-12">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="!m-0 !max-w-full !truncate !rounded-md !border-0 !bg-white/15 !text-[11px] !text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className={cn("line-clamp-2 font-medium leading-snug", index === 0 ? "text-base lg:text-xl" : "text-sm")}>{item.title}</h3>
                                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/80">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </section>
            <AssetPickerModal
                open={assetPickerOpen}
                defaultTab="my-assets"
                onInsert={(payload) => {
                    addPendingAsset(payload);
                    setAssetPickerOpen(false);
                }}
                onClose={() => setAssetPickerOpen(false)}
            />
            <Image.PreviewGroup
                items={promptShowcase.map((item) => ({
                    src: item.coverUrl,
                    alt: item.title,
                }))}
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            />
        </main>
    );
}
