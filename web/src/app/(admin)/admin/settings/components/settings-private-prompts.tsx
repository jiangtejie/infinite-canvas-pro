"use client";

import { Col, Form, Input, InputNumber, Row, Switch } from "antd";

import { AdminSettingsSection } from "./settings-section";

export function AdminSettingsPrivatePromptSections() {
    return (
        <>
                                <AdminSettingsSection id="private-prompt-sync" title="提示词定时同步" description="每天定时同步内置 GitHub 远程提示词源。">
                                    <Row gutter={16} align="middle">
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "promptSync", "enabled"]} label="开启定时同步" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={16}>
                                            <Form.Item name={["private", "promptSync", "cron"]} label="Cron 表达式" extra="默认每天 0 点同步内置 GitHub 远程提示词源">
                                                <Input placeholder="0 0 * * *" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </AdminSettingsSection>
                                <AdminSettingsSection id="private-ai-logs" title="AI 调用日志" description="本地直连与云端调用的日志记录、清理策略。">
                                    <Row gutter={16}>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "aiLog", "localDirectReportEnabled"]} label="本地直连日志上报" valuePropName="checked" extra="关闭后本地直连不上报；云端渠道仍默认记录。">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "aiLog", "cleanup", "enabled"]} label="开启自动清理" valuePropName="checked" extra="日志按天写入本地文件，不保存到 SQLite。">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "aiLog", "cleanup", "retentionDays"]} label="保留天数" extra="默认保留 14 天，超过后定时删除对应日期日志文件。">
                                                <InputNumber min={1} precision={0} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={6}>
                                            <Form.Item name={["private", "aiLog", "cleanup", "cron"]} label="清理 Cron">
                                                <Input placeholder="0 3 * * *" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </AdminSettingsSection>
                        </>
    );
}
