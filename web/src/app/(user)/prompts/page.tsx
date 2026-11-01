"use client";

import { FolderPlus, Search } from "lucide-react";
import { type UIEvent, useState } from "react";
import { App, Button, Input } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-panel";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const [titleInput, setTitleInput] = useState("");
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success("已加入我的素材");
    };

    const searchByTitleInput = () => {
        setTitleKeyword(titleInput);
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main
                className="min-h-0 flex-1 overflow-y-auto bg-transparent px-6 py-10"
                onScroll={handleListScroll}
            >
                <div className="pb-8">
                    <div className="relative mx-auto max-w-5xl text-center">
                        <div aria-hidden className="neon-bloom-a pointer-events-none absolute left-1/2 top-[-40px] h-[220px] w-[440px] -translate-x-1/2 opacity-45" />
                        <p className="relative text-xs font-medium tracking-[0.2em] text-foreground/50">AI 灵感库</p>
                        <h1 className="neon-title relative mt-3 text-4xl font-semibold tracking-tight text-foreground">提示词库</h1>
                        <div className="relative mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-foreground/60">
                            <span className="rounded-full border border-border/70 bg-foreground/4 px-2.5 py-0.5 text-xs font-medium tabular-nums text-foreground/80">共 {totalPrompts} 条</span>
                            <span>按标题、标签与分类快速查找灵感</span>
                        </div>
                    </div>
                    {query.isLoading ? <LoadingState className="h-60" label="正在加载提示词..." /> : null}
                    {!query.isLoading ? (
                        <>
                            <div className="mx-auto mt-8 w-full max-w-2xl">
                                <div className="neon-ring flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-4 py-0.5 backdrop-blur-xl transition-colors focus-within:border-foreground/25">
                                    <Search className="size-4 shrink-0 text-muted-foreground" />
                                    <Input variant="borderless" size="large" className="!bg-transparent" value={titleInput} placeholder="按标题查询，按 Enter 搜索" onChange={(event) => setTitleInput(event.target.value)} onPressEnter={searchByTitleInput} />
                                </div>
                            </div>
                            <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
                                <FilterTagGroup label="分类" options={promptCategoryOptions} isSelected={(value) => selectedCategory === value} onSelect={setSelectedCategory} />
                                <FilterTagGroup label="标签" options={promptTags} isSelected={(value) => value === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(value)} onSelect={toggleTag} />
                            </div>
                        </>
                    ) : null}
                </div>

                {!query.isLoading && query.isError ? (
                    <ErrorState
                        className="py-16"
                        description={query.error instanceof Error ? query.error.message : "获取提示词失败，请检查网络后重试。"}
                        detail={query.error instanceof Error ? query.error.stack : undefined}
                        onRetry={() => void query.refetch()}
                    />
                ) : null}

                {!query.isLoading && !query.isError ? (
                    <div>
                        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {promptItems.map((item, index) => (
                                <div key={item.id} className="enter-up" style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}>
                                <PromptCard
                                    key={item.id}
                                    item={item}
                                    onOpen={() => setSelectedPrompt(item)}
                                    onCopy={() => copyText(item.prompt, "提示词已复制")}
                                    extraAction={
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                            加入我的素材
                                        </Button>
                                    }
                                />
                                </div>
                            ))}
                        </div>
                        {promptItems.length === 0 ? <EmptyState title="没有找到匹配的提示词" description="调整标题、分类或标签后再试。" /> : null}
                        <div className="mx-auto mt-6 max-w-7xl text-center text-xs text-muted-foreground">
                            {query.isFetchingNextPage ? "加载中..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : null}
                        </div>
                    </div>
                ) : null}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
        </div>
    );
}
