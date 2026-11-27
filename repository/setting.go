package repository

import (
	"encoding/json"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetSettings 返回 public 和 private 两行配置。
func GetSettings() (model.Settings, error) {
	db, err := DB()
	if err != nil {
		return model.Settings{}, err
	}
	var items []model.Setting
	if err := db.Find(&items).Error; err != nil {
		return model.Settings{}, err
	}
	result := model.Settings{}
	for _, item := range items {
		var decodeErr error
		switch item.Key {
		case model.SettingKeyPrivate:
			decodeErr = json.Unmarshal(item.Value, &result.Private)
		case model.SettingKeyPublic:
			decodeErr = json.Unmarshal(item.Value, &result.Public)
		}
		if decodeErr != nil {
			log.Printf("decode settings failed key=%s err=%v", item.Key, decodeErr)
		}
	}
	return result, nil
}

// SaveSettings 保存 public 和 private 两行配置。
func SaveSettings(settings model.Settings, now string) (model.Settings, error) {
	db, err := DB()
	if err != nil {
		return settings, err
	}
	publicValue, _ := json.Marshal(settings.Public)
	privateValue, _ := json.Marshal(settings.Private)
	items := []model.Setting{
		{Key: model.SettingKeyPublic, Value: publicValue, CreatedAt: now, UpdatedAt: now},
		{Key: model.SettingKeyPrivate, Value: privateValue, CreatedAt: now, UpdatedAt: now},
	}
	err = db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&items).Error
	InvalidatePrivateStorageCache()
	return settings, err
}

const privateStorageCacheTTL = 30 * time.Second

var privateStorageCache struct {
	sync.Mutex
	loaded   bool
	expireAt time.Time
	setting  model.PrivateStorageSetting
}

// GetPrivateStorageSetting 只解析私有配置里的存储段并做短时缓存。
// 媒体下载是热路径，不需要为此反序列化全部渠道与工作流配置。
func GetPrivateStorageSetting() model.PrivateStorageSetting {
	nowTime := time.Now()
	privateStorageCache.Lock()
	if privateStorageCache.loaded && nowTime.Before(privateStorageCache.expireAt) {
		setting := privateStorageCache.setting
		setting.Providers = append([]model.StorageProvider(nil), setting.Providers...)
		privateStorageCache.Unlock()
		return setting
	}
	privateStorageCache.Unlock()

	setting, err := readPrivateStorageSetting()
	if err != nil {
		// 读取失败不写缓存，避免一次数据库抖动让媒体下载连续失败 30 秒。
		log.Printf("load private storage setting failed err=%v", err)
		return model.PrivateStorageSetting{}
	}
	privateStorageCache.Lock()
	privateStorageCache.loaded = true
	privateStorageCache.expireAt = nowTime.Add(privateStorageCacheTTL)
	privateStorageCache.setting = setting
	privateStorageCache.Unlock()
	setting.Providers = append([]model.StorageProvider(nil), setting.Providers...)
	return setting
}

// InvalidatePrivateStorageCache 清空存储配置缓存；保存系统配置后调用。
func InvalidatePrivateStorageCache() {
	privateStorageCache.Lock()
	defer privateStorageCache.Unlock()
	privateStorageCache.loaded = false
}

func readPrivateStorageSetting() (model.PrivateStorageSetting, error) {
	db, err := DB()
	if err != nil {
		return model.PrivateStorageSetting{}, err
	}
	var item model.Setting
	if err := db.Where("key = ?", model.SettingKeyPrivate).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.PrivateStorageSetting{}, nil
		}
		return model.PrivateStorageSetting{}, err
	}
	var partial struct {
		Storage model.PrivateStorageSetting `json:"storage"`
	}
	if err := json.Unmarshal(item.Value, &partial); err != nil {
		return model.PrivateStorageSetting{}, err
	}
	return partial.Storage, nil
}
