"use client";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AgentSkill } from "@/services/api/agent-skills";
import { resolveImageUrl } from "@/services/image-storage";

function SkillCover({ skill }: { skill: AgentSkill }) {
    const [src, setSrc] = useState(skill.coverUrl);
    useEffect(() => {
        let active = true;
        setSrc(skill.coverUrl);
        if (skill.coverStorageKey) {
            void resolveImageUrl(skill.coverStorageKey, skill.coverUrl)
                .then((url) => {
                    if (active) setSrc(url);
                })
                .catch(() => {
                    if (active) setSrc(skill.coverUrl);
                });
        }
        return () => {
            active = false;
        };
    }, [skill.coverStorageKey, skill.coverUrl]);

    if (!src) {
        const initial = skill.name.trim().slice(0, 1).toUpperCase() || "S";
        return (
            <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/70 via-card to-muted/30">
                <span className="grid size-12 place-items-center rounded-2xl border border-acid/30 bg-acid/10 text-lg font-semibold text-foreground">{initial}</span>
                <span className="text-[10px] tracking-[0.18em] text-muted-foreground/60">SKILL</span>
            </div>
        );
    }
    return <img src={src} alt={skill.name} loading="lazy" decoding="async" className="size-full object-cover" onError={() => setSrc("")} />;
}

export function SkillGalleryCard({ skill, onEdit, onDelete }: { skill: AgentSkill; onEdit: (skill: AgentSkill) => void; onDelete: (skill: AgentSkill) => void }) {
    return (
        <article className="admin-gallery-card group flex flex-col">
            <div className="relative aspect-[16/9] overflow-hidden bg-muted/30">
                <button type="button" onClick={() => onEdit(skill)} className="block size-full cursor-pointer" aria-label={`编辑 ${skill.name}`}>
                    <SkillCover skill={skill} />
                </button>
                <div className="absolute left-2 top-2">
                    <Tag className="!m-0" color={skill.enabled ? "success" : "default"}>
                        {skill.enabled ? "已启用" : "已停用"}
                    </Tag>
                </div>
                <div className="admin-card-actions">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(skill)} aria-label="编辑 Skill" title="编辑 Skill" />
                    <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDelete(skill)} aria-label="删除 Skill" title="删除 Skill" />
                </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3.5">
                <button type="button" onClick={() => onEdit(skill)} className="truncate text-left text-[13px] font-medium text-foreground transition-colors hover:text-acid" title={skill.name}>
                    {skill.name}
                </button>
                <p className="line-clamp-2 text-[11px] leading-5 text-muted-foreground">{skill.description || "未填写描述"}</p>
                <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>排序 {skill.sort}</span>
                    <span>{dayjs(skill.updatedAt).isValid() ? dayjs(skill.updatedAt).format("YYYY-MM-DD HH:mm") : "-"}</span>
                </div>
            </div>
        </article>
    );
}
