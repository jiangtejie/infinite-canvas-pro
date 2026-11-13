"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useUserStore } from "@/stores/use-user-store";

/** 退出登录统一确认：说清本地数据按账号保留，避免用户误以为退出会丢内容。 */
export function useLogout() {
    const confirm = useConfirm();
    const clearSession = useUserStore((state) => state.clearSession);
    return async () => {
        const confirmed = await confirm({
            title: "退出登录",
            description: "退出后回到游客模式，本机只显示游客数据。当前账号的画布、素材与生成记录仍按账号保存在本机，重新登录即可恢复；已开启云同步的内容同时保存在账号云端。",
            confirmText: "退出登录",
        });
        if (confirmed) clearSession();
    };
}