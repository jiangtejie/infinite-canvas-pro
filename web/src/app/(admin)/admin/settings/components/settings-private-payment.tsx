"use client";

import { Col, Form, Input, InputNumber, Row } from "antd";

import { AdminSettingsSection } from "./settings-section";

export function AdminSettingsPrivatePaymentSection() {
    return (
        <AdminSettingsSection title="微信支付" description="支付网关、回调与证书配置；密钥留空表示保持已保存值。">
                                    <Row gutter={16}>
                                        <Col xs={24} md={12}>
                                            <Form.Item name={["private", "payment", "lxPayServerUrl"]} label="支付网关地址" extra="默认指向同机部署的 lx-pay 服务（http://127.0.0.1:8989）；如网关部署在其他机器，改成对应地址。">
                                                <Input placeholder="https://pay.example.com" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name={["private", "payment", "lxPayNotifyUrl"]} label="回调地址" extra="微信支付成功后的服务端回调，需要公网可达。">
                                                <Input placeholder="https://your-domain.com/api/payment/notify" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name={["private", "payment", "lxPayAppId"]} label="应用 ID">
                                                <Input placeholder="微信支付 AppID" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name={["private", "payment", "lxPayAppSecret"]} label="应用密钥" extra="留空表示保持已保存的密钥不变。">
                                                <Input.Password placeholder="已配置时留空" autoComplete="new-password" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name={["private", "payment", "lxPayApiV3Key"]} label="APIv3 密钥" extra="用于解密微信 V3 回调，长度必须 32 位；留空表示保持不变。">
                                                <Input.Password placeholder="32 位 APIv3 密钥" autoComplete="new-password" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name={["private", "payment", "lxPayPlatformCertPath"]} label="平台证书路径" extra="服务器上微信支付平台证书 PEM 文件路径。">
                                                <Input placeholder="/etc/wxpay/apiclient_cert.pem" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "payment", "lxPayTimeoutMs"]} label="请求超时(毫秒)">
                                                <InputNumber min={1000} step={1000} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "payment", "lxPayMaxRetries"]} label="失败重试次数">
                                                <InputNumber min={0} max={10} precision={0} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "payment", "orderMinutes"]} label="订单有效期(分钟)">
                                                <InputNumber min={1} max={120} precision={0} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </AdminSettingsSection>
    );
}
