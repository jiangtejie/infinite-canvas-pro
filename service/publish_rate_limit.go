package service

import (
	"strings"
	"sync"
	"time"
)

const (
	publishRecordRateLimit  = 20
	publishMediaRateLimit   = 60
	publishRateLimitWindow  = 10 * time.Minute
	publishRateLimitScanGap = 10 * time.Minute
)

var publishRateLimiter = struct {
	sync.Mutex
	hits     map[string][]time.Time
	lastScan time.Time
}{hits: map[string][]time.Time{}, lastScan: time.Now()}

func allowPublishAction(userID string, action string, limit int) bool {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return false
	}
	key := userID + "|" + action
	nowTime := time.Now()
	publishRateLimiter.Lock()
	defer publishRateLimiter.Unlock()
	if nowTime.Sub(publishRateLimiter.lastScan) >= publishRateLimitScanGap {
		for itemKey, hits := range publishRateLimiter.hits {
			recent := hits[:0]
			for _, hit := range hits {
				if nowTime.Sub(hit) < publishRateLimitWindow {
					recent = append(recent, hit)
				}
			}
			if len(recent) == 0 {
				delete(publishRateLimiter.hits, itemKey)
			} else {
				publishRateLimiter.hits[itemKey] = recent
			}
		}
		publishRateLimiter.lastScan = nowTime
	}
	recent := publishRateLimiter.hits[key][:0]
	for _, hit := range publishRateLimiter.hits[key] {
		if nowTime.Sub(hit) < publishRateLimitWindow {
			recent = append(recent, hit)
		}
	}
	if len(recent) >= limit {
		publishRateLimiter.hits[key] = recent
		return false
	}
	publishRateLimiter.hits[key] = append(recent, nowTime)
	return true
}

// AllowPublishCreateRecord 限制发布记录创建频率，避免登录用户反复签发二维码。
func AllowPublishCreateRecord(userID string) bool {
	return allowPublishAction(userID, "record", publishRecordRateLimit)
}

// AllowPublishMediaUpload 限制发布图片上传频率，避免发布目录被刷满。
func AllowPublishMediaUpload(userID string) bool {
	return allowPublishAction(userID, "media", publishMediaRateLimit)
}
