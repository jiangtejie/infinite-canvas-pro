package service

import (
	"testing"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

func TestCanvasRemixApprovalBindsAndClaimsEachSlotOnce(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	approval, approvalSlots, err := ApproveCanvasRemix(CanvasRemixApprovalInput{
		UserID: "remix-owner", RunID: "run-1", ApprovalRequestID: "request-1", ApprovalKey: "approved-plan-key", SourceSignature: "source-1", CoreVersion: "marketing-remix-1",
		Slots: []CanvasRemixApprovalSlotInput{{NodeID: "image-1", Model: "image-model", Prompt: "approved prompt"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if approval.ID == "" || len(approvalSlots) != 1 || approvalSlots[0].ID == "" || approvalSlots[0].RequestHash == "" {
		t.Fatalf("invalid approval: %#v", approval)
	}
	slot := approvalSlots[0]
	if err := ClaimCanvasRemixApprovalSlot(approval.UserID, approval.ID, slot.ID, slot.RequestHash, "task-1"); err != nil {
		t.Fatal(err)
	}
	if err := ClaimCanvasRemixApprovalSlot(approval.UserID, approval.ID, slot.ID, slot.RequestHash, "task-2"); err == nil {
		t.Fatal("approval slot was consumed twice")
	}
	if err := ClaimCanvasRemixApprovalSlot(approval.UserID, approval.ID, slot.ID, "different-request", "task-3"); err == nil {
		t.Fatal("approval accepted a different request")
	}
	if err := ClaimCanvasRemixApprovalSlot("other-owner", approval.ID, slot.ID, slot.RequestHash, "task-4"); err == nil {
		t.Fatal("approval leaked across users")
	}
}

func TestCanvasImageTaskRequiresUnconsumedApprovalSlot(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	approval, slots, err := ApproveCanvasRemix(CanvasRemixApprovalInput{UserID: "remix-task-owner", RunID: "run-task", ApprovalRequestID: "request-task", ApprovalKey: "plan-task", CoreVersion: "marketing-remix-1", Slots: []CanvasRemixApprovalSlotInput{{NodeID: "image-task", Model: "image-model", Prompt: "approved prompt"}}})
	if err != nil {
		t.Fatal(err)
	}
	input := CanvasImageTaskCreateInput{UserID: "remix-task-owner", ClientTaskID: "client-remix-task", NodeID: "image-task", Model: "image-model", Prompt: "approved prompt", RemixApproval: approval.ID, RemixSlot: slots[0].ID}
	if _, created, err := CreateCanvasImageTask(input); err != nil || !created {
		t.Fatalf("approved task create: created=%v err=%v", created, err)
	}
	input.ClientTaskID = "client-remix-task-2"
	if _, created, err := CreateCanvasImageTask(input); err == nil || created {
		t.Fatalf("consumed approval created task: created=%v err=%v", created, err)
	}
	input.ClientTaskID = "client-remix-task-3"
	input.Prompt = "changed prompt"
	if _, created, err := CreateCanvasImageTask(input); err == nil || created {
		t.Fatalf("changed prompt created task: created=%v err=%v", created, err)
	}
}

func TestWorkflowCanvasImageTaskRequiresApprovalAndChargesOnce(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "remix-workflow-owner", Username: "remix-workflow-owner", AffCode: "remix-workflow-owner", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 10}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	billingName := "workflow:system:channel-1:workflow:workflow-1"
	approval, slots, err := ApproveCanvasRemix(CanvasRemixApprovalInput{UserID: user.ID, RunID: "run-workflow", ApprovalRequestID: "request-workflow", ApprovalKey: "plan-workflow", CoreVersion: "marketing-remix-1", Slots: []CanvasRemixApprovalSlotInput{{NodeID: "workflow-image", Model: billingName, Prompt: "approved prompt"}}})
	if err != nil {
		t.Fatal(err)
	}
	input := CanvasImageTaskCreateInput{UserID: user.ID, ClientTaskID: "client-remix-workflow", NodeID: "workflow-image", Model: "工作流图片", BillingName: billingName, WorkflowRef: `{"scope":"system","channelId":"channel-1","kind":"workflow","workflowId":"workflow-1"}`, Prompt: "approved prompt", Credits: 2, RemixApproval: approval.ID, RemixSlot: slots[0].ID}
	first, created, err := CreateCanvasImageTask(input)
	if err != nil || !created || first.BillingState != "charged" {
		t.Fatalf("approved workflow create: task=%#v created=%v err=%v", first, created, err)
	}
	if _, created, err := CreateCanvasImageTask(input); err != nil || created {
		t.Fatalf("workflow replay: created=%v err=%v", created, err)
	}
	var balance model.User
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 8 {
		t.Fatalf("workflow balance=%v want=8 err=%v", balance.Credits, err)
	}
	input.ClientTaskID = "client-remix-workflow-2"
	if _, created, err := CreateCanvasImageTask(input); err == nil || created {
		t.Fatalf("consumed workflow approval created task: created=%v err=%v", created, err)
	}
}

func TestCanvasRemixApprovalNewReviewCreatesFreshEnvelope(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	input := CanvasRemixApprovalInput{UserID: "remix-owner-review", RunID: "run-review", ApprovalKey: "plan-review", ApprovalRequestID: "review-1", CoreVersion: "marketing-remix-1", Slots: []CanvasRemixApprovalSlotInput{{NodeID: "image-review", Model: "image-model", Prompt: "prompt"}}}
	first, _, err := ApproveCanvasRemix(input)
	if err != nil {
		t.Fatal(err)
	}
	input.ApprovalRequestID = "review-2"
	second, secondSlots, err := ApproveCanvasRemix(input)
	if err != nil {
		t.Fatal(err)
	}
	if second.ID == first.ID || len(secondSlots) != 1 || secondSlots[0].ApprovalID != second.ID {
		t.Fatalf("new review reused approval envelope: first=%#v second=%#v slots=%#v", first, second, secondSlots)
	}
}

func TestCanvasRemixApprovalReplaysAndExpires(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	input := CanvasRemixApprovalInput{UserID: "remix-owner-2", RunID: "run-2", ApprovalRequestID: "request-2", ApprovalKey: "approved-plan-key-2", CoreVersion: "marketing-remix-1", Slots: []CanvasRemixApprovalSlotInput{{NodeID: "image-2", Model: "image-model", Prompt: "prompt"}}}
	first, firstSlots, err := ApproveCanvasRemix(input)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := ApproveCanvasRemix(input)
	if err != nil || second.ID != first.ID {
		t.Fatalf("approval replay: %#v %v", second, err)
	}
	db, _ := repository.DB()
	if err := db.Model(&model.CanvasRemixApproval{}).Where("id = ?", first.ID).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	if err := ClaimCanvasRemixApprovalSlot(first.UserID, first.ID, firstSlots[0].ID, firstSlots[0].RequestHash, "expired-task"); err == nil {
		t.Fatal("expired approval was accepted")
	}
}
