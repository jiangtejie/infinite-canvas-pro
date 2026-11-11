package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

type midjourneyTaskIDCallbackKey struct{}

const (
	midjourneySubmitPath = "/mj/submit/imagine"
	midjourneyPollEvery  = 10 * time.Second
	midjourneyTimeout    = 9 * time.Minute
	midjourney404Grace   = 2 * time.Minute
)

func isMidjourneyProxyChannel(channel model.ModelChannel) bool {
	return service.IsMidjourneyChannel(channel)
}

func midjourneyImagePath(channel model.ModelChannel, _ string, path string) (string, bool) {
	if !isMidjourneyProxyChannel(channel) {
		return path, false
	}
	switch path {
	case "/images/generations", "/images/edits":
		return midjourneySubmitPath, true
	default:
		return path, false
	}
}

func prepareMidjourneyImageRequest(input aiProtocolRequest) (aiProtocolRequest, bool, error) {
	if !isMidjourneyProxyChannel(input.channel) {
		return input, false, nil
	}
	input.failureLabel = "Midjourney"
	if input.endpoint != "/images/generations" && input.endpoint != "/images/edits" {
		return input, true, errors.New("Midjourney 渠道仅支持图片生成")
	}
	if input.endpoint == "/images/edits" || strings.HasPrefix(strings.ToLower(input.contentType), "multipart/") {
		return input, true, errors.New("Midjourney 当前仅支持文生图，不支持参考图或图片编辑")
	}
	body, contentType, err := normalizeMidjourneyImageBody(input.body)
	if err != nil {
		return input, true, err
	}
	input.body, input.contentType = body, contentType
	return input, true, nil
}

func normalizeMidjourneyImageBody(body []byte) ([]byte, string, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", errors.New("Midjourney 请求格式错误")
	}
	for _, key := range []string{"image", "images", "image_url", "image_urls", "reference_images"} {
		if value, ok := payload[key]; ok && value != nil {
			return nil, "", errors.New("Midjourney 当前仅支持文生图，不支持参考图或图片编辑")
		}
	}
	prompt := strings.TrimSpace(midjourneyStringValue(payload["prompt"]))
	if prompt == "" {
		return nil, "", errors.New("Midjourney 提示词不能为空")
	}
	if err := validateMidjourneyPrompt(prompt); err != nil {
		return nil, "", err
	}
	if !strings.Contains(prompt, "--ar ") {
		if aspect := midjourneyAspectFlag(midjourneyStringValue(payload["size"])); aspect != "" {
			prompt += " " + aspect
		}
	}
	request := map[string]any{"botType": "MID_JOURNEY", "prompt": prompt}
	encoded, err := json.Marshal(request)
	if err != nil {
		return nil, "", errors.New("Midjourney 请求编码失败")
	}
	return encoded, "application/json", nil
}

func midjourneyStringValue(value any) string {
	text, _ := value.(string)
	return text
}

func validateMidjourneyPrompt(prompt string) error {
	lower := strings.ToLower(prompt)
	for _, option := range []string{"--hd", "--q ", "--quality", "--repeat", "--r ", "--fast", "--turbo", "--relax", "--niji"} {
		if strings.Contains(lower, option) {
			return errors.New("Midjourney 当前不支持 " + strings.TrimSpace(option) + " 参数，请从提示词中移除")
		}
	}
	return nil
}

func midjourneyAspectFlag(size string) string {
	size = strings.ToLower(strings.TrimSpace(size))
	exact := map[string]string{
		"1024x1024": "1:1",
		"1536x1024": "3:2",
		"1024x1536": "2:3",
		"1792x1024": "16:9",
		"1024x1792": "9:16",
		"1280x720":  "16:9",
		"720x1280":  "9:16",
		"1152x864":  "4:3",
		"864x1152":  "3:4",
	}
	if ratio := exact[size]; ratio != "" {
		return "--ar " + ratio
	}
	return ""
}

func copyMidjourneyImageResponse(w http.ResponseWriter, response *http.Response, request *http.Request, channel model.ModelChannel, context aiLogContext, onFailure func()) bool {
	if !strings.Contains(request.URL.Path, midjourneySubmitPath) {
		return false
	}
	payload, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	taskID, message := readMidjourneySubmitResult(payload)
	if message != "" {
		if onFailure != nil {
			onFailure()
		}
		writeMidjourneyImageError(w, http.StatusBadGateway, message, context)
		return true
	}
	if callback, ok := request.Context().Value(midjourneyTaskIDCallbackKey{}).(func(string)); ok {
		callback(taskID)
	}
	log.Printf("Midjourney imagine submitted: task=%s channel=%s endpoint=%s", taskID, channel.Name, context.Endpoint)
	imageURLs, errorMessage := pollMidjourneyImageTask(request, channel, taskID)
	if errorMessage != "" {
		if onFailure != nil {
			onFailure()
		}
		writeMidjourneyImageError(w, http.StatusBadGateway, errorMessage, context)
		return true
	}
	writeMidjourneyImagesResponse(w, http.StatusOK, imageURLs, context)
	return true
}

func readMidjourneySubmitResult(payload []byte) (string, string) {
	var result struct {
		Code        int             `json:"code"`
		Description string          `json:"description"`
		Result      json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(payload, &result); err != nil {
		return "", "Midjourney 提交接口返回格式错误"
	}
	if result.Code != 1 && result.Code != 22 {
		return "", firstNonEmpty(result.Description, "Midjourney 提交未接受")
	}
	taskID := strings.TrimSpace(string(result.Result))
	taskID = strings.Trim(taskID, "\"")
	if taskID == "" || taskID == "null" {
		return "", "Midjourney 未返回任务 ID"
	}
	if len(taskID) > 128 {
		return "", "Midjourney 任务 ID 异常"
	}
	return taskID, ""
}

func pollMidjourneyImageTask(request *http.Request, channel model.ModelChannel, taskID string) ([]string, string) {
	pollURL := service.BuildMidjourneyChannelURL(channel, "/mj/task/"+url.PathEscape(taskID)+"/fetch")
	deadline := time.Now().Add(midjourneyTimeout)
	var notFoundSince time.Time
	for attempt := 0; ; attempt++ {
		if attempt > 0 {
			select {
			case <-request.Context().Done():
				return nil, request.Context().Err().Error()
			case <-time.After(midjourneyPollEvery):
			}
		}
		if time.Now().After(deadline) {
			return nil, "Midjourney 任务超时，请稍后用 task ID 查询: " + taskID
		}
		pollRequest, err := http.NewRequestWithContext(request.Context(), http.MethodGet, pollURL, nil)
		if err != nil {
			return nil, err.Error()
		}
		pollRequest.Header.Set("Authorization", "Bearer "+channel.APIKey)
		response, err := service.HTTPClientForChannel(channel).Do(pollRequest)
		if err != nil {
			return nil, "Midjourney 查询失败：" + err.Error()
		}
		body, _ := io.ReadAll(io.LimitReader(response.Body, 512*1024))
		_ = response.Body.Close()
		if response.StatusCode == http.StatusNotFound {
			if notFoundSince.IsZero() {
				notFoundSince = time.Now()
			}
			if time.Since(notFoundSince) < midjourney404Grace {
				continue
			}
			return nil, "Midjourney 任务不存在或尚未注册: " + taskID
		}
		if response.StatusCode >= http.StatusBadRequest {
			return nil, readUpstreamAIErrorMessage(body, response.StatusCode)
		}
		imageURLs, done, errorMessage := readMidjourneyTaskResult(body)
		if errorMessage != "" {
			return nil, errorMessage
		}
		if done {
			if len(imageURLs) == 0 {
				return nil, "Midjourney 任务完成但没有返回图片"
			}
			return imageURLs, ""
		}
		if notFoundSince.IsZero() == false {
			notFoundSince = time.Time{}
		}
	}
}

func readMidjourneyTaskResult(payload []byte) ([]string, bool, string) {
	var result struct {
		ID         string   `json:"id"`
		Status     string   `json:"status"`
		Progress   string   `json:"progress"`
		ImageURL   string   `json:"imageUrl"`
		ImageURLs  []string `json:"imageUrls"`
		FailReason string   `json:"failReason"`
	}
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, false, "Midjourney 查询接口返回格式错误"
	}
	status := strings.ToUpper(strings.TrimSpace(result.Status))
	switch status {
	case "SUCCESS":
		urls := make([]string, 0, len(result.ImageURLs)+1)
		if strings.HasPrefix(result.ImageURL, "http://") || strings.HasPrefix(result.ImageURL, "https://") {
			urls = append(urls, result.ImageURL)
		}
		for _, imageURL := range result.ImageURLs {
			if strings.HasPrefix(imageURL, "http://") || strings.HasPrefix(imageURL, "https://") {
				urls = append(urls, imageURL)
			}
		}
		return urls, true, ""
	case "FAILURE", "CANCEL":
		return nil, false, firstNonEmpty(result.FailReason, "Midjourney 任务失败")
	default:
		return nil, false, ""
	}
}

func writeMidjourneyImagesResponse(w http.ResponseWriter, statusCode int, imageURLs []string, logContext aiLogContext) {
	items := make([]map[string]any, 0, len(imageURLs))
	for _, imageURL := range imageURLs {
		items = append(items, map[string]any{"url": imageURL})
	}
	body, _ := json.Marshal(map[string]any{"created": time.Now().Unix(), "data": items})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write(body)
	saveAIProxyLog(logContext, statusCode, string(body), "")
}

func writeMidjourneyImageError(w http.ResponseWriter, statusCode int, message string, logContext aiLogContext) {
	if statusCode < http.StatusBadRequest {
		statusCode = http.StatusBadGateway
	}
	body, _ := json.Marshal(map[string]any{"error": map[string]any{"message": message}})
	w.Header().Set("Content-Type", "application/json")
	// 前端遇到 MJ 错误绝不能重试整个 POST，否则可能重复创建 Imagine 任务。
	w.Header().Set("X-Midjourney-No-Retry", "1")
	w.WriteHeader(statusCode)
	_, _ = w.Write(body)
	saveAIProxyLog(logContext, statusCode, string(body), message)
}
