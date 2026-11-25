package repository

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

const (
	// 未派发即中断的任务最多领取次数，超过后失败退款，避免异常任务反复重排。
	canvasImageTaskMaxAttempts = 3
	// 单个用户同时执行的图片任务上限，避免一次大批量占满全局 worker。
	canvasImageTaskUserConcurrency = 2
)

func ClaimNextCanvasImageTask(owner string, now time.Time, leaseUntil time.Time) (model.CanvasImageTask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.CanvasImageTask{}, false, err
	}
	busyUsers := db.Model(&model.CanvasImageTask{}).Select("user_id").
		Where("status = ? AND (workflow_ref = ? OR workflow_ref IS NULL)", "processing", "").
		Group("user_id").Having("COUNT(*) >= ?", canvasImageTaskUserConcurrency)
	var task model.CanvasImageTask
	if err := db.Where("status = ? AND (workflow_ref = ? OR workflow_ref IS NULL) AND user_id NOT IN (?)", "queued", "", busyUsers).Order("created_at ASC, id ASC").First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return model.CanvasImageTask{}, false, nil
		}
		return model.CanvasImageTask{}, false, err
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	result := db.Model(&model.CanvasImageTask{}).
		Where("id = ? AND user_id = ? AND status = ?", task.ID, task.UserID, "queued").
		Updates(map[string]any{
			"status": "processing", "attempt": gorm.Expr("attempt + 1"), "lease_owner": owner,
			"lease_until": leaseUntil.UTC(), "dispatch_state": "not_dispatched", "updated_at": stamp,
		})
	if result.Error != nil || result.RowsAffected != 1 {
		return model.CanvasImageTask{}, false, result.Error
	}
	if err := db.First(&task, "id = ? AND user_id = ?", task.ID, task.UserID).Error; err != nil {
		return model.CanvasImageTask{}, false, err
	}
	return task, true, nil
}

func RenewCanvasImageTaskLease(id, userID, owner string, leaseUntil time.Time) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	result := db.Model(&model.CanvasImageTask{}).
		Where("id = ? AND user_id = ? AND status = ? AND lease_owner = ?", id, userID, "processing", owner).
		Updates(map[string]any{"lease_until": leaseUntil.UTC(), "updated_at": leaseUntil.UTC().Format(time.RFC3339Nano)})
	return result.RowsAffected == 1, result.Error
}

func UpdateCanvasImageTaskRuntime(task model.CanvasImageTask, owner string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	result := db.Model(&model.CanvasImageTask{}).
		Where("id = ? AND user_id = ? AND status = ? AND lease_owner = ?", task.ID, task.UserID, "processing", owner).
		Updates(map[string]any{
			"progress": task.Progress, "started_at": task.StartedAt, "upstream_task_id": task.UpstreamTaskID,
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	return result.RowsAffected == 1, result.Error
}

func MarkCanvasImageTaskDispatched(id, userID, owner string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	result := db.Model(&model.CanvasImageTask{}).
		Where("id = ? AND user_id = ? AND status = ? AND lease_owner = ?", id, userID, "processing", owner).
		Update("dispatch_state", "dispatched")
	return result.RowsAffected == 1, result.Error
}

func CompleteCanvasImageTask(task model.CanvasImageTask, owner string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	completed := false
	stamp := time.Now().UTC()
	err = db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.CanvasImageTask{}).
			Where("id = ? AND user_id = ? AND status = ? AND lease_owner = ?", task.ID, task.UserID, "processing", owner).
			Updates(map[string]any{
				"status": task.Status, "progress": task.Progress, "started_at": task.StartedAt, "completed_at": task.CompletedAt,
				"response_body": task.ResponseBody, "upstream_task_id": task.UpstreamTaskID, "error": task.Error, "error_detail": task.ErrorDetail,
				"image_url": task.ImageURL, "image_urls": task.ImageURLs, "storage_key": task.StorageKey, "mime_type": task.MimeType,
				"bytes": task.Bytes, "width": task.Width, "height": task.Height, "lease_owner": "", "lease_until": nil,
				"billing_state": gorm.Expr("CASE WHEN billing_state = ? AND ? IN (?, ?) THEN ? ELSE billing_state END", "charged", task.Status, "failed", "cancelled", "refunding"),
				"updated_at":    stamp.Format(time.RFC3339Nano),
			})
		if result.Error != nil || result.RowsAffected != 1 {
			return result.Error
		}
		completed = true
		var current model.CanvasImageTask
		if err := tx.First(&current, "id = ? AND user_id = ?", task.ID, task.UserID).Error; err != nil {
			return err
		}
		if current.BillingState != "refunding" {
			return nil
		}
		return refundCanvasImageTask(tx, current, stamp)
	})
	return completed, err
}

func refundCanvasImageTask(tx *gorm.DB, task model.CanvasImageTask, stamp time.Time) error {
	if task.Credits <= 0 {
		return tx.Model(&model.CanvasImageTask{}).Where("id = ? AND user_id = ?", task.ID, task.UserID).Update("billing_state", "refunded").Error
	}
	updated := tx.Model(&model.User{}).Where("id = ?", task.UserID).Updates(map[string]any{
		"credits": gorm.Expr("ROUND(credits + CAST(? AS DECIMAL(20,2)), 2)", task.Credits), "updated_at": stamp.Format(time.RFC3339Nano),
	})
	if updated.Error != nil || updated.RowsAffected != 1 {
		return updated.Error
	}
	var user model.User
	if err := tx.First(&user, "id = ?", task.UserID).Error; err != nil {
		return err
	}
	extra, _ := json.Marshal(map[string]string{"model": task.Model, "path": task.Endpoint, "taskId": task.ID})
	if err := tx.Create(&model.CreditLog{ID: uuid.NewString(), UserID: task.UserID, Type: model.CreditLogTypeAIRefund, Amount: task.Credits, Balance: user.Credits, Remark: "模型调用失败返还 " + task.Model, Extra: string(extra), CreatedAt: stamp.Format(time.RFC3339Nano)}).Error; err != nil {
		return err
	}
	return tx.Model(&model.CanvasImageTask{}).Where("id = ? AND user_id = ?", task.ID, task.UserID).Update("billing_state", "refunded").Error
}

func RecoverExpiredCanvasImageTasks(now time.Time) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	unknown := db.Model(&model.CanvasImageTask{}).
		Where("status = ? AND lease_until < ? AND dispatch_state = ? AND (workflow_ref = ? OR workflow_ref IS NULL)", "processing", now.UTC(), "dispatched", "").
		Updates(map[string]any{"status": "unknown", "error": "任务执行中断，请手动重试", "error_detail": "任务可能已派发到上游，但执行结果丢失", "completed_at": stamp, "lease_owner": "", "lease_until": nil, "updated_at": stamp})
	if unknown.Error != nil {
		return 0, unknown.Error
	}
	var exhausted []model.CanvasImageTask
	if err := db.Where("status = ? AND lease_until < ? AND dispatch_state <> ? AND attempt >= ? AND (workflow_ref = ? OR workflow_ref IS NULL)", "processing", now.UTC(), "dispatched", canvasImageTaskMaxAttempts, "").Find(&exhausted).Error; err != nil {
		return unknown.RowsAffected, err
	}
	failed := int64(0)
	for _, task := range exhausted {
		task.Status, task.Error, task.ErrorDetail, task.CompletedAt = "failed", "图片任务多次中断，已退回算力点，请重新生成", "任务未派发到上游，已达最大重试次数", stamp
		ok, err := CompleteCanvasImageTask(task, task.LeaseOwner)
		if err != nil {
			return unknown.RowsAffected + failed, err
		}
		if ok {
			failed++
		}
	}
	queued := db.Model(&model.CanvasImageTask{}).
		Where("status = ? AND lease_until < ? AND dispatch_state <> ? AND attempt < ? AND (workflow_ref = ? OR workflow_ref IS NULL)", "processing", now.UTC(), "dispatched", canvasImageTaskMaxAttempts, "").
		Updates(map[string]any{"status": "queued", "lease_owner": "", "lease_until": nil, "updated_at": stamp})
	return unknown.RowsAffected + failed + queued.RowsAffected, queued.Error
}
