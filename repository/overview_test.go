package repository

import (
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestOverviewDateQueriesUseRangesAndIndexes(t *testing.T) {
	setupCreditDB(t)
	db, _ := DB()
	users := []model.User{
		{ID: "overview-user-1", Username: "overview-user-1", AffCode: "overview-aff-1", CreatedAt: "2026-11-19T23:59:59+08:00", LastLoginAt: "2026-11-18T12:00:00+08:00"},
		{ID: "overview-user-2", Username: "overview-user-2", AffCode: "overview-aff-2", CreatedAt: "2026-11-20T00:00:00+08:00", LastLoginAt: "2026-11-19T00:00:00+08:00"},
		{ID: "overview-user-3", Username: "overview-user-3", AffCode: "overview-aff-3", CreatedAt: "2026-11-20T23:59:59+08:00", LastLoginAt: ""},
		{ID: "overview-user-4", Username: "overview-user-4", AffCode: "overview-aff-4", CreatedAt: "2026-11-21T00:00:00+08:00", LastLoginAt: "2026-11-20T08:00:00+08:00"},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	logs := []model.CreditLog{
		{ID: "overview-credit-1", UserID: "overview-user-1", Type: model.CreditLogTypeAIConsume, Amount: -1, CreatedAt: "2026-11-19T23:59:59+08:00"},
		{ID: "overview-credit-2", UserID: "overview-user-1", Type: model.CreditLogTypeAIConsume, Amount: -2, CreatedAt: "2026-11-20T00:00:00+08:00"},
		{ID: "overview-credit-3", UserID: "overview-user-1", Type: model.CreditLogTypeRecharge, Amount: 10, CreatedAt: "2026-11-20T12:00:00+08:00"},
		{ID: "overview-credit-4", UserID: "overview-user-1", Type: model.CreditLogTypeAIConsume, Amount: -3, CreatedAt: "2026-11-20T23:59:59+08:00"},
		{ID: "overview-credit-5", UserID: "overview-user-1", Type: model.CreditLogTypeAIConsume, Amount: -4, CreatedAt: "2026-11-21T00:00:00+08:00"},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatal(err)
	}

	if total, err := CountUsersCreatedOn("2026-11-20"); err != nil || total != 2 {
		t.Fatalf("created today=%d err=%v, want 2", total, err)
	}
	if total, err := CountUsersActiveSince("2026-11-19"); err != nil || total != 2 {
		t.Fatalf("active since=%d err=%v, want 2", total, err)
	}

	logsOn19, totalOn19, err := ListCreditLogs(model.Query{Date: "2026-11-19"})
	if err != nil || totalOn19 != 1 || len(logsOn19) != 1 || logsOn19[0].ID != "overview-credit-1" {
		t.Fatalf("logs on 19 total=%d items=%d err=%v, want only overview-credit-1", totalOn19, len(logsOn19), err)
	}

	totals, err := ListCreditDailyTotals("2026-11-19", "2026-11-20")
	if err != nil {
		t.Fatal(err)
	}
	byDay := make(map[string]CreditDailyTotal, len(totals))
	for _, item := range totals {
		byDay[strings.Split(item.LogDay, "T")[0]] = item
	}
	if byDay["2026-11-19"].Consumed != 1 || byDay["2026-11-19"].Granted != 0 {
		t.Fatalf("day 19=%#v, want consumed 1 granted 0", byDay["2026-11-19"])
	}
	if byDay["2026-11-20"].Consumed != 5 || byDay["2026-11-20"].Granted != 10 {
		t.Fatalf("day 20=%#v, want consumed 5 granted 10", byDay["2026-11-20"])
	}

	var indexes []string
	if err := db.Raw("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ?", []string{"idx_users_created_at", "idx_users_last_login_at", "idx_credit_logs_created_at"}).Scan(&indexes).Error; err != nil {
		t.Fatal(err)
	}
	if len(indexes) != 3 {
		t.Fatalf("statistics indexes=%v, want 3", indexes)
	}
}
