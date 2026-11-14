package repository

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrMarketingRevision = errors.New("marketing revision conflict")

func ListMarketingWorkspaces(userID string, q model.Query) (model.MarketingWorkspaceList, error) {
	db, err := DB()
	if err != nil {
		return model.MarketingWorkspaceList{}, err
	}
	q.Normalize()
	query := db.Model(&model.MarketingWorkspace{}).Where("owner_user_id = ?", userID)
	if q.Keyword != "" {
		query = query.Where("name LIKE ? OR industry LIKE ?", "%"+q.Keyword+"%", "%"+q.Keyword+"%")
	}
	result := model.MarketingWorkspaceList{Items: make([]model.MarketingWorkspace, 0)}
	if err := query.Count(&result.Total).Error; err != nil {
		return result, err
	}
	err = query.Order("updated_at desc, id asc").Offset(q.Offset()).Limit(q.PageSize).Find(&result.Items).Error
	return result, err
}

func GetMarketingWorkspace(userID, id string) (model.MarketingWorkspace, error) {
	db, err := DB()
	if err != nil {
		return model.MarketingWorkspace{}, err
	}
	var item model.MarketingWorkspace
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&item, "id = ? AND owner_user_id = ?", id, userID).Error; err != nil {
			return err
		}
		item.Brands = make([]model.MarketingBrand, 0)
		item.Locations = make([]model.MarketingLocation, 0)
		item.Offerings = make([]model.MarketingOffering, 0)
		item.Listings = make([]model.MarketingLocationOffering, 0)
		if err := tx.Where("workspace_id = ?", id).Order("id asc").Find(&item.Brands).Error; err != nil {
			return err
		}
		if err := tx.Where("workspace_id = ?", id).Order("id asc").Find(&item.Locations).Error; err != nil {
			return err
		}
		if err := tx.Where("workspace_id = ?", id).Order("id asc").Find(&item.Offerings).Error; err != nil {
			return err
		}
		return tx.Where("workspace_id = ?", id).Order("location_id asc, offering_id asc").Find(&item.Listings).Error
	})
	return item, err
}

func SaveMarketingWorkspace(item model.MarketingWorkspace, expectedRevision int64) (model.MarketingWorkspace, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := lockUserConfig(tx, item.OwnerUserID); err != nil {
			return err
		}
		var config model.UserConfig
		if err := tx.First(&config, "user_id = ?", item.OwnerUserID).Error; err != nil {
			return err
		}
		var assetData struct {
			Assets []struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
				Data struct {
					StorageKey string `json:"storageKey"`
				} `json:"data"`
			} `json:"assets"`
		}
		if strings.TrimSpace(config.AssetData) != "" {
			if err := json.Unmarshal([]byte(config.AssetData), &assetData); err != nil {
				return err
			}
		}
		available := make(map[string]string)
		for _, asset := range assetData.Assets {
			if asset.Kind == "image" {
				available[asset.ID] = asset.Data.StorageKey
			}
		}
		serverIDs := make([]string, 0)
		seenServerIDs := make(map[string]bool)
		for _, ref := range marketingAssetReferences(item) {
			key := available[ref.AssetID]
			if !strings.HasPrefix(key, "server:") {
				return errors.New("营销图片尚未保存到账号云存储")
			}
			if strings.HasPrefix(key, "server:webdav:") {
				continue
			}
			id := strings.TrimPrefix(key, "server:")
			if id != "" && !seenServerIDs[id] {
				seenServerIDs[id] = true
				serverIDs = append(serverIDs, id)
			}
		}
		if len(serverIDs) > 0 {
			var owned int64
			// 游客匿名上传的对象没有账号归属，但本就按公开内容提供，允许接管后直接引用。
			if err := tx.Model(&model.StorageObject{}).Where("id IN ? AND (created_by = ? OR created_by = ?) AND deleted_at = ? AND mime_type LIKE ?", serverIDs, item.OwnerUserID, "anonymous", "", "image/%").Count(&owned).Error; err != nil {
				return err
			}
			if owned != int64(len(serverIDs)) {
				return errors.New("营销图片不属于当前账号或不是图片")
			}
		}
		if expectedRevision == 0 {
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		} else {
			var current model.MarketingWorkspace
			if err := tx.First(&current, "id = ? AND owner_user_id = ?", item.ID, item.OwnerUserID).Error; err != nil {
				return err
			}
			if current.Revision != expectedRevision {
				return ErrMarketingRevision
			}
			item.CreatedAt = current.CreatedAt
			result := tx.Model(&model.MarketingWorkspace{}).Where("id = ? AND owner_user_id = ? AND revision = ?", item.ID, item.OwnerUserID, expectedRevision).Select("name", "industry", "revision", "description", "audience", "guidance", "forbidden", "facts", "assets", "updated_at").Updates(&item)
			if result.Error != nil {
				return result.Error
			}
		}
		if err := deleteMarketingChildren(tx, item.ID); err != nil {
			return err
		}
		if len(item.Brands) > 0 {
			if err := tx.Create(&item.Brands).Error; err != nil {
				return err
			}
		}
		if len(item.Locations) > 0 {
			if err := tx.Create(&item.Locations).Error; err != nil {
				return err
			}
		}
		if len(item.Offerings) > 0 {
			if err := tx.Create(&item.Offerings).Error; err != nil {
				return err
			}
		}
		if len(item.Listings) > 0 {
			if err := tx.Create(&item.Listings).Error; err != nil {
				return err
			}
		}
		return replaceMarketingAssetReferences(tx, item)
	})
	return item, err
}

func DeleteMarketingWorkspace(userID, id string, revision int64) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := lockUserConfig(tx, userID); err != nil {
			return err
		}
		result := tx.Where("id = ? AND owner_user_id = ? AND revision = ?", id, userID, revision).Delete(&model.MarketingWorkspace{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrMarketingRevision
		}
		if err := deleteMarketingChildren(tx, id); err != nil {
			return err
		}
		return tx.Where("owner_user_id = ? AND workspace_id = ?", userID, id).Delete(&model.MarketingAssetReferenceRecord{}).Error
	})
}

func deleteMarketingChildren(tx *gorm.DB, id string) error {
	for _, table := range []any{&model.MarketingLocationOffering{}, &model.MarketingOffering{}, &model.MarketingLocation{}, &model.MarketingBrand{}} {
		if err := tx.Where("workspace_id = ?", id).Delete(table).Error; err != nil {
			return err
		}
	}
	return nil
}

func lockUserConfig(tx *gorm.DB, userID string) error {
	current := userConfigTimestamp()
	placeholder := model.UserConfig{UserID: userID, CreatedAt: current, UpdatedAt: current}
	if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, DoNothing: true}).Create(&placeholder).Error; err != nil {
		return err
	}
	var config model.UserConfig
	return tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&config, "user_id = ?", userID).Error
}

func replaceMarketingAssetReferences(tx *gorm.DB, item model.MarketingWorkspace) error {
	if err := tx.Where("owner_user_id = ? AND workspace_id = ?", item.OwnerUserID, item.ID).Delete(&model.MarketingAssetReferenceRecord{}).Error; err != nil {
		return err
	}
	records := make([]model.MarketingAssetReferenceRecord, 0)
	appendDetails := func(entityID string, details model.MarketingDetails) {
		for _, ref := range details.Assets {
			records = append(records, model.MarketingAssetReferenceRecord{ID: uuid.NewString(), OwnerUserID: item.OwnerUserID, WorkspaceID: item.ID, EntityID: entityID, AssetID: ref.AssetID, Role: ref.Role})
		}
	}
	appendDetails(item.ID, item.MarketingDetails)
	for _, entity := range item.Brands {
		appendDetails(entity.ID, entity.MarketingDetails)
	}
	for _, entity := range item.Locations {
		appendDetails(entity.ID, entity.MarketingDetails)
	}
	for _, entity := range item.Offerings {
		appendDetails(entity.ID, entity.MarketingDetails)
	}
	if len(records) == 0 {
		return nil
	}
	return tx.Create(&records).Error
}

func marketingAssetReferences(item model.MarketingWorkspace) []model.MarketingAssetReference {
	refs := append([]model.MarketingAssetReference{}, item.Assets...)
	for _, brand := range item.Brands {
		refs = append(refs, brand.Assets...)
	}
	for _, location := range item.Locations {
		refs = append(refs, location.Assets...)
	}
	for _, offering := range item.Offerings {
		refs = append(refs, offering.Assets...)
	}
	return refs
}

func MarketingReferencedAssetIDs(userID string) ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var ids []string
	err = db.Model(&model.MarketingAssetReferenceRecord{}).Where("owner_user_id = ?", userID).Distinct().Order("asset_id asc").Pluck("asset_id", &ids).Error
	return ids, err
}
