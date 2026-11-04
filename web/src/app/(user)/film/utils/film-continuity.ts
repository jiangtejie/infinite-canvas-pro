import type { FilmAsset, FilmEpisode } from "../types";

export type FilmContinuityIssue = {
    id: string;
    level: "warning" | "info";
    message: string;
    shotId?: string;
};

const MAX_ISSUES = 30;

/** 检查同场引用、角色提及未绑定、场名与场景引用不一致等连戏问题。 */
export function checkFilmContinuity(episodes: FilmEpisode[], characters: FilmAsset[], locations: FilmAsset[]): FilmContinuityIssue[] {
    const issues: FilmContinuityIssue[] = [];
    const namedCharacters = characters.filter((asset) => asset.name.trim().length >= 2);
    const namedLocations = locations.filter((asset) => asset.name.trim().length >= 2);

    const push = (issue: FilmContinuityIssue) => {
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
                const text = `${shot.description} ${shot.dialogue}`;
                for (const character of namedCharacters) {
                    const name = character.name.trim();
                    if (!text.includes(name)) continue;
                    if ((shot.characterIds || []).includes(character.id)) continue;
                    push({
                        id: `character-${character.id}-${shot.id}`,
                        level: "warning",
                        message: `${sceneLabel}：镜头 ${shot.shotNo} 提到「${name}」但未绑定角色`,
                        shotId: shot.id,
                    });
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
