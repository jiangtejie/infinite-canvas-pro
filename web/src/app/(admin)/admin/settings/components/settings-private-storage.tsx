"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Col, Flex, Form, Input, InputNumber, Row, Switch, Typography } from "antd";

import { AdminSettingsSection, AdminSettingsSubsection } from "./settings-section";

import type { AdminStorageProvider } from "@/services/api/admin";

import { emptyS3StorageProvider, formatStorageBytes, newAdminStorageProvider } from "../settings-utils";
import type { AdminSettingsController } from "../use-admin-settings";

export function AdminSettingsPrivateStorage({ settings }: { settings: AdminSettingsController }) {
    const { form, storageProviders, measuringProviderIndex, measureStorageProviderAt } = settings;
    return (
                                <AdminSettingsSection id="private-storage" title="数据存储" description="对象存储、用户自定义存储与容量统计策略。">
                                    <Row gutter={16}>
                                        <Col xs={24} md={6}>
                                            <Form.Item label="存储模式" extra="根据对象存储配置和启用状态自动识别。">
                                                <Input disabled value="自动识别 (动态切换)" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "storage", "allowUserProvider"]} label="允许用户配置 S3/WebDAV" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "storage", "allowUserGlobalProvider"]} label="允许用户使用全局配置渠道" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "storage", "autoSyncAllAssets"]} label="全部素材云端同步" extra="上传、导入及生成的图片、视频、音频自动同步到可用云存储；关闭保持原有行为" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "storage", "capacityCheck", "enabled"]} label="定时统计容量" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "storage", "capacityCheck", "cron"]} label="容量统计 Cron">
                                                <Input placeholder="0 */6 * * *" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "storage", "capacityLimitBytes"]} label="容量上限(字节)" extra="默认 9GB，达到上限后会自动禁用该配置。">
                                                <InputNumber min={1} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Form.List name={["private", "storage", "providers"]}>
                                        {(fields, { add, remove }) => (
                                            <Flex vertical gap={12}>
                                                <Flex gap={8} wrap>
                                                    <Button icon={<PlusOutlined />} onClick={() => add(newAdminStorageProvider("s3", storageProviders))}>
                                                        新增 S3/R2 配置
                                                    </Button>
                                                    <Button icon={<PlusOutlined />} onClick={() => add(newAdminStorageProvider("webdav", storageProviders))}>
                                                        新增 WebDAV 配置
                                                    </Button>
                                                </Flex>
                                                {fields.map((field) => {
                                                    const provider = storageProviders[field.name] || emptyS3StorageProvider;
                                                    const isWebDAV = provider.type === "webdav";
                                                    const weightField = (
                                                        <Col xs={24} md={3}>
                                                            <Form.Item name={[field.name, "weight"]} label="权重">
                                                                <InputNumber min={1} className="!w-full" />
                                                            </Form.Item>
                                                        </Col>
                                                    );
                                                    return (
                                                        <AdminSettingsSubsection
                                                            key={field.key}
                                                            title={isWebDAV ? "WebDAV" : "S3/R2"}
                                                            extra={
                                                                <Flex gap={8}>
                                                                    <Button size="small" loading={measuringProviderIndex === field.name} onClick={() => void measureStorageProviderAt(field.name)}>
                                                                        统计容量
                                                                    </Button>
                                                                    <Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                                                </Flex>
                                                            }
                                                        >
                                                            <Form.Item name={[field.name, "type"]} hidden>
                                                                <Input />
                                                            </Form.Item>
                                                            <Row gutter={12}>
                                                                <Col xs={24} md={6}>
                                                                    <Form.Item name={[field.name, "name"]} label="名称">
                                                                        <Input placeholder={isWebDAV ? "WebDAV" : "Cloudflare R2"} />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={24} md={isWebDAV ? 8 : 6}>
                                                                    <Form.Item name={[field.name, "endpoint"]} label={isWebDAV ? "WebDAV 地址" : "Endpoint"}>
                                                                        <Input placeholder={isWebDAV ? "https://dav.example.com/webdav" : "https://<account>.r2.cloudflarestorage.com"} />
                                                                    </Form.Item>
                                                                </Col>
                                                                {isWebDAV && (
                                                                    <Col xs={24} md={3}>
                                                                        <Form.Item name={[field.name, "allowPrivateNetwork"]} label="允许内网" valuePropName="checked">
                                                                            <Switch />
                                                                        </Form.Item>
                                                                    </Col>
                                                                )}
                                                                {!isWebDAV && (
                                                                    <>
                                                                        <Col xs={24} md={4}>
                                                                            <Form.Item name={[field.name, "region"]} label="Region">
                                                                                <Input placeholder="auto" />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={24} md={4}>
                                                                            <Form.Item name={[field.name, "bucket"]} label="Bucket">
                                                                                <Input />
                                                                            </Form.Item>
                                                                        </Col>
                                                                    </>
                                                                )}
                                                                <Col xs={24} md={4}>
                                                                    <Form.Item name={[field.name, "enabled"]} label="启用" valuePropName="checked">
                                                                        <Switch
                                                                            onChange={(checked) => {
                                                                                if (!checked) return;
                                                                                const providers = form.getFieldValue(["private", "storage", "providers"]) || [];
                                                                                const type = form.getFieldValue(["private", "storage", "providers", field.name, "type"]);
                                                                                providers.forEach((item: AdminStorageProvider, i: number) => {
                                                                                    if (i !== field.name && item.type !== type) {
                                                                                        form.setFieldValue(["private", "storage", "providers", i, "enabled"], false);
                                                                                    }
                                                                                });
                                                                            }}
                                                                        />
                                                                    </Form.Item>
                                                                </Col>
                                                                {isWebDAV && weightField}
                                                                {isWebDAV ? (
                                                                    <>
                                                                        <Col xs={24} md={6}>
                                                                            <Form.Item name={[field.name, "pathPrefix"]} label="远程目录">
                                                                                <Input placeholder="请输入远程目录" />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={24} md={6}>
                                                                            <Form.Item name={[field.name, "username"]} label="用户名">
                                                                                <Input />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={24} md={6}>
                                                                            <Form.Item name={[field.name, "password"]} label="密码 / 应用密码">
                                                                                <Input.Password placeholder="留空沿用已保存密码" />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={0} md={6} />
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Col xs={24} md={6}>
                                                                            <Form.Item name={[field.name, "accessKeyId"]} label="Access Key ID">
                                                                                <Input />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={24} md={6}>
                                                                            <Form.Item name={[field.name, "secretAccessKey"]} label="Secret Access Key">
                                                                                <Input.Password placeholder="留空沿用已保存密钥" />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={24} md={6}>
                                                                            <Form.Item name={[field.name, "publicBaseUrl"]} label="公开访问域名">
                                                                                <Input placeholder="可选，不填则走后端代理读取" />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        <Col xs={24} md={3}>
                                                                            <Form.Item name={[field.name, "pathPrefix"]} label="路径前缀">
                                                                                <Input placeholder="canvas" />
                                                                            </Form.Item>
                                                                        </Col>
                                                                        {weightField}
                                                                    </>
                                                                )}
                                                                <Col xs={24} md={4}>
                                                                    <Form.Item label="已用容量">
                                                                        <Typography.Text>{formatStorageBytes(form.getFieldValue(["private", "storage", "providers", field.name, "capacityBytes"]) || 0)}</Typography.Text>
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={24} md={5}>
                                                                    <Form.Item name={[field.name, "capacityCheckedAt"]} label="统计时间">
                                                                        <Input disabled />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={24} md={3}>
                                                                    <Form.Item name={[field.name, "capacityExceeded"]} label="超限" valuePropName="checked">
                                                                        <Switch disabled />
                                                                    </Form.Item>
                                                                </Col>
                                                            </Row>
                                                        </AdminSettingsSubsection>
                                                    );
                                                })}
                                            </Flex>
                                        )}
                                    </Form.List>
                                </AdminSettingsSection>
    );
}
