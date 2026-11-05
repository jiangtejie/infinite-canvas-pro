"use client";

import { useState } from "react";

import { FilmDeleteConfirmModal, type FilmDeleteConfirmOptions } from "../components/film-delete-confirm";

/** 影视模块统一的危险操作确认框：删除项目/素材/角色/场景、清空剧本等。 */
export function useFilmDeleteConfirm() {
    const [options, setOptions] = useState<FilmDeleteConfirmOptions | null>(null);

    return {
        confirmDelete: (next: FilmDeleteConfirmOptions) => setOptions(next),
        deleteConfirmNode: <FilmDeleteConfirmModal options={options} onCancel={() => setOptions(null)} />,
    };
}
