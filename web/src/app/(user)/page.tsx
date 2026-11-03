"use client";

import { ArrowRight, ArrowUpRight, Clapperboard, ExternalLink, ImageIcon, PenLine } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ChangeEvent, useEffect, useRef, useState } from "react";
import { App, Button, Image, Tag } from "antd";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";

import { navigationTools } from "@/constant/navigation-tools";
import { EmptyState } from "@/components/ui/state-panel";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { PunkAura } from "@/components/ui/punk-aura";
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
    { imageUrl: "/banners/88-960.webp", imageSrcSet: "/banners/88-480.webp 480w, /banners/88-960.webp 960w", videoUrl: "", linkUrl: "https://88api.ai/sign-up?aff=25ty", alt: "88API 创作服务" },
    { imageUrl: "/banners/metaso-960.webp", imageSrcSet: "/banners/metaso-480.webp 480w, /banners/metaso-960.webp 960w", videoUrl: "", linkUrl: "https://metaso.cn/minimax-h3/?s=tt", alt: "秘塔搜索创作服务" },
    { imageUrl: "/banners/3ddirectortl-960.webp", imageSrcSet: "/banners/3ddirectortl-480.webp 480w, /banners/3ddirectortl-960.webp 960w", videoUrl: "", linkUrl: "", alt: "三维导演工具展示" },
    { imageUrl: "/banners/agent-960.webp", imageSrcSet: "/banners/agent-480.webp 480w, /banners/agent-960.webp 960w", videoUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webm", linkUrl: "", alt: "Agent 工作流演示" },
    { imageUrl: "/banners/panorama-960.webp", imageSrcSet: "/banners/panorama-480.webp 480w, /banners/panorama-960.webp 960w", videoUrl: "", linkUrl: "", alt: "全景创作展示" },
    { imageUrl: "/banners/3ddirector-960.webp", imageSrcSet: "/banners/3ddirector-480.webp 480w, /banners/3ddirector-960.webp 960w", videoUrl: "", linkUrl: "", alt: "三维导演案例" },
];

const HOME_STARTERS = [
    { label: "设计一张封面", icon: ImageIcon, prompt: "帮我设计一张自媒体封面，先和我确认主题、标题与视觉风格，再整理画面方案。" },
    { label: "策划视频分镜", icon: Clapperboard, prompt: "帮我策划一条 30 秒短视频，先确认主题和受众，再整理脚本、镜头与画面提示词。" },
    { label: "梳理创作灵感", icon: PenLine, prompt: "帮我梳理一个内容选题，先询问我的创作方向，再给出三个不同角度的创意方案。" },
];

const HOME_TOOL_COPY: Record<string, string> = {
    canvas: "无限缩放节点画布，把灵感与结果连成一条线。",
    image: "提示词驱动生图，参考图与质量集中管理。",
    video: "文生视频与图生视频，镜头参数集中在一处。",
    workflows: "固定提示词与参数沉淀成模板，批量复用。",
    prompts: "按标题、分类与标签检索灵感，随时收藏。",
    assets: "文本、图片、视频与音频统一归档引用。",
};

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
        <main className="relative h-full overflow-x-hidden overflow-y-auto bg-transparent text-foreground">
            <link rel="preload" as="image" href="/banners/88-960.webp" imageSrcSet="/banners/88-480.webp 480w, /banners/88-960.webp 960w" imageSizes="(max-width: 639px) calc(100vw - 2rem), 460px" fetchPriority="high" />
            <div className="page-shell relative">
                <section className="relative isolate flex flex-col items-center pb-10 pt-12 sm:pt-16 lg:pt-20" aria-labelledby="home-title">
                    <div aria-hidden className="neon-bloom-a left-[2%] top-24 h-[260px] w-[38%] max-w-[480px] opacity-70" />
                    <div aria-hidden className="neon-bloom-b right-[2%] top-16 h-[240px] w-[34%] max-w-[440px] opacity-60" />
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] overflow-hidden">
                        <PunkAura className="punk-aura" />
                    </div>
                    <span aria-hidden className="absolute left-0 top-28 hidden font-mono text-[10px] tracking-[0.3em] text-muted-foreground/35 [writing-mode:vertical-rl] lg:block">INIT / SIGNAL 001</span>
                    <span aria-hidden className="absolute right-0 top-32 hidden font-mono text-[10px] tracking-[0.3em] text-muted-foreground/35 [writing-mode:vertical-rl] lg:block">ACID / LIVE 24</span>
                    <div className="relative flex max-w-3xl flex-col items-center text-center">
                        <span className="eyebrow inline-flex items-center gap-2"><span className="punk-signal" aria-hidden />AI 创作工作台</span>
                        <h1 id="home-title" aria-label="从一个想法开始创作" className="neon-title mt-5 text-[clamp(2rem,4.4vw,3.35rem)] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">
                            <TypewriterText text={HOME_HERO_TITLES} />
                        </h1>
                        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">描述目标、添加参考，让灵感在无限画布上成形。</p>
                    </div>
                    <div className="relative mt-9 w-full max-w-[860px]">
                        <div aria-hidden className="neon-glow" />
                        <div ref={composerRef} className="neon-ring neon-panel relative rounded-3xl bg-muted/25 px-1 pb-1 pt-3 transition-colors focus-within:bg-muted/40 motion-reduce:transition-none dark:bg-card/55">
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
                    </div>
                    <div className="mt-5 flex w-full max-w-[860px] flex-wrap items-center justify-center gap-2" role="group" aria-label="创作示例，点击填入输入框">
                        {HOME_STARTERS.map(({ label, icon: Icon, prompt: starterPrompt }, index) => (
                            <button
                                key={label}
                                type="button"
                                disabled={submitting}
                                onClick={() => applyStarter(starterPrompt)}
                                className="enter-up group inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-border bg-card/50 px-3 text-xs text-muted-foreground transition-[border-color,color,transform,background-color] hover:-translate-y-0.5 hover:border-acid/45 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-4 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ "--enter-index": index + 2 } as CSSProperties}
                            >
                                <span className="grid size-5 shrink-0 place-items-center rounded-[3px] bg-acid/12 text-acid transition-colors group-hover:bg-acid/20" aria-hidden="true">
                                    <Icon className="size-3" />
                                </span>
                                {label}
                                <span aria-hidden className="font-mono text-[9px] tabular-nums text-muted-foreground/35">0{index + 1}</span>
                            </button>
                        ))}
                    </div>
                    <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80 uppercase">输入即创建画布 · 支持 @ 引用素材</p>
                    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*" onChange={onUploadInputChange} />
                </section>

                <section className="relative mt-6 sm:mt-10" aria-label="精选案例">
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <span className="eyebrow">精选案例</span>
                        <span className="hidden font-mono text-[10px] tracking-[0.18em] text-muted-foreground/60 uppercase sm:block">拖拽切换 / 点击播放</span>
                    </div>
                    <div className="relative left-1/2 w-screen -translate-x-1/2">
                        <HomeBannerCarousel banners={HOME_BANNERS} />
                    </div>
                </section>

                <section className="relative mt-16 sm:mt-20" aria-labelledby="home-tools-title">
                    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <span className="eyebrow">工作台</span>
                            <h2 id="home-tools-title" className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-[28px]">一条链路，六种创作入口</h2>
                        </div>
                        <p className="max-w-sm text-xs leading-6 text-muted-foreground sm:text-right">从灵感到成片，每个环节都独立可编排，也能在画布里串起来。</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {navigationTools.map(({ slug, label, icon: Icon }, index) => (
                            <Link
                                key={slug}
                                href={`/${slug}`}
                                className="punk-card brackets enter-up group relative flex min-h-[112px] items-start gap-4 overflow-hidden rounded-xl border border-border bg-card/60 p-5"
                                style={{ "--enter-index": index + 4 } as CSSProperties}
                            >
                                <span aria-hidden className="absolute right-3.5 top-3 font-mono text-[10px] tracking-[0.16em] text-muted-foreground/35 tabular-nums">
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="grid size-10 shrink-0 place-items-center rounded-[6px] border border-border bg-background text-foreground/70 transition-colors group-hover:border-acid/45 group-hover:text-acid">
                                    <Icon className="size-[18px]" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                        {label}
                                        <ArrowUpRight className="size-3.5 -translate-y-px text-muted-foreground/0 transition group-hover:text-acid" aria-hidden />
                                    </span>
                                    <span className="mt-1.5 block text-xs leading-6 text-muted-foreground">{HOME_TOOL_COPY[slug]}</span>
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="relative mt-16 mb-16 sm:mt-20" aria-labelledby="home-showcase-title">
                    <div className="punk-rule mb-9" />
                    <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                        <div className="max-w-xl">
                            <span className="eyebrow">灵感沉淀</span>
                            <h2 id="home-showcase-title" className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-[28px]">收藏每一次好结果</h2>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">收藏喜欢的风格与提示词，让下一次创作有迹可循。</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button type="text" href="https://prompts.tdeh.top/" target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-3.5" />} iconPlacement="end">外部提示词仓库</Button>
                            <Button href="/prompts" icon={<ArrowRight className="size-4" />} iconPlacement="end">浏览提示词库</Button>
                        </div>
                    </div>
                    {promptShowcase.length ? (
                        <div className="grid auto-rows-[240px] grid-cols-1 gap-3 sm:auto-rows-[210px] sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
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
                                        "punk-card enter-up group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-muted text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                                        index === 0 && "lg:col-span-2 lg:row-span-2",
                                        index === 3 && "lg:col-span-2",
                                    )}
                                    style={{ "--enter-index": Math.min(index + 2, 8) } as CSSProperties}
                                >
                                    <img src={item.coverUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none" />
                                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-90" />
                                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-acid/40 opacity-0 transition-opacity group-hover:opacity-100" />
                                    <div className="absolute inset-x-0 bottom-0 p-4 pt-12 text-white sm:p-5 sm:pt-14">
                                        <div className="mb-2 flex flex-wrap gap-1.5">
                                            {item.tags.slice(0, 2).map((tag) => (
                                                <Tag key={tag} variant="filled" className="!m-0 !max-w-full !truncate !rounded-[3px] !border-0 !bg-white/12 !text-[11px] !text-white backdrop-blur">
                                                    {tag}
                                                </Tag>
                                            ))}
                                        </div>
                                        <h3 className={cn("line-clamp-2 font-medium leading-snug", index === 0 ? "text-base lg:text-xl" : "text-sm")}>{item.title}</h3>
                                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            className="rounded-xl border border-dashed border-border bg-card/40 py-14"
                            title="提示词库正在整理"
                            description="去提示词库挑几条灵感，收藏后就会出现在这里。"
                            action={<Button href="/prompts">浏览提示词库</Button>}
                        />
                    )}
                </section>
            </div>
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
