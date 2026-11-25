package repository

import (
	"errors"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrScriptProjectConflict  = errors.New("script project create conflict")
	ErrScriptRevisionConflict = errors.New("script project revision conflict")
)

func ListScriptProjects(userID string) ([]model.ScriptProjectSummary, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	items := make([]model.ScriptProjectSummary, 0)
	err = db.Model(&model.ScriptProject{}).
		Where("user_id = ? AND deleted_at = ''", userID).
		Select("id", "title", "format", "genre", "logline", "episode_count", "scene_count", "character_count", "word_count", "locked_episode_count", "has_publication", "publication_stale", "revision", "created_at", "updated_at").
		Order("updated_at desc, id asc").
		Find(&items).Error
	return items, err
}

func GetScriptProject(userID, id string) (model.ScriptProject, error) {
	db, err := DB()
	if err != nil {
		return model.ScriptProject{}, err
	}
	var item model.ScriptProject
	err = db.First(&item, "user_id = ? AND id = ? AND deleted_at = ''", userID, id).Error
	return item, err
}

func CreateScriptProject(item model.ScriptProject) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&item)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrScriptProjectConflict
		}
		return nil
	})
}

func WithScriptProjectTx(userID, id string, fn func(tx *gorm.DB, item model.ScriptProject) error) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var item model.ScriptProject
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, "user_id = ? AND id = ? AND deleted_at = ''", userID, id).Error; err != nil {
			return err
		}
		return fn(tx, item)
	})
}

func UpdateScriptProject(item model.ScriptProject, expectedRevision int64) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		return UpdateScriptProjectTx(tx, item, expectedRevision)
	})
}

func UpdateScriptProjectTx(tx *gorm.DB, item model.ScriptProject, expectedRevision int64) error {
	return updateScriptProject(tx, item, expectedRevision)
}

func updateScriptProject(tx *gorm.DB, item model.ScriptProject, expectedRevision int64) error {
	result := tx.Model(&model.ScriptProject{}).
		Where("user_id = ? AND id = ? AND revision = ? AND deleted_at = ''", item.UserID, item.ID, expectedRevision).
		Select("title", "format", "genre", "logline", "episode_count", "scene_count", "character_count", "word_count", "locked_episode_count", "has_publication", "publication_stale", "revision", "data", "updated_at").
		Updates(&item)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrScriptRevisionConflict
	}
	return nil
}

func DeleteScriptProject(userID, id string, revision int64) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var item model.ScriptProject
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, "user_id = ? AND id = ?", userID, id).Error; err != nil {
			return err
		}
		if item.DeletedAt != "" {
			return nil
		}
		if item.Revision != revision {
			return ErrScriptRevisionConflict
		}
		deletedAt := time.Now().UTC().Format(time.RFC3339Nano)
		result := tx.Model(&model.ScriptProject{}).
			Where("user_id = ? AND id = ? AND revision = ? AND deleted_at = ''", userID, id, revision).
			Update("deleted_at", deletedAt)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrScriptRevisionConflict
		}
		return tx.Model(&model.ScriptVersion{}).
			Where("user_id = ? AND project_id = ? AND deleted_at = ''", userID, id).
			Update("deleted_at", deletedAt).Error
	})
}
