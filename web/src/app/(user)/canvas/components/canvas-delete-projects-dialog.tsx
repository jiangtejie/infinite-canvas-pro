"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteCanvasProjects } from "@/services/api/canvas-tasks";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";

export function CanvasDeleteProjectsDialog() {
    const ids = useCanvasUiStore((state) => state.deleteProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const removeSelectedIds = useCanvasUiStore((state) => state.removeSelectedProjectIds);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const confirm = () => {
        void deleteCanvasProjects(ids).catch(() => undefined);
        deleteProjects(ids);
        cleanupImages();
        removeSelectedIds(ids);
        setDeleteIds([]);
    };

    return (
        <ConfirmDialog
            open={ids.length > 0}
            title="删除画布？"
            description={`将删除 ${ids.length} 个画布，里面的节点和连线也会一起移除。`}
            confirmText="删除"
            cancelText="取消"
            tone="danger"
            onConfirm={confirm}
            onCancel={() => setDeleteIds([])}
        />
    );
}
