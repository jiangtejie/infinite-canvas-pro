package repository

import (
	"testing"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func setupCreditDB(t *testing.T) {
	t.Helper()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := DB(); err != nil {
		t.Fatal(err)
	}
}

func TestRefundUserCreditsWithLogCommitsBalanceAndLog(t *testing.T) {
	setupCreditDB(t)
	db, _ := DB()
	user := model.User{ID: "refund-user-1", Username: "refund-user-1", AffCode: "refund-aff-1", Role: model.UserRoleAdmin, Status: model.UserStatusActive, Credits: 5}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	log := model.CreditLog{ID: "refund-log-1", UserID: user.ID, Type: model.CreditLogTypeAIRefund, Amount: 2.5, CreatedAt: now}
	updated, ok, err := RefundUserCreditsWithLog(user.ID, 2.5, now, log)
	if err != nil || !ok {
		t.Fatalf("refund failed: ok=%v err=%v", ok, err)
	}
	if updated.Credits != 7.5 {
		t.Fatalf("balance=%v want 7.5", updated.Credits)
	}
	var saved model.CreditLog
	if err := db.Where("id = ?", log.ID).First(&saved).Error; err != nil {
		t.Fatal(err)
	}
	if saved.Balance != 7.5 || saved.Amount != 2.5 {
		t.Fatalf("log balance=%v amount=%v", saved.Balance, saved.Amount)
	}
}

func TestRefundUserCreditsWithLogRejectsUnknownUser(t *testing.T) {
	setupCreditDB(t)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, ok, err := RefundUserCreditsWithLog("missing-user", 1, now, model.CreditLog{ID: "missing-log", UserID: "missing-user", Type: model.CreditLogTypeAIRefund, Amount: 1, CreatedAt: now})
	if err == nil || ok {
		t.Fatalf("expected unknown user error, ok=%v err=%v", ok, err)
	}
}

func TestRefundUserCreditsWithLogRollsBackOnLogFailure(t *testing.T) {
	setupCreditDB(t)
	db, _ := DB()
	user := model.User{ID: "refund-user-2", Username: "refund-user-2", AffCode: "refund-aff-2", Role: model.UserRoleAdmin, Status: model.UserStatusActive, Credits: 5}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	// 先占用日志 ID，让退款流水插入失败，验证余额回滚。
	if err := db.Create(&model.CreditLog{ID: "duplicate-log", UserID: user.ID, Type: model.CreditLogTypeRecharge, Amount: 1, Balance: 5, CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	_, ok, err := RefundUserCreditsWithLog(user.ID, 2, now, model.CreditLog{ID: "duplicate-log", UserID: user.ID, Type: model.CreditLogTypeAIRefund, Amount: 2, CreatedAt: now})
	if err == nil || ok {
		t.Fatalf("expected log failure, ok=%v err=%v", ok, err)
	}
	var current model.User
	if err := db.Where("id = ?", user.ID).First(&current).Error; err != nil {
		t.Fatal(err)
	}
	if current.Credits != 5 {
		t.Fatalf("balance rolled back to %v, want 5", current.Credits)
	}
}
