package repository

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

var ErrCanvasImageTaskConflict = errors.New("canvas image task conflict")
var ErrCanvasImageTaskInsufficientCredits = errors.New("canvas image task insufficient credits")

func CreateCanvasImageTaskIdempotent(task model.CanvasImageTask) (model.CanvasImageTask, bool, error) {
	db, err := DB()
	if err != nil {
		return task, false, err
	}
	return createCanvasImageTaskIdempotent(db, task)
}

func createCanvasImageTaskIdempotent(db *gorm.DB, task model.CanvasImageTask) (model.CanvasImageTask, bool, error) {
	if strings.TrimSpace(task.ClientTaskID) == "" {
		task.ClientTaskID = task.ID
	}
	var existing model.CanvasImageTask
	err := db.Where("client_task_id = ?", task.ClientTaskID).First(&existing).Error
	if err == nil {
		if existing.UserID != task.UserID || existing.RequestHash != task.RequestHash {
			return model.CanvasImageTask{}, false, ErrCanvasImageTaskConflict
		}
		return existing, false, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return model.CanvasImageTask{}, false, err
	}
	if result := db.Create(&task); result.Error != nil {
		err = db.Where("client_task_id = ?", task.ClientTaskID).First(&existing).Error
		if err == nil {
			if existing.UserID != task.UserID || existing.RequestHash != task.RequestHash {
				return model.CanvasImageTask{}, false, ErrCanvasImageTaskConflict
			}
			return existing, false, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return model.CanvasImageTask{}, false, err
		}
		return model.CanvasImageTask{}, false, result.Error
	}
	return task, true, nil
}

func CreateCanvasImageTaskWithCredits(task model.CanvasImageTask, consumeLog model.CreditLog, approvalHash string) (model.CanvasImageTask, bool, error) {
	db, err := DB()
	if err != nil {
		return task, false, err
	}
	created := false
	err = db.Transaction(func(tx *gorm.DB) error {
		clientTaskID := strings.TrimSpace(task.ClientTaskID)
		if clientTaskID == "" {
			task.ClientTaskID = task.ID
			clientTaskID = task.ID
		}
		var existing model.CanvasImageTask
		err := tx.Where("client_task_id = ?", clientTaskID).First(&existing).Error
		if err == nil {
			if existing.UserID != task.UserID || existing.RequestHash != task.RequestHash {
				return ErrCanvasImageTaskConflict
			}
			task = existing
			created = false
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if task.Credits > 0 {
			updated := tx.Model(&model.User{}).Where("id = ? AND credits >= CAST(? AS DECIMAL(20,2))", task.UserID, task.Credits).Updates(map[string]any{
				"credits": gorm.Expr("ROUND(credits - CAST(? AS DECIMAL(20,2)), 2)", task.Credits), "updated_at": task.UpdatedAt,
			})
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected == 0 {
				return ErrCanvasImageTaskInsufficientCredits
			}
			var user model.User
			if err := tx.First(&user, "id = ?", task.UserID).Error; err != nil {
				return err
			}
			consumeLog.Balance = user.Credits
			if err := tx.Create(&consumeLog).Error; err != nil {
				return err
			}
			task.BillingState = "charged"
		} else {
			task.BillingState = "free"
		}
		if task.RemixSlot != "" {
			if err := claimCanvasRemixApprovalSlot(tx, task.UserID, task.RemixApproval, task.RemixSlot, approvalHash, task.ID, time.Now()); err != nil {
				return err
			}
		}
		var resultTask model.CanvasImageTask
		var createErr error
		resultTask, created, createErr = createCanvasImageTaskIdempotent(tx, task)
		if createErr != nil {
			return createErr
		}
		task = resultTask
		return nil
	})
	if err != nil {
		if errors.Is(err, ErrCanvasImageTaskConflict) || errors.Is(err, ErrCanvasRemixApprovalInvalid) || errors.Is(err, ErrCanvasRemixApprovalConsumed) {
			return model.CanvasImageTask{}, false, err
		}
		var existing model.CanvasImageTask
		clientTaskID := strings.TrimSpace(task.ClientTaskID)
		if clientTaskID == "" {
			clientTaskID = task.ID
		}
		lookupErr := db.Where("client_task_id = ?", clientTaskID).First(&existing).Error
		if lookupErr == nil {
			if existing.UserID != task.UserID || existing.RequestHash != task.RequestHash {
				return model.CanvasImageTask{}, false, ErrCanvasImageTaskConflict
			}
			return existing, false, nil
		}
		return model.CanvasImageTask{}, false, err
	}
	return task, created, nil
}

func MarkWorkflowCanvasImageTaskRunning(id, userID, upstreamTaskID string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	responseBody, _ := json.Marshal(map[string]string{"upstreamTaskId": upstreamTaskID})
	result := db.Model(&model.CanvasImageTask{}).
		Where("id = ? AND user_id = ? AND status = ? AND workflow_ref <> ?", id, userID, "queued", "").
		Updates(map[string]any{
			"status": "running", "progress": 10, "response_body": string(responseBody),
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	return result.RowsAffected == 1, result.Error
}

func GetUserCanvasImageTask(userID string, id string) (model.CanvasImageTask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.CanvasImageTask{}, false, err
	}
	var task model.CanvasImageTask
	err = db.First(&task, "user_id = ? AND id = ?", userID, id).Error
	if err != nil {
		return model.CanvasImageTask{}, false, nil
	}
	return task, true, nil
}

func ListUserCanvasImageTasks(userID string, sources []string, limit int) ([]model.CanvasImageTask, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}
	var tasks []model.CanvasImageTask
	query := db.Where("user_id = ?", userID)
	if len(sources) > 0 {
		query = query.Where("source IN ?", sources)
	}
	err = query.
		Where("status IN ?", []string{"queued", "processing", "running", "in_progress"}).
		Order("created_at DESC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

func BatchUserCanvasImageTasks(userID string, ids []string) ([]model.CanvasImageTask, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	keys := uniqueTrimmedValues(ids...)
	if len(keys) == 0 {
		return []model.CanvasImageTask{}, nil
	}
	var tasks []model.CanvasImageTask
	err = db.Where("user_id = ? AND id IN ?", userID, keys).Find(&tasks).Error
	return tasks, err
}

func DeleteUserCanvasImageTask(userID string, id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("user_id = ? AND id = ?", userID, strings.TrimSpace(id)).Delete(&model.CanvasImageTask{}).Error
}

func HasActiveCanvasImageTasks() (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var count int64
	err = db.Model(&model.CanvasImageTask{}).
		Where("status IN ?", []string{"queued", "processing", "running", "in_progress"}).
		Count(&count).Error
	return count > 0, err
}

func DeleteFinishedCanvasImageTasksBefore(before string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("completed_at <> ? AND completed_at < ?", "", before).
		Where("status IN ?", []string{"completed", "failed", "cancelled"}).
		Delete(&model.CanvasImageTask{}).Error
}

func uniqueTrimmedValues(values ...string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			result = append(result, value)
			seen[value] = true
		}
	}
	return result
}
