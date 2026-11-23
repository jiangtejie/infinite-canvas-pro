import type { FilmShotCharacterBinding } from "@/lib/film/types";

/** 角色在上一镜与本镜之间的造型/状态连续性文本。 */
export function formatFilmBindingContinuity(binding: FilmShotCharacterBinding, previousBinding?: FilmShotCharacterBinding): string {
    const label = `${binding.characterNameSnapshot}${binding.stateNameSnapshot ? `（${binding.stateNameSnapshot}）` : ""}`;
    const continuity = binding.continuity;
    const changes = [
        continuity.outfit && `服装 ${continuity.outfit}`,
        continuity.physicalCondition && `身体 ${continuity.physicalCondition}`,
        continuity.emotion && `情绪 ${continuity.emotion}`,
        continuity.heldProps?.length && `持有 ${continuity.heldProps.join("、")}`,
    ].filter(Boolean).join("；");
    if (continuity.intentionalChange) {
        return `${label} 本镜刻意变化：${continuity.intentionalChange}${changes ? `（${changes}）` : ""}，允许与上一镜不同。`;
    }
    const previous = previousBinding?.continuity;
    const inherited = previous ? [
        previous.outfit && `服装 ${previous.outfit}`,
        previous.physicalCondition && `身体 ${previous.physicalCondition}`,
        previous.heldProps?.length && `持有 ${previous.heldProps.join("、")}`,
    ].filter(Boolean).join("；") : "";
    return `${label} 承接上一镜${inherited ? `（${inherited}）` : ""}，保持造型与道具连续${changes ? `；本镜 ${changes}` : ""}。`;
}
