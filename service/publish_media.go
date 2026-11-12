package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
)

const (
	publishMediaMaxBytes  = 20 << 20
	publishMediaRetention = 72 * time.Hour
)

var (
	publishMediaNamePattern  = regexp.MustCompile("^[a-f0-9]{32}\\.(?:jpg|png)$")
	publishMediaCleanupState = struct {
		sync.Mutex
		lastRun time.Time
	}{lastRun: time.Now()}
)

// PublishMedia 发布图片转存结果，URL 为公网可访问地址。
type PublishMedia struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Width    int    `json:"width,omitempty"`
	Height   int    `json:"height,omitempty"`
	Bytes    int64  `json:"bytes"`
	MimeType string `json:"mimeType"`
}

func publishMediaDir() string {
	return strings.TrimSpace(config.Cfg.PublishMediaDir)
}

func ensurePublishMediaDir() (string, error) {
	dir := publishMediaDir()
	if dir == "" {
		return "", errors.New("发布图片目录未配置")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// SavePublishMedia 把发布图片保存到本机发布目录。相同内容的图片按 hash 复用。
func SavePublishMedia(filename string, contentType string, data []byte) (PublishMedia, error) {
	if len(data) == 0 {
		return PublishMedia{}, safeMessageError{message: "图片内容为空"}
	}
	if len(data) > publishMediaMaxBytes {
		return PublishMedia{}, safeMessageError{message: "单张图片不能超过 20MB"}
	}
	detected := strings.TrimSpace(strings.Split(contentType, ";")[0])
	if !strings.HasPrefix(strings.ToLower(detected), "image/") {
		detected = http.DetectContentType(data)
	}
	if !strings.HasPrefix(strings.ToLower(detected), "image/") {
		return PublishMedia{}, safeMessageError{message: "只支持上传图片"}
	}
	ext := publishImageExtension(detected)
	if ext == "" {
		return PublishMedia{}, safeMessageError{message: "抖音发布仅支持 JPG / PNG 图片"}
	}
	setting := PublishSetting()
	baseURL := strings.TrimRight(strings.TrimSpace(setting.PublicBaseURL), "/")
	if baseURL == "" {
		return PublishMedia{}, safeMessageError{message: "请先在后台配置发布域名 publicBaseUrl"}
	}
	if !setting.DouyinMock && !strings.HasPrefix(baseURL, "https://") {
		return PublishMedia{}, safeMessageError{message: "发布域名必须是公网 HTTPS 地址"}
	}
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	name := hash[:32] + ext
	dir, err := ensurePublishMediaDir()
	if err != nil {
		return PublishMedia{}, safeMessageError{message: "发布图片目录不可用"}
	}
	path := filepath.Join(dir, name)
	if _, statErr := os.Stat(path); statErr != nil {
		if writeErr := os.WriteFile(path, data, 0o644); writeErr != nil {
			return PublishMedia{}, safeMessageError{message: "保存发布图片失败"}
		}
	}

	media := PublishMedia{ID: hash[:32], URL: baseURL + "/api/publish/media/" + name, Bytes: int64(len(data)), MimeType: detected}
	if imageConfig, _, decodeErr := image.DecodeConfig(bytes.NewReader(data)); decodeErr == nil {
		media.Width = imageConfig.Width
		media.Height = imageConfig.Height
	}
	maybeCleanupPublishMedia()
	return media, nil
}

func PublishMediaFilePath(name string) (string, string, error) {
	if !publishMediaNamePattern.MatchString(strings.TrimSpace(name)) {
		return "", "", errors.New("发布图片不存在")
	}
	dir, err := ensurePublishMediaDir()
	if err != nil {
		return "", "", errors.New("发布图片不存在")
	}
	path := filepath.Join(dir, name)
	if _, err := os.Stat(path); err != nil {
		return "", "", errors.New("发布图片不存在")
	}
	return path, publishImageMimeType(filepath.Ext(name)), nil
}

func publishImageExtension(contentType string) string {
	switch strings.ToLower(contentType) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	default:
		return ""
	}
}

func publishImageMimeType(extension string) string {
	switch strings.ToLower(extension) {
	case ".jpg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	default:
		return "application/octet-stream"
	}
}

// maybeCleanupPublishMedia 每 6 小时清一次超过保留期的发布图片，避免长期占盘。
func maybeCleanupPublishMedia() {
	nowTime := time.Now()
	publishMediaCleanupState.Lock()
	if nowTime.Sub(publishMediaCleanupState.lastRun) < 6*time.Hour {
		publishMediaCleanupState.Unlock()
		return
	}
	publishMediaCleanupState.lastRun = nowTime
	publishMediaCleanupState.Unlock()
	cleanupPublishMedia(nowTime)
}

// StartPublishMediaCleanupScheduler 定期清理超过保留期的发布图片，避免只在下次上传时清理。
func StartPublishMediaCleanupScheduler() {
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanupPublishMedia(time.Now())
		}
	}()
}

func cleanupPublishMedia(nowTime time.Time) {
	dir := publishMediaDir()
	if dir == "" {
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !publishMediaNamePattern.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil || nowTime.Sub(info.ModTime()) < publishMediaRetention {
			continue
		}
		_ = os.Remove(filepath.Join(dir, entry.Name()))
	}
}
