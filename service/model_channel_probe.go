package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func fetchAdminChannelModels(channel model.ModelChannel) ([]string, error) {
	adapter, _ := matchModelProtocol(modelDiscoveryRules, channel, "")
	return adapter.models(channel)
}

func fetchOpenAIAdminChannelModels(channel model.ModelChannel) ([]string, error) {
	request, err := http.NewRequest(http.MethodGet, BuildModelChannelURL(channel, "/models"), nil)
	if err != nil {
		return nil, err
	}
	SetModelChannelAuthHeader(request, channel)
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return nil, safeMessageError{message: "读取模型失败：上游接口无响应或网络不可达"}
	}
	defer response.Body.Close()
	body := readAdminModelTestBody(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		if response.StatusCode == http.StatusNotFound && isArkAgentPlanChannel(channel) {
			return nil, safeMessageError{message: "火山方舟 Agent Plan 未提供 OpenAI /models 模型列表接口，请手动填写模型名称，例如 doubao-seedance-2.0。"}
		}
		return nil, readAdminChannelError(body, response.StatusCode, "读取模型失败")
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &payload)
	result := make([]string, 0, len(payload.Data))
	for _, item := range payload.Data {
		if strings.TrimSpace(item.ID) != "" {
			result = append(result, item.ID)
		}
	}
	sort.Strings(result)
	return result, nil
}

func isKIEAdminChannel(channel model.ModelChannel) bool {
	protocol := strings.ToLower(strings.TrimSpace(channel.Protocol))
	baseURL := strings.ToLower(strings.TrimSpace(channel.BaseURL))
	return protocol == "kie" || strings.Contains(baseURL, "kie.ai")
}

func kieMarketModels() []string {
	return []string{
		"bytedance/seedream",
		"bytedance/seedream-v4-text-to-image",
		"bytedance/seedream-v4-edit",
		"seedream/4.5-text-to-image",
		"seedream/4.5-edit",
		"seedream/5-lite-text-to-image",
		"seedream/5-lite-image-to-image",
		"seedream/5-pro-text-to-image",
		"seedream/5-pro-image-to-image",
		"seedream/5-pro-layer-decomposition",
		"z-image",
		"nano-banana-2",
		"nano-banana-2-lite",
		"google/imagen4-fast",
		"google/imagen4-ultra",
		"google/imagen4",
		"google/nano-banana-edit",
		"google/nano-banana",
		"nano-banana-pro",
		"flux-2/pro-image-to-image",
		"flux-2/pro-text-to-image",
		"flux-2/flex-image-to-image",
		"flux-2/flex-text-to-image",
		"grok-imagine-image-2-0/text-to-image",
		"grok-imagine/text-to-image",
		"grok-imagine/image-to-image",
		"gpt-image/1.5-text-to-image",
		"gpt-image/1.5-image-to-image",
		"gpt-image-2-text-to-image",
		"gpt-image-2-image-to-image",
		"topaz/image-upscale",
		"recraft/remove-background",
		"recraft/crisp-upscale",
		"ideogram/character-edit",
		"ideogram/character-remix",
		"ideogram/character",
		"ideogram/v3-text-to-image",
		"ideogram/v3-edit",
		"ideogram/v3-remix",
		"qwen/text-to-image",
		"qwen/image-to-image",
		"qwen/image-edit",
		"qwen2/image-edit",
		"qwen2/text-to-image",
		"wan/2-7-image",
		"wan/2-7-image-pro",
		"grok-imagine/text-to-video",
		"grok-imagine/image-to-video",
		"grok-imagine/upscale",
		"grok-imagine/extend",
		"grok-imagine-video-1-5-preview",
		"minimax-h3/text-to-video",
		"minimax-h3/image-to-video",
		"minimax-h3/reference-to-video",
		"kling-2.6/text-to-video",
		"kling-2.6/image-to-video",
		"kling/v2-5-turbo-image-to-video-pro",
		"kling/v2-5-turbo-text-to-video-pro",
		"kling/ai-avatar-standard",
		"kling/ai-avatar-pro",
		"kling/v2-1-master-image-to-video",
		"kling/v2-1-master-text-to-video",
		"kling/v2-1-pro",
		"kling/v2-1-standard",
		"kling-2.6/motion-control",
		"kling-3.0/motion-control",
		"kling-3.0/video",
		"kling-3.0-omni/text-to-video",
		"kling-3.0-omni/image-to-video",
		"kling-3.0-omni/reference-to-video",
		"kling-3.0-omni/transformation",
		"kling/v3-turbo-text-to-video",
		"kling/v3-turbo-image-to-video",
		"bytedance/seedance-2",
		"bytedance/seedance-2-fast",
		"bytedance/seedance-2-mini",
		"bytedance/seedance-1.5-pro",
		"bytedance/v1-pro-fast-image-to-video",
		"bytedance/v1-pro-image-to-video",
		"bytedance/v1-pro-text-to-video",
		"bytedance/v1-lite-image-to-video",
		"bytedance/v1-lite-text-to-video",
		"hailuo/2-3-image-to-video-pro",
		"hailuo/2-3-image-to-video-standard",
		"hailuo/02-text-to-video-pro",
		"hailuo/02-image-to-video-pro",
		"hailuo/02-text-to-video-standard",
		"hailuo/02-image-to-video-standard",
		"wan/2-2-a14b-image-to-video-turbo",
		"wan/2-2-a14b-speech-to-video-turbo",
		"wan/2-2-a14b-text-to-video-turbo",
		"wan/2-2-animate-move",
		"wan/2-2-animate-replace",
		"wan/2-6-image-to-video",
		"wan/2-6-text-to-video",
		"wan/2-6-video-to-video",
		"wan/2-6-flash-image-to-video",
		"wan/2-6-flash-video-to-video",
		"wan/2-5-image-to-video",
		"wan/2-5-text-to-video",
		"wan/2-7-text-to-video",
		"wan/2-7-image-to-video",
		"wan/2-7-videoedit",
		"wan/2-7-r2v",
		"topaz/video-upscale",
		"infinitalk/from-audio",
		"happyhorse/text-to-video",
		"happyhorse/image-to-video",
		"happyhorse/reference-to-video",
		"happyhorse/video-edit",
		"happyhorse-1-1/text-to-video",
		"happyhorse-1-1/image-to-video",
		"happyhorse-1-1/reference-to-video",
		"happyhorse-1-1/text-to-video",
		"happyhorse-1-1/image-to-video",
		"happyhorse-1-1/reference-to-video",
		"gemini-omni-video",
	}
}

func testAdminChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	if strings.TrimSpace(modelName) == "" {
		return "", errors.New("缺少模型名称")
	}
	adapter, _ := matchModelProtocol(modelGenerationTestRules, channel, modelName)
	return adapter.testModel(channel, modelName)
}

func testOpenAIChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": modelName,
		"messages": []map[string]string{{
			"role":    "user",
			"content": "hi",
		}},
	})
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return "", safeMessageError{message: "测试失败：上游接口无响应或网络不可达"}
	}
	defer response.Body.Close()
	responseBody := readAdminModelTestBody(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return "", readAdminChannelError(responseBody, response.StatusCode, "测试失败")
	}
	var payload struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	_ = json.Unmarshal(responseBody, &payload)
	if len(payload.Choices) > 0 && strings.TrimSpace(payload.Choices[0].Message.Content) != "" {
		return payload.Choices[0].Message.Content, nil
	}
	return "ok", nil
}

func fetchGeminiAdminChannelModels(channel model.ModelChannel) ([]string, error) {
	if IsTeamorouterBaseURL(channel.BaseURL) {
		return fetchTeamorouterAdminChannelModels(channel)
	}
	result := []string{}
	pageToken := ""
	for {
		path := "/v1beta/models"
		if pageToken != "" {
			path += "?pageToken=" + url.QueryEscape(pageToken)
		}
		request, err := http.NewRequest(http.MethodGet, BuildGeminiChannelURL(channel, path), nil)
		if err != nil {
			return nil, err
		}
		SetModelChannelAuthHeader(request, channel)
		response, err := adminModelHTTPClient.Do(request)
		if err != nil {
			return nil, safeMessageError{message: "读取模型失败：上游接口无响应或网络不可达"}
		}
		body := readAdminModelTestBody(response.Body)
		response.Body.Close()
		if response.StatusCode >= http.StatusBadRequest {
			return nil, readAdminChannelError(body, response.StatusCode, "读取模型失败")
		}
		var payload struct {
			Models []struct {
				Name                       string   `json:"name"`
				SupportedGenerationMethods []string `json:"supportedGenerationMethods"`
			} `json:"models"`
			NextPageToken string `json:"nextPageToken"`
		}
		if json.Unmarshal(body, &payload) != nil {
			return nil, safeMessageError{message: "读取模型失败：上游响应无法解析"}
		}
		for _, item := range payload.Models {
			name := strings.TrimPrefix(strings.TrimSpace(item.Name), "models/")
			methods := strings.Join(item.SupportedGenerationMethods, ",")
			if name != "" && !strings.Contains(strings.ToLower(name), "embed") && (strings.Contains(methods, "generateContent") || strings.Contains(methods, "predictLongRunning") || strings.HasPrefix(strings.ToLower(name), "veo-") || strings.HasPrefix(strings.ToLower(name), "imagen-")) {
				result = append(result, name)
			}
		}
		pageToken = strings.TrimSpace(payload.NextPageToken)
		if pageToken == "" {
			break
		}
	}
	seen := map[string]bool{}
	unique := result[:0]
	for _, name := range result {
		if !seen[name] {
			seen[name] = true
			unique = append(unique, name)
		}
	}
	result = unique
	sort.Strings(result)
	if len(result) == 0 {
		return nil, safeMessageError{message: "Gemini 模型列表为空"}
	}
	return result, nil
}

func fetchTeamorouterAdminChannelModels(channel model.ModelChannel) ([]string, error) {
	models := []string{}
	videoModels := map[string]bool{}
	for _, query := range []string{"", "?type=video"} {
		request, err := http.NewRequest(http.MethodGet, BuildModelChannelURL(channel, "/models"+query), nil)
		if err != nil {
			return nil, err
		}
		SetModelChannelAuthHeader(request, channel)
		response, err := adminModelHTTPClient.Do(request)
		if err != nil {
			return nil, safeMessageError{message: "读取模型失败：上游接口无响应或网络不可达"}
		}
		body := readAdminModelTestBody(response.Body)
		response.Body.Close()
		if response.StatusCode >= http.StatusBadRequest {
			return nil, readAdminChannelError(body, response.StatusCode, "读取模型失败")
		}
		var payload struct {
			Data []struct {
				ID        string `json:"id"`
				ModelSpec struct {
					Offline bool `json:"offline"`
				} `json:"model_spec"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &payload) != nil {
			return nil, safeMessageError{message: "读取模型失败：上游响应无法解析"}
		}
		for _, item := range payload.Data {
			name := strings.TrimSpace(item.ID)
			if name == "" || strings.Contains(strings.ToLower(name), "embed") || query != "" && item.ModelSpec.Offline {
				continue
			}
			if query != "" {
				videoModels[name] = true
			} else if !isVideoModelName(name) {
				models = append(models, name)
			}
		}
	}
	for name := range videoModels {
		models = append(models, name)
	}
	models = uniqueModelNames(models)
	sort.Strings(models)
	if len(models) == 0 {
		return nil, safeMessageError{message: "TeamoRouter 模型列表为空"}
	}
	return models, nil
}

func testGeminiChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	lowerModel := strings.ToLower(strings.TrimSpace(modelName))
	if strings.HasPrefix(lowerModel, "veo-") || strings.Contains(lowerModel, "image") || strings.Contains(lowerModel, "tts") {
		return "模型列表与渠道配置有效；图片、视频和语音模型未执行付费生成测试。", nil
	}
	body := GeminiTextRequestBody(modelName, "hi")
	body, _ = StripGeminiModelField(body, "application/json")
	request, err := http.NewRequest(http.MethodPost, BuildGeminiChannelURL(channel, GeminiModelActionPath(modelName, "generateContent")), strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	SetModelChannelAuthHeader(request, channel)
	request.Header.Set("Content-Type", "application/json")
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return "", safeMessageError{message: "测试失败：上游接口无响应或网络不可达"}
	}
	defer response.Body.Close()
	responseBody := readAdminModelTestBody(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return "", readAdminChannelError(responseBody, response.StatusCode, "测试失败")
	}
	if text := GeminiResponseText(responseBody); text != "" {
		return text, nil
	}
	return "ok", nil
}

func testGLMTTSChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model":           modelName,
		"input":           "你好，这是语音模型测试。",
		"voice":           "tongtong",
		"response_format": "wav",
		"speed":           1,
	})
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(channel, "/audio/speech"), strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return "", safeMessageError{message: "测试失败：上游接口无响应或网络不可达"}
	}
	defer response.Body.Close()
	responseBody := readAdminModelTestBody(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return "", readAdminChannelError(responseBody, response.StatusCode, "测试失败")
	}
	if len(responseBody) == 0 {
		return "", safeMessageError{message: "测试失败：GLM-TTS 未返回音频数据"}
	}
	return "ok", nil
}

func testMiMoTTSChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	if strings.EqualFold(strings.TrimSpace(modelName), "mimo-v2.5-tts-voiceclone") {
		return "MiMo VoiceClone 需要画布连接 MP3/WAV 参考音频，后台不发送克隆样本，因此未执行上游生成测试。", nil
	}
	messages := []map[string]string{{"role": "assistant", "content": "你好，这是语音模型测试。"}}
	audio := map[string]any{"format": "wav"}
	if strings.EqualFold(strings.TrimSpace(modelName), "mimo-v2.5-tts-voicedesign") {
		messages = append([]map[string]string{{"role": "user", "content": "自然清晰的年轻女声"}}, messages...)
	} else {
		audio["voice"] = "冰糖"
	}
	body, _ := json.Marshal(map[string]any{"model": modelName, "messages": messages, "audio": audio})
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return "", safeMessageError{message: "测试失败：上游接口无响应或网络不可达"}
	}
	defer response.Body.Close()
	responseBody := readAdminModelTestBody(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return "", readAdminChannelError(responseBody, response.StatusCode, "测试失败")
	}
	var payload struct {
		Choices []struct {
			Message struct {
				Audio *struct {
					Data string `json:"data"`
				} `json:"audio"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(responseBody, &payload) != nil || len(payload.Choices) == 0 || payload.Choices[0].Message.Audio == nil || strings.TrimSpace(payload.Choices[0].Message.Audio.Data) == "" {
		return "", safeMessageError{message: "测试失败：MiMo TTS 未返回音频数据"}
	}
	return "ok", nil
}

func testArkSeedanceChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	if strings.TrimSpace(modelName) == "" {
		return "", errors.New("缺少模型名称")
	}
	if strings.TrimSpace(channel.BaseURL) == "" {
		return "", safeMessageError{message: "缺少接口地址"}
	}
	if strings.TrimSpace(channel.APIKey) == "" {
		return "", safeMessageError{message: "缺少 API Key"}
	}
	if !isArkAgentPlanChannel(channel) {
		return "Seedance 视频模型不会发送 /chat/completions 文本测试。已检查 Base URL、API Key 和模型名非空；未调用视频生成接口，因此未验证套餐额度或模型权限。", nil
	}
	return "Agent Plan / Seedance 视频模型配置格式已通过。后台测试不会调用视频生成接口，因此未验证 API Key、套餐额度或模型权限；请在画布中使用视频生成验证。", nil
}

func readAdminChannelError(body []byte, statusCode int, fallback string) error {
	var payload struct {
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
		Msg string `json:"msg"`
	}
	if len(body) > 0 && json.Unmarshal(body, &payload) == nil {
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			return safeMessageError{message: payload.Error.Message}
		}
		if strings.TrimSpace(payload.Msg) != "" {
			return safeMessageError{message: payload.Msg}
		}
	}
	if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden {
		return safeMessageError{message: fmt.Sprintf("上游接口鉴权失败（%d），请检查 API Key、套餐权限或模型权限", statusCode)}
	}
	if statusCode == http.StatusTooManyRequests {
		return safeMessageError{message: "上游接口限流或额度不足（429），请稍后重试或检查额度"}
	}
	if statusCode > 0 {
		return safeMessageError{message: fmt.Sprintf("%s：%d", fallback, statusCode)}
	}
	return safeMessageError{message: fallback}
}
