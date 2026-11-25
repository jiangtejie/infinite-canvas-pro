package repository

import (
	"errors"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

var ErrCanvasRemixApprovalInvalid = errors.New("canvas remix approval invalid")
var ErrCanvasRemixApprovalConsumed = errors.New("canvas remix approval slot consumed")

func SaveCanvasRemixApproval(approval model.CanvasRemixApproval, slots []model.CanvasRemixApprovalSlot) (model.CanvasRemixApproval, []model.CanvasRemixApprovalSlot, error) {
	db, err := DB()
	if err != nil {
		return approval, nil, err
	}
	var existing model.CanvasRemixApproval
	if err := db.Where("id = ? AND user_id = ?", approval.ID, approval.UserID).First(&existing).Error; err == nil {
		var existingSlots []model.CanvasRemixApprovalSlot
		if err := db.Where("approval_id = ? AND user_id = ?", existing.ID, existing.UserID).Order("created_at ASC, id ASC").Find(&existingSlots).Error; err != nil {
			return approval, nil, err
		}
		return existing, existingSlots, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return approval, nil, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&approval).Error; err != nil {
			return err
		}
		return tx.Create(&slots).Error
	})
	if err != nil {
		if existingErr := db.Where("id = ? AND user_id = ?", approval.ID, approval.UserID).First(&existing).Error; existingErr == nil {
			var existingSlots []model.CanvasRemixApprovalSlot
			if slotErr := db.Where("approval_id = ? AND user_id = ?", existing.ID, existing.UserID).Order("created_at ASC, id ASC").Find(&existingSlots).Error; slotErr != nil {
				return approval, nil, slotErr
			}
			return existing, existingSlots, nil
		}
		return approval, nil, err
	}
	return approval, slots, nil
}

func ClaimCanvasRemixApprovalSlot(userID, approvalID, slotID, requestHash, taskID string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return claimCanvasRemixApprovalSlot(db, userID, approvalID, slotID, requestHash, taskID, time.Now())
}

func claimCanvasRemixApprovalSlot(db *gorm.DB, userID, approvalID, slotID, requestHash, taskID string, now time.Time) error {
	var slot model.CanvasRemixApprovalSlot
	if err := db.Where("id = ? AND user_id = ? AND approval_id = ? AND request_hash = ?", slotID, userID, approvalID, requestHash).First(&slot).Error; err != nil {
		return ErrCanvasRemixApprovalInvalid
	}
	var approval model.CanvasRemixApproval
	if err := db.Where("id = ? AND user_id = ?", slot.ApprovalID, userID).First(&approval).Error; err != nil {
		return ErrCanvasRemixApprovalInvalid
	}
	if !approval.ExpiresAt.After(now) {
		return ErrCanvasRemixApprovalInvalid
	}
	result := db.Model(&model.CanvasRemixApprovalSlot{}).
		Where("id = ? AND user_id = ? AND consumed_by_task = ?", slotID, userID, "").
		Updates(map[string]any{"consumed_by_task": taskID})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrCanvasRemixApprovalConsumed
	}
	return nil
}
