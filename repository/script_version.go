package repository

import (
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

func ListScriptVersions(tx *gorm.DB, userID, projectID string) ([]model.ScriptVersionSummary, error) {
	items := make([]model.ScriptVersionSummary, 0)
	err := tx.Model(&model.ScriptVersion{}).
		Where("user_id = ? AND project_id = ? AND deleted_at = ''", userID, projectID).
		Select("id", "project_id", "scope", "episode_id", "label", "kind", "hash", "created_at").
		Order("created_at desc, id asc").
		Find(&items).Error
	return items, err
}

func GetScriptVersion(tx *gorm.DB, userID, projectID, versionID string) (model.ScriptVersion, error) {
	var item model.ScriptVersion
	err := tx.First(&item, "user_id = ? AND project_id = ? AND id = ? AND deleted_at = ''", userID, projectID, versionID).Error
	return item, err
}

func GetScriptVersionRecord(tx *gorm.DB, userID, projectID, versionID string) (model.ScriptVersion, error) {
	var item model.ScriptVersion
	err := tx.First(&item, "user_id = ? AND project_id = ? AND id = ?", userID, projectID, versionID).Error
	return item, err
}

func CreateScriptVersion(tx *gorm.DB, item model.ScriptVersion) error {
	return tx.Create(&item).Error
}

func ListScriptSafetyVersions(tx *gorm.DB, userID, projectID string) ([]model.ScriptVersionSummary, error) {
	items := make([]model.ScriptVersionSummary, 0)
	err := tx.Model(&model.ScriptVersion{}).
		Where("user_id = ? AND project_id = ? AND kind = ? AND deleted_at = ''", userID, projectID, "safety").
		Select("id", "project_id", "scope", "episode_id", "label", "kind", "hash", "created_at").
		Order("created_at desc, id asc").
		Find(&items).Error
	return items, err
}

func TombstoneScriptVersion(tx *gorm.DB, userID, projectID, versionID string) error {
	return tx.Model(&model.ScriptVersion{}).
		Where("user_id = ? AND project_id = ? AND id = ? AND deleted_at = ''", userID, projectID, versionID).
		Update("deleted_at", nowScriptTimestamp()).Error
}

func nowScriptTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
