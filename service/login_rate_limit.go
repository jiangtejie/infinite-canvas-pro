package service

import (
	"strings"
	"sync"
	"time"
)

const (
	loginUserRateLimit    = 10
	loginGlobalRateLimit  = 1200
	loginRateLimitWindow  = 10 * time.Minute
	loginRateLimitScanGap = 10 * time.Minute
)

var loginRateLimiter = struct {
	sync.Mutex
	hits     map[string][]time.Time
	global   []time.Time
	lastScan time.Time
}{hits: map[string][]time.Time{}, lastScan: time.Now()}

// CheckLoginRateLimit 在密码校验前限制单账号与全局登录尝试，避免默认口令被反复爆破。
func CheckLoginRateLimit(username string) error {
	nowTime := time.Now()
	key := strings.ToLower(strings.TrimSpace(username))
	loginRateLimiter.Lock()
	defer loginRateLimiter.Unlock()
	if nowTime.Sub(loginRateLimiter.lastScan) >= loginRateLimitScanGap {
		for itemKey, hits := range loginRateLimiter.hits {
			recent := recentLoginHits(hits, nowTime)
			if len(recent) == 0 {
				delete(loginRateLimiter.hits, itemKey)
			} else {
				loginRateLimiter.hits[itemKey] = recent
			}
		}
		loginRateLimiter.global = recentLoginHits(loginRateLimiter.global, nowTime)
		loginRateLimiter.lastScan = nowTime
	}
	userHits := recentLoginHits(loginRateLimiter.hits[key], nowTime)
	if len(userHits) >= loginUserRateLimit || len(loginRateLimiter.global) >= loginGlobalRateLimit {
		loginRateLimiter.hits[key] = userHits
		return safeMessageError{message: "登录尝试过于频繁，请稍后再试"}
	}
	loginRateLimiter.hits[key] = append(userHits, nowTime)
	loginRateLimiter.global = append(loginRateLimiter.global, nowTime)
	return nil
}

// ResetLoginRateLimit 登录成功后清零该账号的尝试计数。
func ResetLoginRateLimit(username string) {
	key := strings.ToLower(strings.TrimSpace(username))
	loginRateLimiter.Lock()
	defer loginRateLimiter.Unlock()
	delete(loginRateLimiter.hits, key)
}

func recentLoginHits(hits []time.Time, nowTime time.Time) []time.Time {
	recent := hits[:0]
	for _, hit := range hits {
		if nowTime.Sub(hit) < loginRateLimitWindow {
			recent = append(recent, hit)
		}
	}
	return recent
}
