"use client";

import { useEffect } from "react";

import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { AiConfig } from "@/stores/use-config-store";

/** 工作台生成按钮旁的成本提示：本地渠道不计积分，云端渠道按后台单价估算。 */
export function WorkbenchCreditHint({ config, model, mode, count = 1, seconds, resolution }: { config: AiConfig; model: string; mode: "image" | "video"; count?: string | number; seconds?: string; resolution?: string }) {
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const user = useUserStore((state) => state.user);
    useEffect(() => {
        // 后台可能已调整模型单价，打开工作台时刷新一次公开配置。
        void loadPublicSettings();
    }, [loadPublicSettings]);
    if (config.channelMode !== "remote") {
        return <span>本地渠道 · 不计积分</span>;
    }
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model, resolution: mode === "video" ? resolution : undefined, count: mode === "image" ? count : 1, seconds: mode === "video" ? seconds : undefined });
    if (credits <= 0) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                云端渠道 · 按后台单价计费
                {user ? <span className="inline-flex items-center gap-0.5 opacity-70">· 余额 <CreditSymbol className="text-[10px]" />{user.credits.toLocaleString()}</span> : null}
                {user && user.credits <= 0 ? <a href="/account?tab=recharge" className="text-amber-500 underline-offset-2 hover:underline">需充值</a> : null}
            </span>
        );
    }
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            本次约 <CreditSymbol className="text-acid" /> <span className="font-mono tabular-nums">{credits.toLocaleString()}</span> 算力点
            {user ? <span className="inline-flex items-center gap-0.5 opacity-70">· 余额 <CreditSymbol className="text-[10px]" />{user.credits.toLocaleString()}</span> : null}
            {user && user.credits < credits ? <a href="/account?tab=recharge" className="text-amber-500 underline-offset-2 hover:underline">余额不足</a> : null}
        </span>
    );
}
