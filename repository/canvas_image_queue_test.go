package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func setupCanvasImageQueueDB(t *testing.T) {
	t.Helper()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := DB(); err != nil {
		t.Fatal(err)
	}
}

func TestCanvasImageQueueClaimsRenewsAndCompletesWithLease(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	now := time.Now().UTC()
	task := model.CanvasImageTask{ID: "queue-task-1", ClientTaskID: "queue-client-1", UserID: "queue-user", RequestHash: "hash-1", Status: "queued", CreatedAt: now.Format(time.RFC3339Nano)}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := ClaimNextCanvasImageTask("worker-a", now, now.Add(time.Minute))
	if err != nil || !ok || claimed.ID != task.ID || claimed.Status != "processing" || claimed.Attempt != 1 {
		t.Fatalf("claim: %#v ok=%v err=%v", claimed, ok, err)
	}
	if _, ok, err := ClaimNextCanvasImageTask("worker-b", now, now.Add(time.Minute)); err != nil || ok {
		t.Fatalf("second claim: ok=%v err=%v", ok, err)
	}
	if ok, err := RenewCanvasImageTaskLease(task.ID, task.UserID, "wrong-worker", now.Add(2*time.Minute)); err != nil || ok {
		t.Fatalf("wrong renewal: ok=%v err=%v", ok, err)
	}
	if ok, err := RenewCanvasImageTaskLease(task.ID, task.UserID, "worker-a", now.Add(2*time.Minute)); err != nil || !ok {
		t.Fatalf("renewal: ok=%v err=%v", ok, err)
	}
	claimed.Status, claimed.Progress, claimed.CompletedAt = "completed", 100, now.Format(time.RFC3339Nano)
	if ok, err := CompleteCanvasImageTask(claimed, "wrong-worker"); err != nil || ok {
		t.Fatalf("wrong completion: ok=%v err=%v", ok, err)
	}
	if ok, err := CompleteCanvasImageTask(claimed, "worker-a"); err != nil || !ok {
		t.Fatalf("completion: ok=%v err=%v", ok, err)
	}
	var saved model.CanvasImageTask
	if err := db.First(&saved, "id = ?", task.ID).Error; err != nil || saved.Status != "completed" || saved.Progress != 100 {
		t.Fatalf("saved: %#v err=%v", saved, err)
	}
}

func TestCanvasImageTaskFailureRefundsChargeExactlyOnce(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	now := time.Now().UTC()
	user := model.User{ID: "refund-user", Username: "refund-user", AffCode: "refund-user", Status: model.UserStatusActive, Credits: 10}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	task := model.CanvasImageTask{ID: "refund-task", ClientTaskID: "refund-client", UserID: user.ID, RequestHash: "refund-hash", Model: "image-model", Credits: 2, Status: "queued", CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)}
	task, created, err := CreateCanvasImageTaskWithCredits(task, model.CreditLog{ID: uuid.NewString(), UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -2, Remark: "consume", CreatedAt: now.Format(time.RFC3339Nano)}, "")
	if err != nil || !created {
		t.Fatalf("create charged task: created=%v err=%v", created, err)
	}
	claimed, ok, err := ClaimNextCanvasImageTask("refund-worker", now, now.Add(time.Minute))
	if err != nil || !ok {
		t.Fatalf("claim: ok=%v err=%v", ok, err)
	}
	claimed.Status, claimed.Error, claimed.CompletedAt = "failed", "upstream failed", now.Format(time.RFC3339Nano)
	if ok, err := CompleteCanvasImageTask(claimed, "refund-worker"); err != nil || !ok {
		t.Fatalf("complete failed task: ok=%v err=%v", ok, err)
	}
	if ok, err := CompleteCanvasImageTask(claimed, "refund-worker"); err != nil || ok {
		t.Fatalf("second completion: ok=%v err=%v", ok, err)
	}
	var balance model.User
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 10 {
		t.Fatalf("balance=%v want=10 err=%v", balance.Credits, err)
	}
	var refunds int64
	if err := db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIRefund).Count(&refunds).Error; err != nil || refunds != 1 {
		t.Fatalf("refund logs=%d want=1 err=%v", refunds, err)
	}
	var saved model.CanvasImageTask
	if err := db.First(&saved, "id = ?", task.ID).Error; err != nil || saved.BillingState != "refunded" {
		t.Fatalf("saved billing state=%q err=%v", saved.BillingState, err)
	}
}

func TestCanvasImageTaskCancellationRefundsChargeOnce(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	now := time.Now().UTC()
	user := model.User{ID: "cancel-refund-user", Username: "cancel-refund-user", AffCode: "cancel-refund-user", Status: model.UserStatusActive, Credits: 10}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	task := model.CanvasImageTask{ID: "cancel-refund-task", ClientTaskID: "cancel-refund-client", UserID: user.ID, Source: "canvas", RequestHash: "cancel-refund-hash", Model: "image-model", Credits: 2, Status: "queued", CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)}
	if _, _, err := CreateCanvasImageTaskWithCredits(task, model.CreditLog{ID: uuid.NewString(), UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -2, CreatedAt: now.Format(time.RFC3339Nano)}, ""); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		stopped, _, err := StopCanvasTask(user.ID, task.ID, "canvas", &model.CanvasImageTask{}, now)
		if err != nil || !stopped {
			t.Fatalf("stop %d: stopped=%v err=%v", i, stopped, err)
		}
	}
	var balance model.User
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 10 {
		t.Fatalf("balance=%v want=10 err=%v", balance.Credits, err)
	}
	var refunds int64
	if err := db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIRefund).Count(&refunds).Error; err != nil || refunds != 1 {
		t.Fatalf("refund logs=%d want=1 err=%v", refunds, err)
	}
}

func TestCanvasImageQueueLeavesWorkflowTasksForWorkflowExecutor(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	now := time.Now().UTC()
	task := model.CanvasImageTask{ID: "workflow-image-task", ClientTaskID: "workflow-image-client", UserID: "workflow-user", WorkflowRef: "workflow:image", Status: "queued", CreatedAt: now.Format(time.RFC3339Nano)}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	if _, ok, err := ClaimNextCanvasImageTask("canvas-worker", now, now.Add(time.Minute)); err != nil || ok {
		t.Fatalf("canvas worker claimed workflow task: ok=%v err=%v", ok, err)
	}
}

func TestWorkflowCanvasImageTaskRunningUpdateCannotResurrectCancelledTask(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	for _, task := range []model.CanvasImageTask{
		{ID: "wf-image-active", ClientTaskID: "wf-image-active-client", UserID: "workflow-user", WorkflowRef: "workflow:image", Status: "queued"},
		{ID: "wf-image-cancelled", ClientTaskID: "wf-image-cancelled-client", UserID: "workflow-user", WorkflowRef: "workflow:image", Status: "cancelled"},
	} {
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	if ok, err := MarkWorkflowCanvasImageTaskRunning("wf-image-active", "workflow-user", "upstream-1"); err != nil || !ok {
		t.Fatalf("mark queued workflow running: ok=%v err=%v", ok, err)
	}
	if ok, err := MarkWorkflowCanvasImageTaskRunning("wf-image-cancelled", "workflow-user", "upstream-2"); err != nil || ok {
		t.Fatalf("mark cancelled workflow running: ok=%v err=%v", ok, err)
	}
	var active, cancelled model.CanvasImageTask
	if err := db.First(&active, "id = ?", "wf-image-active").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&cancelled, "id = ?", "wf-image-cancelled").Error; err != nil {
		t.Fatal(err)
	}
	if active.Status != "running" || active.Progress != 10 || active.ResponseBody != `{"upstreamTaskId":"upstream-1"}` {
		t.Fatalf("active workflow update: %#v", active)
	}
	if cancelled.Status != "cancelled" || cancelled.ResponseBody != "" {
		t.Fatalf("cancelled workflow overwritten: %#v", cancelled)
	}
	if ok, err := MarkWorkflowCanvasImageTaskRunning("wf-image-active", "other-user", "upstream-3"); err != nil || ok {
		t.Fatalf("wrong owner mark: ok=%v err=%v", ok, err)
	}
}

func TestWorkflowCanvasImageTaskFailureRefundsOnceAndSuccessKeepsCharge(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	user := model.User{ID: "workflow-billing-user", Username: "workflow-billing-user", AffCode: "workflow-billing-user", Status: model.UserStatusActive, Credits: 6}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	for _, task := range []model.CanvasImageTask{
		{ID: "wf-image-failed", ClientTaskID: "wf-image-failed-client", UserID: user.ID, WorkflowRef: "workflow:image", Status: "running", Credits: 2, BillingState: "charged", Model: "image-model"},
		{ID: "wf-image-completed", ClientTaskID: "wf-image-completed-client", UserID: user.ID, WorkflowRef: "workflow:image", Status: "running", Credits: 2, BillingState: "charged", Model: "image-model"},
	} {
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	if changed, _, _, _, err := CompleteWorkflowTask("wf-image-failed", "failed", nil, "upstream failed", nil); err != nil || !changed {
		t.Fatalf("finish failed workflow: changed=%v err=%v", changed, err)
	}
	if changed, _, _, _, err := CompleteWorkflowTask("wf-image-failed", "failed", nil, "upstream failed", nil); err != nil || changed {
		t.Fatalf("repeat failed workflow: changed=%v err=%v", changed, err)
	}
	if changed, _, _, _, err := CompleteWorkflowTask("wf-image-completed", "completed", []string{"https://example.test/image.png"}, "", nil); err != nil || !changed {
		t.Fatalf("finish completed workflow: changed=%v err=%v", changed, err)
	}
	var balance model.User
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 8 {
		t.Fatalf("balance=%v want=8 err=%v", balance.Credits, err)
	}
	var refunds int64
	if err := db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIRefund).Count(&refunds).Error; err != nil || refunds != 1 {
		t.Fatalf("refund logs=%d want=1 err=%v", refunds, err)
	}
	var failed, completed model.CanvasImageTask
	if err := db.First(&failed, "id = ?", "wf-image-failed").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&completed, "id = ?", "wf-image-completed").Error; err != nil {
		t.Fatal(err)
	}
	if failed.Status != "failed" || failed.BillingState != "refunded" || completed.Status != "completed" || completed.BillingState != "charged" {
		t.Fatalf("billing states: failed=%#v completed=%#v", failed, completed)
	}
}

func TestWorkflowCanvasImageTaskCancellationCannotBeOverwrittenOrRefundedAgain(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	now := time.Now().UTC()
	user := model.User{ID: "workflow-cancel-user", Username: "workflow-cancel-user", AffCode: "workflow-cancel-user", Status: model.UserStatusActive, Credits: 6}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	task := model.CanvasImageTask{ID: "wf-image-cancelled-billing", ClientTaskID: "wf-image-cancelled-billing-client", UserID: user.ID, Source: "canvas", WorkflowRef: "workflow:image", Status: "running", Credits: 2, BillingState: "charged", Model: "image-model"}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	if stopped, _, err := StopCanvasTask(user.ID, task.ID, "canvas", &model.CanvasImageTask{}, now); err != nil || !stopped {
		t.Fatalf("stop workflow: stopped=%v err=%v", stopped, err)
	}
	if changed, _, _, _, err := CompleteWorkflowTask(task.ID, "failed", nil, "late failure", nil); err != nil || changed {
		t.Fatalf("finish cancelled workflow: changed=%v err=%v", changed, err)
	}
	var balance model.User
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 8 {
		t.Fatalf("balance=%v want=8 err=%v", balance.Credits, err)
	}
	var refunds int64
	if err := db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIRefund).Count(&refunds).Error; err != nil || refunds != 1 {
		t.Fatalf("refund logs=%d want=1 err=%v", refunds, err)
	}
	var saved model.CanvasImageTask
	if err := db.First(&saved, "id = ?", task.ID).Error; err != nil || saved.Status != "cancelled" || saved.BillingState != "refunded" {
		t.Fatalf("cancelled task changed: %#v err=%v", saved, err)
	}
}

func TestCanvasImageQueueRecoveryDoesNotResendDispatchedWork(t *testing.T) {
	setupCanvasImageQueueDB(t)
	db, _ := DB()
	now := time.Now().UTC()
	for _, task := range []model.CanvasImageTask{
		{ID: "queue-dispatched", ClientTaskID: "client-dispatched", UserID: "queue-user", Status: "processing", DispatchState: "dispatched", LeaseOwner: "dead-worker", LeaseUntil: now.Add(-time.Minute)},
		{ID: "queue-not-dispatched", ClientTaskID: "client-not-dispatched", UserID: "queue-user", Status: "processing", DispatchState: "not_dispatched", LeaseOwner: "dead-worker", LeaseUntil: now.Add(-time.Minute)},
	} {
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	count, err := RecoverExpiredCanvasImageTasks(now)
	if err != nil || count != 2 {
		t.Fatalf("recover count=%d err=%v", count, err)
	}
	var dispatched, pending model.CanvasImageTask
	if err := db.First(&dispatched, "id = ?", "queue-dispatched").Error; err != nil || dispatched.Status != "unknown" {
		t.Fatalf("dispatched recovery: %#v err=%v", dispatched, err)
	}
	if err := db.First(&pending, "id = ?", "queue-not-dispatched").Error; err != nil || pending.Status != "queued" || pending.LeaseOwner != "" {
		t.Fatalf("pending recovery: %#v err=%v", pending, err)
	}
}
