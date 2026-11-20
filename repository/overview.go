package repository

import (
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

// CountUsersCreatedOn 统计指定日期新增的用户数；按 RFC3339 前缀范围过滤以命中 created_at 索引。
func CountUsersCreatedOn(date string) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	end, err := nextDay(date)
	if err != nil {
		return 0, err
	}
	var total int64
	err = db.Model(&model.User{}).Where("created_at >= ? AND created_at < ?", date, end).Count(&total).Error
	return total, err
}

// SumUserCredits 返回所有用户的算力点余额合计。
func SumUserCredits() (float64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total float64
	err = db.Model(&model.User{}).Select("COALESCE(SUM(credits), 0)").Scan(&total).Error
	return total, err
}

// CountUsersActiveSince 统计指定日期起有登录记录的用户数。
func CountUsersActiveSince(date string) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int64
	err = db.Model(&model.User{}).Where("last_login_at >= ?", date).Count(&total).Error
	return total, err
}

type CreditDailyTotal struct {
	LogDay   string  `gorm:"column:log_day"`
	Consumed float64 `gorm:"column:consumed"`
	Granted  float64 `gorm:"column:granted"`
}

// ListCreditDailyTotals 按日期汇总算力点消耗与发放。
func ListCreditDailyTotals(startDate, endDate string) ([]CreditDailyTotal, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	end, err := nextDay(endDate)
	if err != nil {
		return nil, err
	}
	var rows []CreditDailyTotal
	err = db.Raw(`
		SELECT SUBSTR(created_at, 1, 10) AS log_day,
			COALESCE(SUM(CASE WHEN type = ? AND amount < 0 THEN -amount ELSE 0 END), 0) AS consumed,
			COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS granted
		FROM credit_logs
		WHERE created_at >= ? AND created_at < ?
		GROUP BY SUBSTR(created_at, 1, 10)
	`, string(model.CreditLogTypeAIConsume), startDate, end).Scan(&rows).Error
	return rows, err
}

func nextDay(date string) (string, error) {
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", err
	}
	return parsed.AddDate(0, 0, 1).Format("2006-01-02"), nil
}

type OverviewContentCounts struct {
	Prompts         int64
	Assets          int64
	Skills          int64
	EnabledPackages int64
}

// CountOverviewContent 返回概览需要的内容数量。
func CountOverviewContent() (OverviewContentCounts, error) {
	db, err := DB()
	if err != nil {
		return OverviewContentCounts{}, err
	}
	var counts OverviewContentCounts
	if err := db.Model(&model.Prompt{}).Count(&counts.Prompts).Error; err != nil {
		return counts, err
	}
	if err := db.Model(&model.Asset{}).Count(&counts.Assets).Error; err != nil {
		return counts, err
	}
	if err := db.Model(&model.AgentSkill{}).Where("source = ?", model.AgentSkillSourceSystem).Count(&counts.Skills).Error; err != nil {
		return counts, err
	}
	if err := db.Model(&model.RechargePackage{}).Where("enabled = ?", true).Count(&counts.EnabledPackages).Error; err != nil {
		return counts, err
	}
	return counts, nil
}
