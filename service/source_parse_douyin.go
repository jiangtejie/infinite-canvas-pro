package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	douyinUAApp     = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 aweme/32.7.0 NetType/WIFI Channel/App Store"
	douyinUAMobile  = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
	douyinUAAndroid = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"

	douyinShareLinkAttemptLimit = 3
	douyinSharePageBudget       = 25 * time.Second
	douyinMediaMaxBytes         = 20 << 20
	douyinMediaConcurrency      = 4
	douyinMaxImages             = 9
)

var (
	douyinShareURLPattern = regexp.MustCompile("https?://[!-~]+")
	douyinTagPattern      = regexp.MustCompile("#([^#@[:space:]，。！？、；：,.!?;:)）】》]+)")
	douyinWorkIDPatterns  = []struct {
		pattern *regexp.Regexp
		kind    string
		idIndex int
	}{
		{regexp.MustCompile("/(share/video|video)/([0-9]{15,20})"), "video", 2},
		{regexp.MustCompile("/(share/note|note)/([0-9]{15,20})"), "note", 2},
		{regexp.MustCompile("[?&]modal_id=([0-9]{15,20})"), "video", 1},
		{regexp.MustCompile("/share/mix/([0-9]{10,20})"), "mix", 1},
	}
	douyinCanonicalPattern = regexp.MustCompile("https://www[.]iesdouyin[.]com/share/(video|note)/([0-9]{15,20})")
)

var douyinTTWIDCache = struct {
	sync.Mutex
	value     string
	expiresAt time.Time
}{}

func getDouyinTTWID() string {
	douyinTTWIDCache.Lock()
	defer douyinTTWIDCache.Unlock()
	if douyinTTWIDCache.value != "" && time.Now().Before(douyinTTWIDCache.expiresAt) {
		return douyinTTWIDCache.value
	}
	return ""
}

func setDouyinTTWID(cookie string) {
	cookie = strings.TrimSpace(cookie)
	if cookie == "" {
		return
	}
	douyinTTWIDCache.Lock()
	douyinTTWIDCache.value = cookie
	douyinTTWIDCache.expiresAt = time.Now().Add(6 * time.Hour)
	douyinTTWIDCache.Unlock()
}

func pickDouyinTTWID(resp *http.Response) string {
	if resp == nil {
		return ""
	}
	for _, cookie := range resp.Cookies() {
		if strings.EqualFold(cookie.Name, "ttwid") && strings.TrimSpace(cookie.Value) != "" {
			return "ttwid=" + cookie.Value
		}
	}
	return ""
}

func isDouyinHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	if host == "" {
		return false
	}
	return host == "douyin.com" || strings.HasSuffix(host, ".douyin.com") ||
		host == "iesdouyin.com" || strings.HasSuffix(host, ".iesdouyin.com")
}

func newDouyinSourceHTTPClient(strictHosts bool, timeout time.Duration) *http.Client {
	transport := SafeProxyHTTPClient().Transport
	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 6 {
				return errors.New("重定向次数过多")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return errors.New("重定向地址无效")
			}
			if strictHosts && !isDouyinHost(req.URL.Hostname()) {
				return errors.New("重定向地址不是抖音域名")
			}
			return nil
		},
	}
}

type douyinResolvedWork struct {
	ID       string
	Kind     string
	ShareURL string
}

func parseDouyinWorkID(rawURL string) (string, string) {
	for _, item := range douyinWorkIDPatterns {
		match := item.pattern.FindStringSubmatch(rawURL)
		if len(match) > item.idIndex {
			if match[item.idIndex] != "" {
				return match[item.idIndex], item.kind
			}
		}
	}
	if strings.Contains(rawURL, "/share/user/") || strings.Contains(rawURL, "/user/") {
		return "", "user"
	}
	return "", ""
}

func extractDouyinShareURL(input string) string {
	match := douyinShareURLPattern.FindString(input)
	return strings.TrimRightFunc(match, func(char rune) bool {
		return strings.ContainsRune("，。！？、；：,.!?;:）)】]》>", char) || char == 34 || char == 39 || char == 60 || char == 62
	})
}

func resolveDouyinShareLink(ctx context.Context, link string) (douyinResolvedWork, error) {
	client := newDouyinSourceHTTPClient(true, 0)
	attempts := []time.Duration{10 * time.Second, 15 * time.Second, 20 * time.Second}
	var lastErr error
	for index := 0; index < douyinShareLinkAttemptLimit; index++ {
		requestCtx, cancel := context.WithTimeout(ctx, attempts[index])
		request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, link, nil)
		if err != nil {
			cancel()
			return douyinResolvedWork{}, safeMessageError{message: "链接格式不正确"}
		}
		request.Header.Set("User-Agent", douyinUAMobile)
		request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		request.Header.Set("Accept-Language", "zh-CN,zh;q=0.9")
		if ttwid := getDouyinTTWID(); ttwid != "" {
			request.Header.Set("Cookie", ttwid)
		}
		response, err := client.Do(request)
		if err != nil {
			cancel()
			lastErr = err
			continue
		}
		if ttwid := pickDouyinTTWID(response); ttwid != "" {
			setDouyinTTWID(ttwid)
		}
		finalURL := link
		if response.Request != nil && response.Request.URL != nil {
			finalURL = response.Request.URL.String()
		}
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		response.Body.Close()
		cancel()
		if id, kind := parseDouyinWorkID(finalURL); id != "" && kind != "mix" {
			return douyinResolvedWork{ID: id, Kind: kind, ShareURL: finalURL}, nil
		}
		if match := douyinCanonicalPattern.FindStringSubmatch(string(body)); len(match) == 3 {
			canonicalKind := "video"
			if match[1] == "note" {
				canonicalKind = "note"
			}
			return douyinResolvedWork{ID: match[2], Kind: canonicalKind, ShareURL: finalURL}, nil
		}
	}
	if id, kind := parseDouyinWorkID(link); id != "" && kind != "mix" {
		return douyinResolvedWork{ID: id, Kind: kind, ShareURL: link}, nil
	}
	if lastErr != nil {
		return douyinResolvedWork{}, safeMessageError{message: "解析失败，请稍后重试，或手动粘贴文案"}
	}
	return douyinResolvedWork{}, safeMessageError{message: "没有识别到作品链接，请粘贴具体作品链接"}
}

func fetchDouyinShareItem(ctx context.Context, work douyinResolvedWork) (map[string]any, error) {
	shareKind := "video"
	if work.Kind == "note" {
		shareKind = "note"
	}
	urls := []string{
		fmt.Sprintf("https://www.iesdouyin.com/share/%s/%s", shareKind, work.ID),
		fmt.Sprintf("https://m.douyin.com/share/%s/%s", shareKind, work.ID),
		fmt.Sprintf("https://www.douyin.com/%s/%s", shareKind, work.ID),
	}
	client := newDouyinSourceHTTPClient(true, 0)
	startedAt := time.Now()
	for round := 0; round < 2; round++ {
		for _, ua := range []string{douyinUAApp, douyinUAMobile, douyinUAAndroid} {
			for _, target := range urls {
				if time.Since(startedAt) > douyinSharePageBudget {
					return nil, nil
				}
				requestCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
				request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, target, nil)
				if err != nil {
					cancel()
					continue
				}
				request.Header.Set("User-Agent", ua)
				request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
				request.Header.Set("Accept-Language", "zh-CN,zh;q=0.9")
				if ttwid := getDouyinTTWID(); ttwid != "" {
					request.Header.Set("Cookie", ttwid)
				}
				response, err := client.Do(request)
				if err != nil {
					cancel()
					continue
				}
				freshTTWID := pickDouyinTTWID(response)
				html, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
				response.Body.Close()
				cancel()
				if freshTTWID != "" {
					setDouyinTTWID(freshTTWID)
				}
				htmlText := string(html)
				if strings.Contains(htmlText, "tiktok.com") || strings.Contains(htmlText, "访问受限") {
					continue
				}
				state, ok := extractEmbeddedJSON(htmlText, "_ROUTER_DATA")
				if !ok {
					continue
				}
				if item := findDouyinItem(state); item != nil {
					return item, nil
				}
			}
		}
	}
	return nil, nil
}

func extractEmbeddedJSON(htmlText string, marker string) (any, bool) {
	markerIndex := strings.Index(htmlText, marker)
	if markerIndex < 0 {
		return nil, false
	}
	start := strings.Index(htmlText[markerIndex:], "{")
	if start < 0 {
		return nil, false
	}
	start += markerIndex
	raw, ok := extractBalancedJSON(htmlText, start)
	if !ok {
		return nil, false
	}
	raw = sanitizeJSONUndefined(raw)
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var parsed any
	if err := decoder.Decode(&parsed); err != nil {
		return nil, false
	}
	return parsed, true
}

func extractBalancedJSON(text string, start int) (string, bool) {
	depth := 0
	inString := false
	escaped := false
	for index := start; index < len(text); index++ {
		char := text[index]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if char == 92 {
				escaped = true
				continue
			}
			if char == 34 {
				inString = false
			}
			continue
		}
		switch char {
		case 34:
			inString = true
		case 123:
			depth++
		case 125:
			depth--
			if depth == 0 {
				return text[start : index+1], true
			}
		}
	}
	return "", false
}

func sanitizeJSONUndefined(raw string) string {
	var builder strings.Builder
	builder.Grow(len(raw))
	inString := false
	escaped := false
	for index := 0; index < len(raw); index++ {
		char := raw[index]
		if inString {
			builder.WriteByte(char)
			if escaped {
				escaped = false
			} else if char == 92 {
				escaped = true
			} else if char == 34 {
				inString = false
			}
			continue
		}
		if char == 34 {
			inString = true
			builder.WriteByte(char)
			continue
		}
		if strings.HasPrefix(raw[index:], "undefined") {
			beforeOK := index == 0 || isJSONValueBoundary(raw[index-1])
			afterIndex := index + len("undefined")
			afterOK := afterIndex >= len(raw) || isJSONValueBoundary(raw[afterIndex])
			if beforeOK && afterOK {
				builder.WriteString("null")
				index = afterIndex - 1
				continue
			}
		}
		builder.WriteByte(char)
	}
	return builder.String()
}

func isJSONValueBoundary(char byte) bool {
	switch char {
	case 32, 9, 10, 13, 58, 44, 91, 93, 123, 125:
		return true
	default:
		return false
	}
}

func findDouyinItem(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		if list, ok := typed["item_list"].([]any); ok && len(list) > 0 {
			if item, ok := list[0].(map[string]any); ok {
				return item
			}
		}
		for _, child := range typed {
			if item := findDouyinItem(child); item != nil {
				return item
			}
		}
	case []any:
		for _, child := range typed {
			if item := findDouyinItem(child); item != nil {
				return item
			}
		}
	}
	return nil
}

func normalizeDouyinItem(item map[string]any, work douyinResolvedWork) ContentSource {
	desc := sourceString(item["desc"])
	tags, text := splitDouyinTags(desc)
	title := sourceString(item["title"])
	if title == "" {
		title = firstNonEmptyLine(text)
	}
	title = truncateRunes(strings.TrimSpace(title), 40)
	if title == "" {
		title = truncateRunes(text, 40)
	}

	imageURLs := collectDouyinImages(item)
	videoURL := douyinVideoURL(item)
	coverURL := douyinVideoCover(item)
	hasImages := len(imageURLs) > 0
	if !hasImages && coverURL != "" {
		imageURLs = append(imageURLs, coverURL)
	}

	kind := "text"
	if hasImages {
		kind = "image"
	} else if videoURL != "" {
		kind = "video"
	}

	images := make([]ContentSourceImage, 0, len(imageURLs))
	for _, imageURL := range imageURLs {
		images = append(images, ContentSourceImage{URL: imageURL})
	}

	return ContentSource{
		Platform: "douyin",
		SourceID: firstNonEmpty(sourceString(item["aweme_id"]), work.ID),
		Kind:     kind,
		Title:    title,
		Text:     text,
		Tags:     tags,
		Author:   douyinAuthor(item),
		Stats:    douyinStats(item),
		Images:   images,
		VideoURL: videoURL,
		CoverURL: firstNonEmpty(coverURL, firstImageURL(images)),
		ShareURL: work.ShareURL,
	}
}

func splitDouyinTags(desc string) ([]string, string) {
	matches := douyinTagPattern.FindAllStringSubmatch(desc, -1)
	tags := make([]string, 0, len(matches))
	seen := map[string]bool{}
	for _, match := range matches {
		tag := strings.TrimRight(strings.TrimSpace(match[1]), "，。！？、；：,.!?;:）)】]")
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		tags = append(tags, tag)
	}
	text := strings.TrimSpace(douyinTagPattern.ReplaceAllString(desc, ""))
	return tags, text
}

func collectDouyinImages(item map[string]any) []string {
	rawImages, _ := item["images"].([]any)
	urls := make([]string, 0, len(rawImages))
	for _, rawImage := range rawImages {
		imageMap, _ := rawImage.(map[string]any)
		if imageURL := pickDouyinURL(imageMap["url_list"]); imageURL != "" {
			urls = append(urls, imageURL)
		}
	}
	return urls
}

func douyinVideoURL(item map[string]any) string {
	video, _ := item["video"].(map[string]any)
	playAddr, _ := video["play_addr"].(map[string]any)
	return pickDouyinURL(playAddr["url_list"])
}

func douyinVideoCover(item map[string]any) string {
	video, _ := item["video"].(map[string]any)
	cover, _ := video["cover"].(map[string]any)
	return pickDouyinURL(cover["url_list"])
}

func pickDouyinURL(value any) string {
	list, _ := value.([]any)
	for index := len(list) - 1; index >= 0; index-- {
		rawURL, _ := list[index].(string)
		rawURL = strings.TrimSpace(rawURL)
		if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
			continue
		}
		if strings.HasPrefix(rawURL, "http://") {
			rawURL = "https://" + strings.TrimPrefix(rawURL, "http://")
		}
		if parsed, err := url.Parse(rawURL); err == nil && parsed.Host != "" {
			return rawURL
		}
	}
	return ""
}

func douyinAuthor(item map[string]any) string {
	author, _ := item["author"].(map[string]any)
	return sourceString(author["nickname"])
}

func douyinStats(item map[string]any) *ContentSourceStats {
	stats, _ := item["statistics"].(map[string]any)
	result := ContentSourceStats{
		Likes:    sourceInt(stats["digg_count"]),
		Collects: sourceInt(stats["collect_count"]),
		Comments: sourceInt(stats["comment_count"]),
		Shares:   sourceInt(stats["share_count"]),
	}
	if result.Likes == 0 && result.Collects == 0 && result.Comments == 0 && result.Shares == 0 {
		return nil
	}
	return &result
}

func sourceString(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func sourceInt(value any) int {
	switch typed := value.(type) {
	case float64:
		if typed > 0 {
			return int(typed)
		}
	case float32:
		if typed > 0 {
			return int(typed)
		}
	case int:
		if typed > 0 {
			return typed
		}
	case int64:
		if typed > 0 {
			return int(typed)
		}
	case json.Number:
		if parsed, err := typed.Int64(); err == nil && parsed > 0 {
			return int(parsed)
		}
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(typed)); err == nil && parsed > 0 {
			return parsed
		}
	}
	return 0
}

func firstNonEmptyLine(text string) string {
	firstLine := text
	if index := strings.IndexByte(text, 10); index >= 0 {
		firstLine = text[:index]
	}
	return strings.TrimSpace(firstLine)
}

func truncateRunes(text string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit])
}

func firstImageURL(images []ContentSourceImage) string {
	if len(images) == 0 {
		return ""
	}
	return images[0].URL
}

func parseDouyinSource(ctx context.Context, input string, uploadProvider *StorageObjectProviderInput) (ContentSourceParseResult, error) {
	link := extractDouyinShareURL(input)
	if link == "" {
		return ContentSourceParseResult{}, safeMessageError{message: "请在分享内容里带上抖音链接"}
	}
	parsedURL, err := url.Parse(link)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || !isDouyinHost(parsedURL.Hostname()) {
		return ContentSourceParseResult{}, safeMessageError{message: "只支持抖音作品链接"}
	}
	if parsedURL.Scheme == "http" {
		parsedURL.Scheme = "https"
		link = parsedURL.String()
	}

	parseCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	work, err := resolveDouyinShareLink(parseCtx, link)
	if err != nil {
		return ContentSourceParseResult{}, err
	}
	if work.Kind == "user" {
		return ContentSourceParseResult{}, safeMessageError{message: "这是主页链接，请粘贴具体作品链接"}
	}
	if work.ID == "" {
		return ContentSourceParseResult{}, safeMessageError{message: "没有识别到作品，请粘贴具体作品链接"}
	}
	item, err := fetchDouyinShareItem(parseCtx, work)
	if err != nil || item == nil {
		return ContentSourceParseResult{}, safeMessageError{message: "解析失败，请稍后重试，或手动粘贴文案"}
	}
	source := normalizeDouyinItem(item, work)
	if source.Text == "" && source.Title == "" && len(source.Images) == 0 && source.VideoURL == "" {
		return ContentSourceParseResult{}, safeMessageError{message: "这条作品没有可用的文字或图片"}
	}

	warnings := make([]string, 0, 2)
	images, failed := downloadDouyinImages(parseCtx, source.Images, source.SourceID, uploadProvider)
	source.Images = images
	if len(images) > 0 {
		source.CoverURL = images[0].URL
	}
	if failed > 0 {
		warnings = append(warnings, fmt.Sprintf("%d 张图片未能保存到服务器，链接可能过期", failed))
	}
	return ContentSourceParseResult{Source: source, Warnings: warnings}, nil
}

func downloadDouyinImages(ctx context.Context, images []ContentSourceImage, sourceID string, uploadProvider *StorageObjectProviderInput) ([]ContentSourceImage, int) {
	if len(images) == 0 {
		return images, 0
	}
	if len(images) > douyinMaxImages {
		images = images[:douyinMaxImages]
	}
	results := make([]ContentSourceImage, len(images))
	client := newDouyinSourceHTTPClient(false, 0)
	semaphore := make(chan struct{}, douyinMediaConcurrency)
	var failedCount int32
	var waitGroup sync.WaitGroup
	for index, item := range images {
		waitGroup.Add(1)
		go func(index int, rawURL string) {
			defer waitGroup.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			result, saved := downloadDouyinImage(ctx, client, rawURL, sourceID, index, uploadProvider)
			results[index] = result
			if !saved {
				atomic.AddInt32(&failedCount, 1)
			}
		}(index, item.URL)
	}
	waitGroup.Wait()
	return results, int(failedCount)
}

func downloadDouyinImage(ctx context.Context, client *http.Client, rawURL string, sourceID string, index int, uploadProvider *StorageObjectProviderInput) (ContentSourceImage, bool) {
	result := ContentSourceImage{URL: rawURL}
	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Scheme != "https" || parsedURL.Host == "" {
		return result, false
	}
	data, contentType, ok := fetchDouyinImageData(ctx, client, rawURL)
	if !ok {
		return result, false
	}
	result.MimeType = contentType
	if config, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
		result.Width = config.Width
		result.Height = config.Height
	}
	filename := fmt.Sprintf("douyin-%s-%02d.%s", firstNonEmpty(sourceID, "source"), index+1, sourceImageExtension(contentType))
	uploaded, ok := uploadDouyinImage(ctx, filename, contentType, data, uploadProvider)
	if !ok {
		return result, false
	}
	result.URL = uploaded.URL
	result.StorageKey = uploaded.StorageKey
	return result, true
}

// fetchDouyinImageData 下载图片，网络抖动/上游 5xx 重试一次；4xx、超限、非图片直接失败。
func fetchDouyinImageData(ctx context.Context, client *http.Client, rawURL string) ([]byte, string, bool) {
	for attempt := 0; attempt < 2; attempt++ {
		requestCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
		request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, rawURL, nil)
		if err != nil {
			cancel()
			return nil, "", false
		}
		request.Header.Set("User-Agent", douyinUAMobile)
		request.Header.Set("Referer", "https://www.douyin.com/")
		request.Header.Set("Accept", "image/avif,image/webp,image/*,*/*;q=0.8")
		response, err := client.Do(request)
		if err != nil {
			cancel()
			if attempt == 0 && ctx.Err() == nil {
				time.Sleep(300 * time.Millisecond)
				continue
			}
			return nil, "", false
		}
		if response.StatusCode >= 500 && attempt == 0 {
			response.Body.Close()
			cancel()
			if ctx.Err() == nil {
				time.Sleep(300 * time.Millisecond)
				continue
			}
			return nil, "", false
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			response.Body.Close()
			cancel()
			return nil, "", false
		}
		if length := response.ContentLength; length > douyinMediaMaxBytes {
			response.Body.Close()
			cancel()
			return nil, "", false
		}
		data, readErr := io.ReadAll(io.LimitReader(response.Body, douyinMediaMaxBytes+1))
		contentType := strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])
		response.Body.Close()
		cancel()
		if readErr != nil || len(data) == 0 || len(data) > douyinMediaMaxBytes {
			return nil, "", false
		}
		if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
			contentType = http.DetectContentType(data)
			if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
				return nil, "", false
			}
		}
		return data, contentType, true
	}
	return nil, "", false
}

// uploadDouyinImage 转存图片；临时网络/存储抖动重试两次，避免一张图直接把链接留在 CDN。
func uploadDouyinImage(ctx context.Context, filename string, contentType string, data []byte, uploadProvider *StorageObjectProviderInput) (UploadedStorageObject, bool) {
	for attempt := 0; attempt < 3; attempt++ {
		var uploaded UploadedStorageObject
		var err error
		if uploadProvider != nil {
			uploaded, err = UploadStorageObjectWithProvider(ctx, filename, contentType, data, uploadProvider)
		} else {
			uploaded, err = UploadStorageObject(ctx, filename, contentType, data)
		}
		if err == nil {
			return uploaded, true
		}
		if ctx.Err() != nil {
			return UploadedStorageObject{}, false
		}
		time.Sleep(time.Duration(attempt+1) * 200 * time.Millisecond)
	}
	return UploadedStorageObject{}, false
}

func sourceImageExtension(contentType string) string {
	switch strings.ToLower(contentType) {
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "image/bmp":
		return "bmp"
	default:
		return "jpg"
	}
}
