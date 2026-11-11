"use client";

import { Alert, App, Button, Form, Input, Space, Switch } from "antd";

import { AdminSettingsSection } from "./settings-section";
import { useState } from "react";

import { testAdminDouyinPublish, type AdminSettings, type DouyinPublishTestResult } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function AdminSettingsPrivatePublishSection() {
    const form = Form.useFormInstance<AdminSettings>();
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<DouyinPublishTestResult | null>(null);

    const testConfig = async () => {
        if (!token) {
            message.warning("请先登录管理员账号");
            return;
        }
        const publish = form.getFieldValue(["private", "publish"]) as AdminSettings["private"]["publish"] | undefined;
        setTesting(true);
        setResult(null);
        try {
            const data = await testAdminDouyinPublish(token, {
                clientKey: publish?.douyinClientKey || "",
                clientSecret: publish?.douyinClientSecret || "",
                mock: publish?.douyinMock === true,
            });
            setResult(data);
            message.success(data.mock ? "MOCK 模式配置正常" : "抖音 client_token / ticket 测试通过");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "抖音配置测试失败");
        } finally {
            setTesting(false);
        }
    };

    return (
        <AdminSettingsSection title="抖音发布" description="发布能力依赖公网域名与抖音开放平台权限。">
            <Alert
                type="info"
                showIcon
                className="!mb-4"
                title="发布图片会保存在服务器发布目录，并通过 publicBaseUrl 下的 /api/publish/media/ 提供公网 HTTPS 访问，不依赖 OSS。"
            />
            <Form.Item name={["private", "publish", "publicBaseUrl"]} label="发布域名 publicBaseUrl" extra="必须与用户访问画布的域名一致，例如 https://jl.lx.cq.cn；图片和扫码素材都通过这个域名对外提供。">
                <Input placeholder="https://jl.lx.cq.cn" />
            </Form.Item>
            <Form.Item name={["private", "publish", "douyinClientKey"]} label="抖音 Client Key" extra="开放平台网站应用的总览页获取。">
                <Input placeholder="Client Key" autoComplete="off" />
            </Form.Item>
            <Form.Item name={["private", "publish", "douyinClientSecret"]} label="抖音 Client Secret" extra="只保存在后端私有设置；已配置时留空表示保持原值，不会回显。">
                <Input.Password placeholder="留空保持原值" autoComplete="new-password" />
            </Form.Item>
            <Form.Item name={["private", "publish", "douyinMock"]} label="MOCK 模式" valuePropName="checked" extra="未完成真实扫码联调时打开：生成同格式的假二维码，不请求抖音开放平台，不消耗真实权限。">
                <Switch />
            </Form.Item>
            <Space wrap>
                <Button onClick={() => void testConfig()} loading={testing}>
                    测试抖音配置
                </Button>
                <span className="text-xs text-muted-foreground">
                    测试会真实调用 client_token 和 open/getticket，确认 h5.share、open.get.ticket 权限已开通。
                </span>
            </Space>
            {result ? (
                <Alert
                    className="!mt-4"
                    type="success"
                    showIcon
                    title={result.mock ? "MOCK 模式可用" : "抖音配置可用"}
                    description={result.mock ? "当前不会请求抖音开放平台；关闭 MOCK 后才会生成真实分享链接。" : `ticket 有效期约 ${Math.max(1, Math.round(result.ticketExpiresIn / 60))} 分钟，client_token 有效期约 ${Math.max(1, Math.round(result.tokenExpiresIn / 60))} 分钟。`}
                />
            ) : null}
        </AdminSettingsSection>
    );
}
