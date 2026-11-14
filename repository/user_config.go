package repository

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func userConfigTimestamp() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func GetUserConfig(userID string) (model.UserConfig, bool, error) {
	db, err := DB()
	if err != nil {
		return model.UserConfig{}, false, err
	}
	var config model.UserConfig
	err = db.First(&config, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.UserConfig{}, false, nil
	}
	return config, err == nil, err
}

func ensureUserConfigRow(tx *gorm.DB, userID string) error {
	now := userConfigTimestamp()
	placeholder := model.UserConfig{UserID: userID, CreatedAt: now, UpdatedAt: now}
	return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, DoNothing: true}).Create(&placeholder).Error
}

func updateUserConfigField(userID string, fields map[string]any) (model.UserConfig, error) {
	db, err := DB()
	if err != nil {
		return model.UserConfig{}, err
	}
	var saved model.UserConfig
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := ensureUserConfigRow(tx, userID); err != nil {
			return err
		}
		var current model.UserConfig
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "user_id = ?", userID).Error; err != nil {
			return err
		}
		fields["updated_at"] = userConfigTimestamp()
		if err := tx.Model(&model.UserConfig{}).Where("user_id = ?", userID).Updates(fields).Error; err != nil {
			return err
		}
		if err := tx.First(&saved, "user_id = ?", userID).Error; err != nil {
			return err
		}
		return nil
	})
	return saved, err
}

func SaveUserAssetDataWithMarketingGuard(userID, raw string) (model.UserConfig, error) {
	db, err := DB()
	if err != nil {
		return model.UserConfig{}, err
	}
	var saved model.UserConfig
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := ensureUserConfigRow(tx, userID); err != nil {
			return err
		}
		var current model.UserConfig
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "user_id = ?", userID).Error; err != nil {
			return err
		}
		var referenced []string
		if err := tx.Model(&model.MarketingAssetReferenceRecord{}).Where("owner_user_id = ?", userID).Distinct().Pluck("asset_id", &referenced).Error; err != nil {
			return err
		}
		var incoming struct {
			Assets []struct {
				ID string `json:"id"`
			} `json:"assets"`
		}
		if err := json.Unmarshal([]byte(raw), &incoming); err != nil {
			return err
		}
		ids := make(map[string]bool, len(incoming.Assets))
		for _, asset := range incoming.Assets {
			ids[asset.ID] = true
		}
		for _, id := range referenced {
			if !ids[id] {
				return errors.New("素材仍被营销资料引用，请先解除引用后再删除")
			}
		}
		if err := tx.Model(&model.UserConfig{}).Where("user_id = ?", userID).Updates(map[string]any{"asset_data": raw, "updated_at": userConfigTimestamp()}).Error; err != nil {
			return err
		}
		current.AssetData = raw
		current.UpdatedAt = userConfigTimestamp()
		saved = current
		return nil
	})
	return saved, err
}

func SaveUserConfig(config model.UserConfig) (model.UserConfig, error) {
	fields := map[string]any{"model_config": config.ModelConfig, "storage_provider": config.StorageProvider, "image_history": config.ImageHistory}
	if config.AssetData != "" {
		fields["asset_data"] = config.AssetData
	}
	return updateUserConfigField(config.UserID, fields)
}
