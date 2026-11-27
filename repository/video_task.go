package repository

import (
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func SaveFailedTranslatedVideoTask(task model.VideoTask, refundLog model.CreditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		updated := tx.Model(&model.VideoTask{}).Where("id = ? AND status NOT IN ?", task.ID, []string{"completed", "failed", "cancelled", "canceled"}).Select("*").Updates(&task)
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected == 0 || refundLog.Amount <= 0 {
			return nil
		}
		user, found, err := refundUserCredits(tx, task.UserID, refundLog.Amount, refundLog.CreatedAt)
		if err != nil {
			return err
		}
		if !found {
			return gorm.ErrRecordNotFound
		}
		refundLog.Balance = user.Credits
		return tx.Create(&refundLog).Error
	})
}

func SaveVideoTask(task model.VideoTask) (model.VideoTask, error) {
	db, err := DB()
	if err != nil {
		return task, err
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&task).Error; err != nil {
		return task, err
	}
	update := db.Model(&model.VideoTask{}).Where("user_id = ? AND id = ? AND status <> ?", task.UserID, task.ID, "cancelled").Select("*").Updates(&task)
	if update.Error == nil && update.RowsAffected == 0 {
		update = db.First(&task, "user_id = ? AND id = ?", task.UserID, task.ID)
	}
	return task, update.Error
}

func UpdateVideoTask(task model.VideoTask) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.VideoTask{}).
		Where("id = ? AND status <> ?", task.ID, "cancelled").
		Select("*").Updates(&task).Error
}

func GetVideoTask(id string) (model.VideoTask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.VideoTask{}, false, err
	}
	var task model.VideoTask
	err = db.First(&task, "id = ?", id).Error
	if err != nil {
		return model.VideoTask{}, false, nil
	}
	return task, true, nil
}

func GetUserVideoTask(userID string, id string) (model.VideoTask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.VideoTask{}, false, err
	}
	var task model.VideoTask
	err = db.First(&task, "user_id = ? AND (id = ? OR upstream_task_id = ? OR upstream_video_id = ?)", userID, id, id, id).Error
	if err != nil {
		return model.VideoTask{}, false, nil
	}
	return task, true, nil
}

func ListUserVideoTasks(userID string, source string, limit int) ([]model.VideoTask, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}
	var tasks []model.VideoTask
	query := db.Where("user_id = ?", userID)
	if source != "" {
		if source == "video-workbench" {
			query = query.Where("(source = ? OR source = '' OR source IS NULL)", source)
		} else {
			query = query.Where("source = ?", source)
		}
	}
	err = query.
		Where("status IN ?", []string{"queued", "in_progress", "processing", "running"}).
		Order("created_at DESC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

func DeleteUserVideoTask(userID string, id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Where("user_id = ? AND (id = ? OR upstream_task_id = ? OR upstream_video_id = ?)", userID, id, id, id).Delete(&model.VideoTask{}).Error
}

// activeVideoTaskStatuses 仍在等待上游结果的视频任务状态。
var activeVideoTaskStatuses = []string{"queued", "in_progress", "processing", "running", "unknown"}

// ListDueVideoTasks 按 last_polled_at 轮转取任务：只返回距上次轮询超过一个周期的任务，
// 否则超过 limit 的旧任务会一直占住结果集，新任务永远轮询不到。
func ListDueVideoTasks(dueBefore string, limit int) ([]model.VideoTask, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}
	var tasks []model.VideoTask
	err = db.Where("status IN ?", activeVideoTaskStatuses).
		Where("(workflow_ref = '' OR workflow_ref IS NULL)").
		Where("(last_polled_at = '' OR last_polled_at IS NULL OR last_polled_at < ?)", dueBefore).
		Order("last_polled_at ASC").
		Order("created_at ASC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

// HasActiveVideoTasks 判断是否仍有未结束的视频任务，用于轮询循环判断能否休眠。
func HasActiveVideoTasks() (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var count int64
	err = db.Model(&model.VideoTask{}).
		Where("status IN ?", activeVideoTaskStatuses).
		Where("(workflow_ref = '' OR workflow_ref IS NULL)").
		Count(&count).Error
	return count > 0, err
}

func DeleteFinishedVideoTasksBefore(before string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.
		Where("completed_at <> ? AND completed_at < ?", "", before).
		Where("status IN ?", []string{"completed", "failed", "cancelled", "canceled"}).
		Delete(&model.VideoTask{}).Error
}
