package service

import (
	"fmt"
	"math"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

var overviewAILogCache struct {
	sync.Mutex
	loaded    bool
	signature string
	ai        model.AdminOverviewAI
	recent    []model.AdminOverviewRecentAILog
}

// AdminOverview 汇总后台概览数据：用户、AI 调用、算力、内容与运行状态。
func AdminOverview() (model.AdminOverview, error) {
	now := time.Now()
	today := now.Format("2006-01-02")
	weekStart := startOfDay(now).AddDate(0, 0, -6).Format("2006-01-02")

	usersTotal, err := repository.CountUsers()
	if err != nil {
		return model.AdminOverview{}, err
	}
	newToday, err := repository.CountUsersCreatedOn(today)
	if err != nil {
		return model.AdminOverview{}, err
	}
	active7d, err := repository.CountUsersActiveSince(weekStart)
	if err != nil {
		return model.AdminOverview{}, err
	}
	totalBalance, err := repository.SumUserCredits()
	if err != nil {
		return model.AdminOverview{}, err
	}
	creditTotals, err := repository.ListCreditDailyTotals(weekStart, today)
	if err != nil {
		return model.AdminOverview{}, err
	}
	content, err := repository.CountOverviewContent()
	if err != nil {
		return model.AdminOverview{}, err
	}
	ai, recentAILogs, err := summarizeAILogs(now)
	if err != nil {
		return model.AdminOverview{}, err
	}
	recentCreditLogs, _, err := repository.ListCreditLogs(model.Query{Page: 1, PageSize: 6})
	if err != nil {
		return model.AdminOverview{}, err
	}
	settings, err := repository.GetSettings()
	if err != nil {
		return model.AdminOverview{}, err
	}

	creditByDate := make(map[string]repository.CreditDailyTotal, len(creditTotals))
	for _, item := range creditTotals {
		creditByDate[strings.Split(item.LogDay, "T")[0]] = item
	}
	for i := range ai.Trend {
		ai.Trend[i].Credits = round2(creditByDate[ai.Trend[i].Date].Consumed)
	}
	todayCredits := creditByDate[today]

	channels := model.AdminOverviewChannels{Total: len(settings.Private.Channels)}
	for _, channel := range settings.Private.Channels {
		if channel.Enabled {
			channels.Enabled++
		}
	}
	storage := model.AdminOverviewStorage{
		Configured: len(settings.Private.Storage.Providers),
		LimitBytes: settings.Private.Storage.CapacityLimitBytes,
	}
	for _, provider := range settings.Private.Storage.Providers {
		if provider.Enabled {
			storage.UsedBytes += provider.CapacityBytes
		}
		if provider.CapacityExceeded {
			storage.Exceeded++
		}
	}

	recentCredits := make([]model.AdminOverviewRecentCreditLog, 0, len(recentCreditLogs))
	for _, item := range recentCreditLogs {
		recentCredits = append(recentCredits, model.AdminOverviewRecentCreditLog{
			ID:              item.ID,
			UserID:          item.UserID,
			UserDisplayName: item.UserDisplayName,
			Type:            item.Type,
			Amount:          item.Amount,
			Balance:         item.Balance,
			Remark:          item.Remark,
			CreatedAt:       item.CreatedAt,
		})
	}

	return model.AdminOverview{
		Users: model.AdminOverviewUsers{
			Total:    int(usersTotal),
			NewToday: int(newToday),
			Active7d: int(active7d),
		},
		AI:      ai,
		Credits: model.AdminOverviewCredits{TodayConsumed: round2(todayCredits.Consumed), TodayGranted: round2(todayCredits.Granted), TotalBalance: round2(totalBalance)},
		Content: model.AdminOverviewContent{
			Prompts:         int(content.Prompts),
			Assets:          int(content.Assets),
			Skills:          int(content.Skills),
			EnabledPackages: int(content.EnabledPackages),
		},
		Channels:         channels,
		Storage:          storage,
		RecentAILogs:     recentAILogs,
		RecentCreditLogs: recentCredits,
	}, nil
}

func summarizeAILogs(now time.Time) (model.AdminOverviewAI, []model.AdminOverviewRecentAILog, error) {
	signature, err := aiLogCacheSignature(now)
	if err != nil {
		return model.AdminOverviewAI{}, nil, err
	}
	overviewAILogCache.Lock()
	if overviewAILogCache.loaded && overviewAILogCache.signature == signature {
		ai := cloneOverviewAI(overviewAILogCache.ai)
		recent := append([]model.AdminOverviewRecentAILog(nil), overviewAILogCache.recent...)
		overviewAILogCache.Unlock()
		return ai, recent, nil
	}
	overviewAILogCache.Unlock()

	items, err := readAICallLogs()
	if err != nil {
		return model.AdminOverviewAI{}, nil, err
	}
	todayStart := startOfDay(now)
	weekStart := todayStart.AddDate(0, 0, -6)
	trend := make([]model.AdminOverviewAITrend, 7)
	trendIndex := make(map[string]int, 7)
	for i := range trend {
		date := weekStart.AddDate(0, 0, i).Format("2006-01-02")
		trend[i] = model.AdminOverviewAITrend{Date: date}
		trendIndex[date] = i
	}
	ai := model.AdminOverviewAI{Total: len(items), Trend: trend}
	var durationTotal int64
	var durationCount int64
	var successToday int

	for _, item := range items {
		created, ok := parseAILogTime(item.CreatedAt)
		if !ok {
			continue
		}
		if !created.Before(weekStart) {
			if index, ok := trendIndex[created.Format("2006-01-02")]; ok {
				ai.Trend[index].Calls++
			}
		}
		if created.Before(todayStart) {
			continue
		}
		ai.TodayCalls++
		if aiLogSucceeded(item) {
			successToday++
		}
		if item.DurationMs > 0 {
			durationTotal += item.DurationMs
			durationCount++
		}
	}
	ai.TodayFailed = ai.TodayCalls - successToday
	if ai.TodayCalls > 0 {
		ai.SuccessRate = round1(float64(successToday) / float64(ai.TodayCalls) * 100)
	}
	if durationCount > 0 {
		ai.AvgDurationMs = durationTotal / durationCount
	}

	recentItems := latestAILogs(items, 6)
	recent := make([]model.AdminOverviewRecentAILog, 0, len(recentItems))
	for _, item := range recentItems {
		recent = append(recent, model.AdminOverviewRecentAILog{
			ID:              item.ID,
			UserID:          item.UserID,
			UserDisplayName: item.UserDisplayName,
			Model:           item.Model,
			Status:          item.Status,
			Failed:          item.Failed,
			DurationMs:      item.DurationMs,
			Credits:         item.Credits,
			CreatedAt:       item.CreatedAt,
		})
	}
	overviewAILogCache.Lock()
	overviewAILogCache.loaded = true
	overviewAILogCache.signature = signature
	overviewAILogCache.ai = cloneOverviewAI(ai)
	overviewAILogCache.recent = append([]model.AdminOverviewRecentAILog(nil), recent...)
	overviewAILogCache.Unlock()
	return ai, recent, nil
}

// aiLogCacheSignature 由日志文件大小、修改时间与当前日期组成；任意写入或跨天都会失效。
func aiLogCacheSignature(now time.Time) (string, error) {
	files, err := aiLogFiles()
	if err != nil {
		return "", err
	}
	var builder strings.Builder
	for _, file := range files {
		info, err := os.Stat(file)
		if err != nil {
			continue
		}
		fmt.Fprintf(&builder, "%s:%d:%d;", file, info.Size(), info.ModTime().UnixNano())
	}
	builder.WriteString(now.Format("2006-01-02"))
	return builder.String(), nil
}

func cloneOverviewAI(ai model.AdminOverviewAI) model.AdminOverviewAI {
	cloned := ai
	cloned.Trend = append([]model.AdminOverviewAITrend(nil), ai.Trend...)
	return cloned
}

// latestAILogs 单次遍历取最近 N 条，避免为概览全量排序；时间相同保持原文件顺序。
func latestAILogs(items []model.AICallLog, limit int) []model.AICallLog {
	if limit <= 0 {
		return nil
	}
	latest := make([]model.AICallLog, 0, limit)
	for _, item := range items {
		if len(latest) == limit && item.CreatedAt <= latest[limit-1].CreatedAt {
			continue
		}
		index := sort.Search(len(latest), func(i int) bool { return latest[i].CreatedAt < item.CreatedAt })
		latest = append(latest, model.AICallLog{})
		copy(latest[index+1:], latest[index:])
		latest[index] = item
		if len(latest) > limit {
			latest = latest[:limit]
		}
	}
	return latest
}

func parseAILogTime(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, false
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.In(time.Local), true
	}
	if parsed, err := time.ParseInLocation("2006-01-02 15:04:05", value, time.Local); err == nil {
		return parsed, true
	}
	return time.Time{}, false
}

func aiLogSucceeded(item model.AICallLog) bool {
	return !item.Failed && item.Status >= 200 && item.Status < 400
}

func round1(value float64) float64 {
	return math.Round(value*10) / 10
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}
