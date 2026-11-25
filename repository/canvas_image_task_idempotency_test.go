package repository

import (
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func setupCanvasImageTaskDB(t *testing.T) {
	t.Helper()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := DB(); err != nil {
		t.Fatal(err)
	}
	db, _ := DB()
	if !db.Migrator().HasIndex(&model.CanvasImageTask{}, "idx_canvas_image_tasks_user_client") {
		t.Fatal("missing user/client task unique index")
	}
}

func TestCreateCanvasImageTaskIdempotentReplaysWithoutOverwrite(t *testing.T) {
	setupCanvasImageTaskDB(t)
	firstInput := model.CanvasImageTask{
		ID:           "server-task-1",
		UserID:       "owner-a",
		ClientTaskID: "client-task-1",
		RequestHash:  "request-hash-1",
		Prompt:       "original prompt",
		Status:       "queued",
		CreatedAt:    "2026-11-24T00:00:00Z",
		UpdatedAt:    "2026-11-24T00:00:00Z",
	}
	first, created, err := CreateCanvasImageTaskIdempotent(firstInput)
	if err != nil || !created {
		t.Fatalf("first create: created=%v err=%v", created, err)
	}

	replayInput := firstInput
	replayInput.ID = "server-task-2"
	replayInput.Prompt = "tampered prompt"
	replayInput.Status = "completed"
	replayed, created, err := CreateCanvasImageTaskIdempotent(replayInput)
	if err != nil {
		t.Fatal(err)
	}
	if created {
		t.Fatal("duplicate request created a second task")
	}
	if replayed.ID != first.ID || replayed.Prompt != "original prompt" || replayed.Status != "queued" {
		t.Fatalf("duplicate overwrote original task: %#v", replayed)
	}
}

func TestCreateCanvasImageTaskIdempotentRejectsDifferentRequest(t *testing.T) {
	setupCanvasImageTaskDB(t)
	input := model.CanvasImageTask{ID: "server-task-diff-1", UserID: "owner-diff", ClientTaskID: "client-task-diff", RequestHash: "hash-a", Status: "queued"}
	if _, created, err := CreateCanvasImageTaskIdempotent(input); err != nil || !created {
		t.Fatalf("first create: created=%v err=%v", created, err)
	}
	input.ID = "server-task-diff-2"
	input.RequestHash = "hash-b"
	if _, created, err := CreateCanvasImageTaskIdempotent(input); !errors.Is(err, ErrCanvasImageTaskConflict) || created {
		t.Fatalf("expected conflict: created=%v err=%v", created, err)
	}
}

func TestCreateCanvasImageTaskIdempotentRejectsOtherOwner(t *testing.T) {
	setupCanvasImageTaskDB(t)
	input := model.CanvasImageTask{ID: "server-task-owner-1", UserID: "owner-a", ClientTaskID: "client-task-owner", RequestHash: "hash-a", Status: "queued"}
	if _, created, err := CreateCanvasImageTaskIdempotent(input); err != nil || !created {
		t.Fatalf("first create: created=%v err=%v", created, err)
	}
	input.ID = "server-task-owner-2"
	input.UserID = "owner-b"
	if _, created, err := CreateCanvasImageTaskIdempotent(input); !errors.Is(err, ErrCanvasImageTaskConflict) || created {
		t.Fatalf("expected conflict: created=%v err=%v", created, err)
	}
}

func TestCreateCanvasImageTaskWithCreditsConcurrentReplayChargesAndClaimsOnce(t *testing.T) {
	previousConfig := config.Cfg
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: filepath.Join(t.TempDir(), "concurrent.db")}
	db, dbErr = nil, nil
	dbOnce = sync.Once{}
	t.Cleanup(func() {
		if db != nil {
			if sqlDB, err := db.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
		config.Cfg = previousConfig
		db, dbErr = nil, nil
		dbOnce = sync.Once{}
	})
	database, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	user := model.User{ID: "concurrent-owner", Username: "concurrent-owner", AffCode: "concurrent-owner", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 10}
	if err := database.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	approval := model.CanvasRemixApproval{ID: "concurrent-approval", UserID: user.ID, RunID: "concurrent-run", ApprovalKey: "plan", CoreVersion: "marketing-remix-1", CreatedAt: now, ExpiresAt: now.Add(30 * time.Minute)}
	if err := database.Create(&approval).Error; err != nil {
		t.Fatal(err)
	}
	slot := model.CanvasRemixApprovalSlot{ID: "concurrent-slot", ApprovalID: approval.ID, UserID: user.ID, RunID: approval.RunID, NodeID: "concurrent-image", Model: "image-model", Prompt: "prompt", RequestHash: "request-hash", CreatedAt: now}
	if err := database.Create(&slot).Error; err != nil {
		t.Fatal(err)
	}

	const callers = 8
	start := make(chan struct{})
	type result struct {
		task    model.CanvasImageTask
		created bool
		err     error
	}
	results := make([]result, callers)
	var wait sync.WaitGroup
	for index := 0; index < callers; index++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			taskID := fmt.Sprintf("concurrent-task-%d", index)
			task := model.CanvasImageTask{ID: taskID, UserID: user.ID, ClientTaskID: "concurrent-client", RequestHash: "request-hash", RemixApproval: approval.ID, RemixSlot: slot.ID, NodeID: slot.NodeID, Model: slot.Model, Prompt: slot.Prompt, Credits: 2, Status: "queued", CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)}
			log := model.CreditLog{ID: fmt.Sprintf("concurrent-credit-%d", index), UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -2, RelatedID: taskID, CreatedAt: now.Format(time.RFC3339Nano)}
			createdTask, created, createErr := CreateCanvasImageTaskWithCredits(task, log, slot.RequestHash)
			results[index] = result{task: createdTask, created: created, err: createErr}
		}(index)
	}
	close(start)
	wait.Wait()

	createdCount := 0
	var winningTaskID string
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent replay failed: %v", result.err)
		}
		if result.created {
			createdCount++
			winningTaskID = result.task.ID
		}
		if result.task.ID != winningTaskID && winningTaskID != "" {
			t.Fatalf("concurrent replay returned different tasks: %q and %q", winningTaskID, result.task.ID)
		}
	}
	if createdCount != 1 {
		t.Fatalf("created %d tasks, want 1", createdCount)
	}
	var balance model.User
	if err := database.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 8 {
		t.Fatalf("balance=%v want=8 err=%v", balance.Credits, err)
	}
	var taskCount, creditCount int64
	if err := database.Model(&model.CanvasImageTask{}).Where("user_id = ? AND client_task_id = ?", user.ID, "concurrent-client").Count(&taskCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIConsume).Count(&creditCount).Error; err != nil {
		t.Fatal(err)
	}
	var claimed model.CanvasRemixApprovalSlot
	if err := database.First(&claimed, "id = ?", slot.ID).Error; err != nil {
		t.Fatal(err)
	}
	if taskCount != 1 || creditCount != 1 || claimed.ConsumedByTask != winningTaskID {
		t.Fatalf("tasks=%d credits=%d claimedBy=%q winningTask=%q", taskCount, creditCount, claimed.ConsumedByTask, winningTaskID)
	}
}
