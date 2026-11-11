package repository

import (
	"errors"
	"strings"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

func SavePublishRecord(record model.PublishRecord) (model.PublishRecord, error) {
	db, err := DB()
	if err != nil {
		return record, err
	}
	return record, db.Save(&record).Error
}

func GetPublishRecord(id string) (model.PublishRecord, bool, error) {
	db, err := DB()
	if err != nil {
		return model.PublishRecord{}, false, err
	}
	var record model.PublishRecord
	err = db.First(&record, "id = ?", strings.TrimSpace(id)).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.PublishRecord{}, false, nil
		}
		return model.PublishRecord{}, false, err
	}
	return record, true, nil
}

func ListUserPublishRecords(userID string, limit int) ([]model.PublishRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var records []model.PublishRecord
	err = db.Where("user_id = ?", userID).Order("created_at DESC").Limit(limit).Find(&records).Error
	return records, err
}

func UpdatePublishRecord(record model.PublishRecord) (model.PublishRecord, error) {
	db, err := DB()
	if err != nil {
		return record, err
	}
	return record, db.Save(&record).Error
}
