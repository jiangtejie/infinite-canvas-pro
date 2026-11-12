"use client";

import { ExternalLink, FolderPlus, Search } from "lucide-react";
import { type UIEvent, useState } from "react";
import { App, Button, Input } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-panel";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { errorMessage } from "@/lib/utils";

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

    const clearFilters = () => {
        setTitleInput("");
        setTitleKeyword("");
        setSelectedTags([]);
        setSelectedCategory(ALL_PROMPTS_OPTION);
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent" onScroll={handleListScroll}>
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <PageHeader
                        eyebrow="AI 灵感库"
                        title="提示词库"
                        description="按标题、分类与标签快速检索，把好用的提示词收进素材库随时复用。"
                        meta={
                            <>
                                <span className="chip chip-acid">{totalPrompts} 条提示词</span>
                                <span className="chip">{promptCategoryOptions.length} 个分类</span>
                            </>
                        }
                        actions={
                            <Button href="https://prompts.tdeh.top/" target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-4" />} iconPlacement="end">
                                外部提示词仓库
                            </Button>
                        }
                    />

                    <section className="flex flex-col gap-4">
                        <div className="flex h-11 w-full items-center gap-3 rounded-lg border border-border bg-card/70 px-4 backdrop-blur-xl transition-colors focus-within:border-acid/50 lg:max-w-2xl">
                            <Search className="size-4 shrink-0 text-muted-foreground" />
                            <Input
                                variant="borderless"
                                size="large"
                                className="!bg-transparent"
                                value={titleInput}
                                placeholder="按标题查询，按 Enter 搜索"
                                onChange={(event) => setTitleInput(event.target.value)}
                                onPressEnter={searchByTitleInput}
                            />
                            <Button type="primary" size="small" onClick={searchByTitleInput}>搜索</Button>
                        </div>
                        <div className="filter-tag-sheet grid gap-2 sm:gap-2.5">
                            <FilterTagGroup label="分类" options={promptCategoryOptions} isSelected={(value) => selectedCategory === value} onSelect={setSelectedCategory} />
                            <FilterTagGroup label="标签" options={promptTags} collapsible isSelected={(value) => value === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(value)} onSelect={toggleTag} />
                        </div>
                    </section>

                    {query.isLoading ? <LoadingState className="min-h-[320px]" label="正在加载提示词" /> : null}

                    {!query.isLoading && query.isError ? (
                        <ErrorState
                            className="py-16"
                            description={errorMessage(query.error, "获取提示词失败，请检查网络后重试。")}
                            detail={process.env.NODE_ENV === "production" ? undefined : query.error instanceof Error ? query.error.stack : undefined}
                            onRetry={() => void query.refetch()}
                        />
                    ) : null}

                    {!query.isLoading && !query.isError ? (
                        <section className="flex flex-col gap-6">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">
                                    {selectedCategory === ALL_PROMPTS_OPTION ? "全部提示词" : selectedCategory}
                                    {selectedTags.length ? ` / ${selectedTags.join(" + ")}` : ""}
                                </p>
                                <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">
                                    {query.isFetchingNextPage ? "加载中" : query.hasNextPage ? "向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : ""}
                                </span>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {promptItems.map((item, index) => (
                                    <div key={item.id} className="enter-up" style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}>
                                        <PromptCard
                                            item={item}
                                            onOpen={() => setSelectedPrompt(item)}
                                            onCopy={() => copyText(item.prompt, "提示词已复制")}
                                            extraAction={
                                                <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                                    加入素材
                                                </Button>
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                            {promptItems.length === 0 ? (
                                <EmptyState
                                    className="rounded-xl border border-dashed border-border bg-card/40"
                                    title="没有找到匹配的提示词"
                                    description="调整标题、分类或标签后再试。"
                                    action={<Button onClick={clearFilters}>清空筛选</Button>}
                                />
                            ) : null}
                        </section>
                    ) : null}
                </div>
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
        </div>
    );
}
