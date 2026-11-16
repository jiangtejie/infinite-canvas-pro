import type { FilmAsset, FilmEpisode } from "@/lib/film/types";
import { findFilmCharacterState } from "./film-character";

export type FilmBindingIssue = {
    id: string;
    level: "warning" | "info";
    message: string;
    shotId?: string;
};

const MAX_ISSUES = 30;

/** 检查同场引用、角色提及未绑定、场名与场景引用不一致等绑定问题（快速静态检查，不调用 AI）。 */
export function checkFilmBindingIssues(episodes: FilmEpisode[], characters: FilmAsset[], locations: FilmAsset[]): FilmBindingIssue[] {
    const issues: FilmBindingIssue[] = [];
    const namedCharacters = characters.filter((asset) => asset.name.trim().length >= 2);
    const namedLocations = locations.filter((asset) => asset.name.trim().length >= 2);

    const push = (issue: FilmBindingIssue) => {
        if (issues.length >= MAX_ISSUES) return;
        if (issues.some((item) => item.message === issue.message)) return;
        issues.push(issue);
    };

    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            const sceneLabel = `${episode.title} / ${scene.name}`;
            const locationIds = [...new Set(scene.shots.map((shot) => shot.locationId).filter(Boolean))];
            if (locationIds.length > 1) {
                const names = locationIds.map((id) => namedLocations.find((asset) => asset.id === id)?.name || "未命名场景").join("、");
                push({ id: `scene-mix-${scene.id}`, level: "warning", message: `${sceneLabel}：同场镜头引用了不同场景（${names}）`, shotId: scene.shots[0]?.id });
            } else if (locationIds.length === 1 && scene.shots.some((shot) => !shot.locationId)) {
                push({ id: `scene-missing-${scene.id}`, level: "info", message: `${sceneLabel}：部分镜头未绑定场景`, shotId: scene.shots.find((shot) => !shot.locationId)?.id });
            }
            const sceneLocation = namedLocations.find((asset) => scene.name.includes(asset.name.trim()));

            for (const shot of scene.shots) {
                const text = `${shot.description} ${shot.dialogue}`.normalize("NFKC");
                for (const character of namedCharacters) {
                    const names = [character.name, ...character.aliases].map((name) => name.normalize("NFKC").trim()).filter(Boolean);
                    const matchedName = names.find((name) => text.includes(name));
                    if (matchedName && !shot.characterBindings.some((binding) => binding.characterId === character.id)) {
                        push({
                            id: `character-${character.id}-${shot.id}`,
                            level: "warning",
                            message: `${sceneLabel}：镜头 ${shot.shotNo} 提到「${matchedName}」但未绑定角色`,
                            shotId: shot.id,
                        });
                    }
                }
                for (const binding of shot.characterBindings) {
                    const character = characters.find((asset) => asset.id === binding.characterId);
                    if (!character) {
                        push({ id: `missing-character-${binding.characterId}-${shot.id}`, level: "warning", message: `${sceneLabel}：镜头 ${shot.shotNo} 绑定的角色「${binding.characterNameSnapshot}」已删除`, shotId: shot.id });
                        continue;
                    }
                    if (binding.stateId && !findFilmCharacterState(character, binding.stateId)) {
                        push({ id: `missing-state-${binding.characterId}-${binding.stateId}-${shot.id}`, level: "warning", message: `${sceneLabel}：镜头 ${shot.shotNo} 绑定的状态「${binding.stateNameSnapshot || binding.stateId}」已失效`, shotId: shot.id });
                    }
                }
                if (sceneLocation && shot.locationId && shot.locationId !== sceneLocation.id) {
                    push({
                        id: `location-${sceneLocation.id}-${shot.id}`,
                        level: "warning",
                        message: `${sceneLabel}：镜头 ${shot.shotNo} 引用的场景与场名「${sceneLocation.name}」不一致`,
                        shotId: shot.id,
                    });
                }
            }
        }
    }

    return issues;
}
