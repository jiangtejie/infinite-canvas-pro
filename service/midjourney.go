package service

import (
	"io"
	"net/http"
	"strings"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

// Midjourney 使用 TeamoRouter 的异步 MJ 协议，不是 OpenAI Images 协议。
const ModelChannelProtocolMidjourney = "midjourney"

func IsMidjourneyChannel(channel model.ModelChannel) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolMidjourney)
}

// BuildMidjourneyChannelURL：MJ 路径是根路径 /mj/...，Base URL 不应带 /v1。
func BuildMidjourneyChannelURL(channel model.ModelChannel, path string) string {
	baseURL := normalizeModelChannelBaseURL(channel.BaseURL)
	lower := strings.ToLower(baseURL)
	if strings.HasSuffix(lower, "/v1") {
		baseURL = strings.TrimRight(baseURL[:len(baseURL)-len("/v1")], "/")
	}
	return baseURL + path
}

func MidjourneyModels() []string {
	return []string{"midjourney"}
}

// TestMidjourneyChannelModel 只做免费的渠道连通性检查，不提交付费 Imagine 任务。
func TestMidjourneyChannelModel(channel model.ModelChannel, _ string) (string, error) {
	request, err := http.NewRequest(http.MethodGet, BuildMidjourneyChannelURL(channel, "/v1/models"), nil)
	if err != nil {
		return "", safeMessageError{message: "Midjourney 测试请求创建失败"}
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return "", safeMessageError{message: "测试失败：Midjourney 渠道无响应或网络不可达"}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 256*1024))
	if response.StatusCode >= http.StatusBadRequest {
		return "", readAdminChannelError(body, response.StatusCode, "测试失败")
	}
	return "Midjourney 渠道可访问；后台不提交付费 Imagine 任务，请在画布实际生成验证。", nil
}
