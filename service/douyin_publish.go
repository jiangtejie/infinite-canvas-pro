package service

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

const (
	douyinOpenBaseURL       = "https://open.douyin.com"
	douyinShareScheme       = "snssdk1128://openplatform/share"
	douyinCredentialMargin  = 5 * time.Minute
	douyinDefaultExpiresIn  = 7200
	douyinPublishTitleLimit = 20
)

type douyinCredentialCache struct {
	key             string
	ticket          string
	ticketExpiresAt time.Time
	tokenExpiresAt  time.Time
}

var douyinCredentialState = struct {
	sync.Mutex
	value douyinCredentialCache
}{}

type douyinOpenData struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int64  `json:"expires_in"`
	Ticket      string `json:"ticket"`
	ErrorCode   int    `json:"error_code"`
	Description string `json:"description"`
}

type douyinOpenResponse struct {
	Data    douyinOpenData `json:"data"`
	Message string         `json:"message"`
}

// DouyinPublishTestResult 是后台「测试抖音配置」的脱敏结果。
type DouyinPublishTestResult struct {
	OK              bool  `json:"ok"`
	Mock            bool  `json:"mock"`
	TicketExpiresIn int64 `json:"ticketExpiresIn"`
	TokenExpiresIn  int64 `json:"tokenExpiresIn"`
}

// DouyinPublishTestInput 允许后台在保存前用表单里的值直接测试。
type DouyinPublishTestInput struct {
	ClientKey    string
	ClientSecret string
	Mock         bool
}

func DouyinPublishConfigured(setting model.PrivatePublishSetting) bool {
	normalized := normalizePrivatePublishSetting(setting)
	return strings.TrimSpace(normalized.DouyinClientKey) != "" && strings.TrimSpace(normalized.DouyinClientSecret) != ""
}

func douyinPublicBaseURL(setting model.PrivatePublishSetting) string {
	return strings.TrimRight(strings.TrimSpace(setting.PublicBaseURL), "/")
}

func douyinCredentialKey(clientKey string, clientSecret string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(clientKey) + "|" + strings.TrimSpace(clientSecret)))
	return hex.EncodeToString(sum[:16])
}

// TestDouyinPublishConfig 用当前（或表单临时）配置换取 ticket，验证权限是否真的开通。
// 不会返回 token/ticket 本身，避免敏感凭证进入浏览器。
func TestDouyinPublishConfig(ctx context.Context, input DouyinPublishTestInput) (DouyinPublishTestResult, error) {
	saved := PublishSetting()
	clientKey := strings.TrimSpace(input.ClientKey)
	clientSecret := strings.TrimSpace(input.ClientSecret)
	if clientKey == "" {
		clientKey = strings.TrimSpace(saved.DouyinClientKey)
	}
	if clientSecret == "" {
		clientSecret = strings.TrimSpace(saved.DouyinClientSecret)
	}
	mock := input.Mock
	if mock {
		return DouyinPublishTestResult{OK: true, Mock: true, TicketExpiresIn: douyinDefaultExpiresIn, TokenExpiresIn: douyinDefaultExpiresIn}, nil
	}
	if clientKey == "" || clientSecret == "" {
		return DouyinPublishTestResult{}, safeMessageError{message: "请先填写抖音 Client Key 和 Client Secret"}
	}
	ticket, ticketExpiresAt, tokenExpiresAt, err := fetchDouyinTicket(ctx, clientKey, clientSecret, true)
	if err != nil {
		return DouyinPublishTestResult{}, err
	}
	if ticket == "" {
		return DouyinPublishTestResult{}, safeMessageError{message: "抖音未返回 openTicket"}
	}
	now := time.Now()
	return DouyinPublishTestResult{
		OK:              true,
		Mock:            false,
		TicketExpiresIn: maxInt64(0, int64(ticketExpiresAt.Sub(now).Seconds())),
		TokenExpiresIn:  maxInt64(0, int64(tokenExpiresAt.Sub(now).Seconds())),
	}, nil
}

func fetchDouyinTicket(ctx context.Context, clientKey string, clientSecret string, force bool) (string, time.Time, time.Time, error) {
	cacheKey := douyinCredentialKey(clientKey, clientSecret)
	douyinCredentialState.Lock()
	cached := douyinCredentialState.value
	douyinCredentialState.Unlock()
	now := time.Now()
	if !force && cached.key == cacheKey && cached.ticket != "" && cached.ticketExpiresAt.Add(-douyinCredentialMargin).After(now) {
		return cached.ticket, cached.ticketExpiresAt, cached.tokenExpiresAt, nil
	}

	token, tokenExpiresAt, err := fetchDouyinClientToken(ctx, clientKey, clientSecret)
	if err != nil {
		return "", time.Time{}, time.Time{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, douyinOpenBaseURL+"/open/getticket/", nil)
	if err != nil {
		return "", time.Time{}, time.Time{}, safeMessageError{message: "创建抖音 ticket 请求失败"}
	}
	request.Header.Set("access-token", token)
	response, err := SafeProxyHTTPClient().Do(request)
	if err != nil {
		return "", time.Time{}, time.Time{}, safeMessageError{message: "连接抖音开放平台失败，请稍后重试"}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", time.Time{}, time.Time{}, safeMessageError{message: "读取抖音 ticket 响应失败"}
	}
	var result douyinOpenResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", time.Time{}, time.Time{}, safeMessageError{message: "抖音 ticket 接口返回格式异常，请检查配置"}
	}
	data := result.Data
	if strings.TrimSpace(data.Ticket) == "" {
		detail := strings.TrimSpace(data.Description)
		if detail == "" {
			detail = strings.TrimSpace(result.Message)
		}
		if detail == "" {
			detail = "请确认 h5.share / open.get.ticket 已开通"
		}
		return "", time.Time{}, time.Time{}, safeMessageError{message: "获取抖音 openTicket 失败：" + detail}
	}
	expiresIn := data.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = douyinDefaultExpiresIn
	}
	ticketExpiresAt := now.Add(time.Duration(expiresIn) * time.Second)
	douyinCredentialState.Lock()
	douyinCredentialState.value = douyinCredentialCache{key: cacheKey, ticket: data.Ticket, ticketExpiresAt: ticketExpiresAt, tokenExpiresAt: tokenExpiresAt}
	douyinCredentialState.Unlock()
	return data.Ticket, ticketExpiresAt, tokenExpiresAt, nil
}

func fetchDouyinClientToken(ctx context.Context, clientKey string, clientSecret string) (string, time.Time, error) {
	payload := map[string]string{
		"client_key":    clientKey,
		"client_secret": clientSecret,
		"grant_type":    "client_credential",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", time.Time{}, safeMessageError{message: "抖音凭证请求编码失败"}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, douyinOpenBaseURL+"/oauth/client_token/", bytes.NewReader(body))
	if err != nil {
		return "", time.Time{}, safeMessageError{message: "创建抖音凭证请求失败"}
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := SafeProxyHTTPClient().Do(request)
	if err != nil {
		return "", time.Time{}, safeMessageError{message: "连接抖音开放平台失败，请稍后重试"}
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", time.Time{}, safeMessageError{message: "读取抖音凭证响应失败"}
	}
	var result douyinOpenResponse
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return "", time.Time{}, safeMessageError{message: "抖音凭证接口返回格式异常，请检查配置"}
	}
	data := result.Data
	if strings.TrimSpace(data.AccessToken) == "" {
		detail := strings.TrimSpace(data.Description)
		if detail == "" {
			detail = strings.TrimSpace(result.Message)
		}
		if detail == "" {
			detail = "请检查 Client Key / Client Secret"
		}
		return "", time.Time{}, safeMessageError{message: "获取抖音 client_token 失败：" + detail}
	}
	expiresIn := data.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = douyinDefaultExpiresIn
	}
	return data.AccessToken, time.Now().Add(time.Duration(expiresIn) * time.Second), nil
}

// BuildDouyinH5Schema 生成抖音 H5 分享 schema。签名只能在服务端算。
func BuildDouyinH5Schema(setting model.PrivatePublishSetting, recordID string, title string, tags []string, imageURLs []string) (string, bool, error) {
	normalized := normalizePrivatePublishSetting(setting)
	if douyinPublicBaseURL(normalized) == "" {
		return "", false, safeMessageError{message: "请先在后台配置发布域名 publicBaseUrl"}
	}
	if !normalized.DouyinMock && !strings.HasPrefix(douyinPublicBaseURL(normalized), "https://") {
		return "", false, safeMessageError{message: "发布域名必须是公网 HTTPS 地址"}
	}
	if len(imageURLs) == 0 {
		return "", false, safeMessageError{message: "请至少选择一张图片"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	ticket := "mock_ticket"
	if normalized.DouyinMock {
		// mock 模式只用于联调二维码 UI，链接格式与签名规则和真实一致。
	} else {
		if !DouyinPublishConfigured(normalized) {
			return "", false, safeMessageError{message: "请先在后台配置抖音 Client Key / Client Secret"}
		}
		var err error
		ticket, _, _, err = fetchDouyinTicket(ctx, normalized.DouyinClientKey, normalized.DouyinClientSecret, false)
		if err != nil {
			return "", normalized.DouyinMock, err
		}
	}
	clientKey := normalized.DouyinClientKey
	if normalized.DouyinMock && clientKey == "" {
		clientKey = "mock_client_key"
	}
	nonce := randomHex(16)
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	signature := douyinSignature(nonce, ticket, timestamp)
	values := url.Values{}
	values.Set("share_type", "h5")
	values.Set("client_key", clientKey)
	values.Set("nonce_str", nonce)
	values.Set("timestamp", timestamp)
	values.Set("signature", signature)
	values.Set("state", recordID)
	if imagesJSON, err := marshalJSONNoHTMLEscape(imageURLs); err == nil {
		values.Set("image_list_path", imagesJSON)
	}
	if len(tags) > 0 {
		if tagsJSON, err := marshalJSONNoHTMLEscape(tags); err == nil {
			values.Set("hashtag_list", tagsJSON)
		}
	}
	if title = strings.TrimSpace(title); title != "" {
		values.Set("title", title)
	}
	return douyinShareScheme + "?" + values.Encode(), normalized.DouyinMock, nil
}

func douyinSignature(nonce string, ticket string, timestamp string) string {
	plain := "nonce_str=" + nonce + "&ticket=" + ticket + "&timestamp=" + timestamp
	sum := md5.Sum([]byte(plain))
	return hex.EncodeToString(sum[:])
}

func randomHex(size int) string {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func marshalJSONNoHTMLEscape(value any) (string, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return "", err
	}
	return strings.TrimSpace(buffer.String()), nil
}

func maxInt64(a int64, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
