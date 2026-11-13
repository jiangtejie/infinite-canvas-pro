"use client";

import { Alert, Form, Switch } from "antd";

import { AdminSettingsSection } from "./settings-section";

export function AdminSettingsPrivateContentSection() {
    return (
        <AdminSettingsSection id="private-content" title="内容解析" description="控制外部内容解析能力，关闭后不影响已解析素材。">
            <Form.Item
                name={["private", "content", "sourceParseEnabled"]}
                label="允许抖音图文解析"
                valuePropName="checked"
                extra="关闭后画布素材源节点无法发起解析，已解析的素材和复刻节点不受影响。"
            >
                <Switch />
            </Form.Item>
            <Alert
                type="info"
                showIcon
                title="抖音解析依赖外部分享页，遇到平台风控或改版时可临时关闭；关闭后用户仍可手动粘贴文案继续创作。"
            />
        </AdminSettingsSection>
    );
}
