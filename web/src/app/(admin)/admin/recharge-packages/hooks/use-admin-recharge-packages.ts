"use client";

import { App, Form } from "antd";
import { useCallback, useEffect, useState } from "react";

import { deleteAdminRechargePackage, fetchAdminRechargePackages, saveAdminRechargePackage, type AdminRechargePackage } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import type { PackageFormValues } from "../recharge-package-utils";
import { errorMessage } from "@/lib/utils";

export function useAdminRechargePackages() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [items, setItems] = useState<AdminRechargePackage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editing, setEditing] = useState<PackageFormValues | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<PackageFormValues>();

    const reload = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            setItems(await fetchAdminRechargePackages(token));
        } catch (error) {
            message.error(errorMessage(error, "加载套餐失败"));
        } finally {
            setIsLoading(false);
        }
    }, [message, token]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (!editing) return;
        form.setFieldsValue(editing);
    }, [editing, form]);

    const save = async () => {
        if (!token) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
            await saveAdminRechargePackage(
                {
                    id: editing?.id,
                    name: values.name,
                    amountFen: Math.round(values.amountYuan * 100),
                    credits: values.credits,
                    bonus: values.bonus,
                    sort: values.sort,
                    enabled: values.enabled,
                },
                token,
            );
            message.success(editing?.id ? "套餐已更新" : "套餐已创建");
            setEditing(null);
            await reload();
        } catch (error) {
            message.error(errorMessage(error, "保存失败"));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item: AdminRechargePackage) => {
        if (!token) return;
        try {
            await deleteAdminRechargePackage(item.id, token);
            message.success("套餐已删除");
            await reload();
        } catch (error) {
            message.error(errorMessage(error, "删除失败"));
        }
    };

    const toggleEnabled = async (item: AdminRechargePackage, enabled: boolean) => {
        if (!token) return;
        try {
            await saveAdminRechargePackage({ ...item, enabled }, token);
            setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)));
        } catch (error) {
            message.error(errorMessage(error, "更新失败"));
            await reload();
        }
    };

    return { items, isLoading, editing, setEditing, saving, form, reload, save, remove, toggleEnabled };
}
