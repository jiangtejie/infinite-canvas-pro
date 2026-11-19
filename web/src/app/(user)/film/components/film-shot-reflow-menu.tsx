"use client";

import { Button, Dropdown, type MenuProps } from "antd";
import { FolderInput } from "lucide-react";

import type { FilmProject, FilmShot } from "@/lib/film/types";
import { ensureCharacterProfile } from "../utils/film-character";
import { useFilmShotReflow, type FilmReflowSource } from "../hooks/use-film-shot-reflow";

type FilmShotReflowMenuProps = {
    project: FilmProject;
    shot: FilmShot;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    source: FilmReflowSource;
    disabled?: boolean;
    iconOnly?: boolean;
};

export function FilmShotReflowMenu({ project, shot, onUpdate, source, disabled, iconOnly }: FilmShotReflowMenuProps) {
    const { setLook, setCostume, setScene, setProp, addImageToAssets } = useFilmShotReflow(project, shot, onUpdate);

    const lookChildren = shot.characterBindings.flatMap((binding) => {
        const character = (project.characters || []).find((item) => item.id === binding.characterId);
        const state = character ? ensureCharacterProfile(character).states.find((item) => item.id === binding.stateId) : undefined;
        if (!character || !state) return [];
        return [{ key: `look-${character.id}-${state.id}`, label: `${character.name} · ${state.name}`, onClick: () => setLook(binding, source) }];
    });
    const costumeChildren = shot.characterBindings.flatMap((binding) => {
        const character = (project.characters || []).find((item) => item.id === binding.characterId);
        const state = character ? ensureCharacterProfile(character).states.find((item) => item.id === binding.stateId) : undefined;
        const costume = state?.costumeId ? (project.costumes || []).find((item) => item.id === state.costumeId) : undefined;
        return costume ? [{ key: `costume-${costume.id}`, label: costume.name, onClick: () => setCostume(binding, source) }] : [];
    });
    const propChildren = (shot.propBindings || []).flatMap((binding) => {
        const prop = (project.props || []).find((item) => item.id === binding.propId);
        return prop ? [{ key: `prop-${prop.id}`, label: prop.name, onClick: () => setProp(prop.id, source) }] : [];
    });
    const sceneLabel = (() => {
        const location = (project.locations || []).find((item) => item.id === shot.locationId);
        if (!location) return "设为场景参考";
        const variant = shot.locationVariantId ? location.location?.variants.find((item) => item.id === shot.locationVariantId) : undefined;
        return variant ? `设为场景参考（${variant.name}）` : `设为场景参考（${location.name}）`;
    })();

    const items: MenuProps["items"] = [
        lookChildren.length
            ? { key: "look", label: "设为造型参考", children: lookChildren }
            : { key: "look", label: "设为造型参考（先绑定造型）", disabled: true },
        costumeChildren.length
            ? { key: "costume", label: "设为服装参考", children: costumeChildren }
            : { key: "costume", label: "设为服装参考（造型未引用服装）", disabled: true },
        { key: "scene", label: sceneLabel, disabled: !shot.locationId, onClick: () => setScene(source) },
        propChildren.length
            ? { key: "prop", label: "设为道具参考", children: propChildren }
            : { key: "prop", label: "设为道具参考（本镜未绑定道具）", disabled: true },
        { type: "divider" },
        { key: "asset", label: "加入我的素材", onClick: () => addImageToAssets(source) },
    ];

    if (iconOnly) {
        return (
            <Dropdown trigger={["click"]} menu={{ items }} disabled={disabled || !source.url}>
                <button
                    type="button"
                    aria-label="回流到资产"
                    title="回流到资产"
                    className="grid size-5 place-items-center rounded bg-background/85 text-muted-foreground/70 hover:text-acid"
                    onClick={(event) => event.stopPropagation()}
                >
                    <FolderInput className="size-3" />
                </button>
            </Dropdown>
        );
    }

    return (
        <Dropdown trigger={["click"]} menu={{ items }} disabled={disabled || !source.url}>
            <Button size="small" icon={<FolderInput className="size-3.5" />}>回流到资产</Button>
        </Dropdown>
    );
}
