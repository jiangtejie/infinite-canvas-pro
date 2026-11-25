package service

import (
	"errors"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

func TestCreateCanvasImageTaskChargesOnceAndReplays(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "billed-image-owner", Username: "billed-image-owner", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 10}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	input := CanvasImageTaskCreateInput{UserID: user.ID, ClientTaskID: "billed-image-client", RequestHash: "billed-image-hash", Model: "image-model", Credits: 2.5, BillingName: "image-model", BillingPath: "/images/generations"}
	first, created, err := CreateCanvasImageTask(input)
	if err != nil || !created || first.BillingState != "charged" {
		t.Fatalf("first create: task=%#v created=%v err=%v", first, created, err)
	}
	if _, created, err := CreateCanvasImageTask(input); err != nil || created {
		t.Fatalf("replay: created=%v err=%v", created, err)
	}
	var balance model.User
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 7.5 {
		t.Fatalf("balance=%v want=7.5 err=%v", balance.Credits, err)
	}
	input.ClientTaskID = "billed-image-client-2"
	input.RequestHash = "billed-image-hash-2"
	input.Credits = 10
	if _, created, err := CreateCanvasImageTask(input); !errors.Is(err, repository.ErrCanvasImageTaskInsufficientCredits) || created {
		t.Fatalf("insufficient credits: created=%v err=%v", created, err)
	}
	var logs int64
	if err := db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIConsume).Count(&logs).Error; err != nil || logs != 1 {
		t.Fatalf("consume logs=%d want=1 err=%v", logs, err)
	}
}

func TestCreateCanvasImageTaskRequestHashIncludesPayload(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	input := CanvasImageTaskCreateInput{UserID: "payload-hash-owner", ClientTaskID: "payload-hash-client", Model: "image-model", Payload: []byte(`{"prompt":"first"}`)}
	if _, created, err := CreateCanvasImageTask(input); err != nil || !created {
		t.Fatalf("first create: created=%v err=%v", created, err)
	}
	input.Payload = []byte(`{"prompt":"second"}`)
	if _, created, err := CreateCanvasImageTask(input); !errors.Is(err, repository.ErrCanvasImageTaskConflict) || created {
		t.Fatalf("changed payload replayed: created=%v err=%v", created, err)
	}
}

func TestCreateCanvasImageTaskUsesServerIdentityAndReplays(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	input := CanvasImageTaskCreateInput{
		UserID:       "image-task-owner",
		ClientTaskID: "client-image-task-1",
		RequestHash:  "image-request-hash-1",
		Model:        "image-model",
	}
	first, created, err := CreateCanvasImageTask(input)
	if err != nil || !created {
		t.Fatalf("first create: created=%v err=%v", created, err)
	}
	if first.ID == "" || first.ID == input.ClientTaskID {
		t.Fatalf("task ID must be server generated: %#v", first)
	}
	second, created, err := CreateCanvasImageTask(input)
	if err != nil || created {
		t.Fatalf("replay: created=%v err=%v", created, err)
	}
	if second.ID != first.ID {
		t.Fatalf("replay id=%s want %s", second.ID, first.ID)
	}

	input.RequestHash = "different-request"
	if _, created, err := CreateCanvasImageTask(input); !errors.Is(err, repository.ErrCanvasImageTaskConflict) || created {
		t.Fatalf("expected request conflict: created=%v err=%v", created, err)
	}
}
