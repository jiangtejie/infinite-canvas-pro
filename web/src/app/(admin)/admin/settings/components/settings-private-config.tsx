"use client";

import { Flex, Form } from "antd";

import { emptySettings } from "../settings-utils";
import type { AdminSettingsController } from "../use-admin-settings";

import { AdminSettingsPrivateChannels } from "./settings-private-channels";
import { AdminSettingsPrivateContentSection } from "./settings-private-content";
import { AdminSettingsPrivatePaymentSection } from "./settings-private-payment";
import { AdminSettingsPrivatePromptSections } from "./settings-private-prompts";
import { AdminSettingsPrivatePublishSection } from "./settings-private-publish";
import { AdminSettingsPrivateStorage } from "./settings-private-storage";

export function AdminSettingsPrivateConfig({ settings }: { settings: AdminSettingsController }) {
    return (
        <Form form={settings.form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
            <Flex vertical gap={12}>
                <AdminSettingsPrivatePromptSections />
                <AdminSettingsPrivateContentSection />
                <AdminSettingsPrivatePublishSection />
                <AdminSettingsPrivatePaymentSection />
                <AdminSettingsPrivateStorage settings={settings} />
                <AdminSettingsPrivateChannels settings={settings} />
            </Flex>
        </Form>
    );
}
