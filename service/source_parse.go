package service

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

// ContentSourceImage 解析结果中的一张图片。URL 是后端可直接访问的持久地址；
// 服务端存储不可用时保留原始 CDN 地址，并附带 warning。
type ContentSourceImage struct {
	URL        string `json:"url"`
	StorageKey string `json:"storageKey,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	MimeType   string `json:"mimeType,omitempty"`
}

// ContentSourceStats 原作的互动数据；全为 0 时返回 nil，前端整行隐藏。
type ContentSourceStats struct {
	Likes    int `json:"likes"`
	Collects int `json:"collects"`
	Comments int `json:"comments"`
	Shares   int `json:"shares"`
}

// ContentSource 解析后的图文/视频素材。
type ContentSource struct {
	Platform string               `json:"platform"`
	SourceID string               `json:"sourceId"`
	Kind     string               `json:"kind"`
	Title    string               `json:"title"`
	Text     string               `json:"text"`
	Tags     []string             `json:"tags"`
	Author   string               `json:"author"`
	Stats    *ContentSourceStats  `json:"stats"`
	Images   []ContentSourceImage `json:"images"`
	VideoURL string               `json:"videoUrl"`
	CoverURL string               `json:"coverUrl"`
	ShareURL string               `json:"shareUrl"`
}

// ContentSourceParseResult 解析接口的返回数据。
type ContentSourceParseResult struct {
	Source   ContentSource `json:"source"`
	Warnings []string      `json:"warnings"`
}

const (
	contentSourceParseWindow = 10 * time.Minute
	contentSourceParseLimit  = 20
)

var contentSourceParseLimiter = struct {
	sync.Mutex
	hits     map[string][]time.Time
	lastScan time.Time
}{hits: map[string][]time.Time{}, lastScan: time.Now()}

// 全局解析并发上限：单次解析最多下载 9 张图，避免多个用户同时解析把内存打满。
var contentSourceParseSlots = make(chan struct{}, 4)

func allowContentSourceParse(userID string) bool {
	nowTime := time.Now()
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return false
	}
	contentSourceParseLimiter.Lock()
	defer contentSourceParseLimiter.Unlock()
	// 定期清掉已经没有最近请求的用户，避免 map 随注册用户数无限增长。
	if nowTime.Sub(contentSourceParseLimiter.lastScan) > contentSourceParseWindow*3 {
		for id, hits := range contentSourceParseLimiter.hits {
			recentHits := hits[:0]
			for _, item := range hits {
				if nowTime.Sub(item) < contentSourceParseWindow {
					recentHits = append(recentHits, item)
				}
			}
			if len(recentHits) == 0 {
				delete(contentSourceParseLimiter.hits, id)
			} else {
				contentSourceParseLimiter.hits[id] = recentHits
			}
		}
		contentSourceParseLimiter.lastScan = nowTime
	}
	recent := contentSourceParseLimiter.hits[userID][:0]
	for _, item := range contentSourceParseLimiter.hits[userID] {
		if nowTime.Sub(item) < contentSourceParseWindow {
			recent = append(recent, item)
		}
	}
	if len(recent) >= contentSourceParseLimit {
		contentSourceParseLimiter.hits[userID] = recent
		return false
	}
	contentSourceParseLimiter.hits[userID] = append(recent, nowTime)
	return true
}

// ParseContentSource 解析外部平台作品链接。目前只支持抖音。
func ParseContentSource(ctx context.Context, input string, platform string) (ContentSourceParseResult, error) {
	user, ok := UserFromContext(ctx)
	if !ok || strings.TrimSpace(user.ID) == "" {
		return ContentSourceParseResult{}, safeMessageError{message: "请先登录后再解析"}
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return ContentSourceParseResult{}, safeMessageError{message: "请粘贴抖音链接或分享文案"}
	}
	platform = strings.ToLower(strings.TrimSpace(platform))
	if platform != "" && platform != "douyin" {
		return ContentSourceParseResult{}, safeMessageError{message: "暂不支持该平台，目前只支持抖音"}
	}
	if !SourceParseEnabled() {
		return ContentSourceParseResult{}, safeMessageError{message: "内容解析功能已关闭，请联系管理员"}
	}
	if !allowContentSourceParse(user.ID) {
		return ContentSourceParseResult{}, safeMessageError{message: "解析太频繁了，请稍后再试"}
	}
	select {
	case contentSourceParseSlots <- struct{}{}:
		defer func() { <-contentSourceParseSlots }()
	case <-ctx.Done():
		return ContentSourceParseResult{}, ctx.Err()
	default:
		return ContentSourceParseResult{}, safeMessageError{message: "解析繁忙，请稍后再试"}
	}
	startedAt := time.Now()
	result, err := parseDouyinSource(ctx, input, userSourceStorageProvider(ctx))
	logContentSourceParse(user.ID, time.Since(startedAt), result, err)
	return result, err
}

// userSourceStorageProvider 读取用户个人 S3/WebDAV 配置，供服务端解析图片转存时优先使用。
// 是否真的允许使用个人存储由全局 storage.allowUserProvider 决定（UploadStorageObjectWithProvider 内部判断）。
func userSourceStorageProvider(ctx context.Context) *StorageObjectProviderInput {
	user, ok := UserFromContext(ctx)
	if !ok || strings.TrimSpace(user.ID) == "" {
		return nil
	}
	config, found, err := repository.GetUserConfig(user.ID)
	if err != nil || !found || strings.TrimSpace(config.StorageProvider) == "" {
		return nil
	}
	var providers UserStorageProviders
	if err := json.Unmarshal([]byte(config.StorageProvider), &providers); err != nil {
		return nil
	}
	for _, provider := range []*StorageObjectProviderInput{providers.S3, providers.WebDAV} {
		if provider == nil {
			continue
		}
		if provider.Enabled != nil && !*provider.Enabled {
			continue
		}
		if strings.TrimSpace(provider.Endpoint) == "" {
			continue
		}
		return provider
	}
	return nil
}

func logContentSourceParse(userID string, duration time.Duration, result ContentSourceParseResult, err error) {
	if err != nil {
		log.Printf("content source parse failed: user=%s duration_ms=%d error=%s", userID, duration.Milliseconds(), truncateRunes(err.Error(), 200))
		return
	}
	log.Printf("content source parse ok: user=%s duration_ms=%d source_id=%s kind=%s images=%d warnings=%d", userID, duration.Milliseconds(), result.Source.SourceID, result.Source.Kind, len(result.Source.Images), len(result.Warnings))
}
