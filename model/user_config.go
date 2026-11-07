package model

// UserConfig 用户配置和同步数据。
type UserConfig struct {
	UserID          string `json:"userId" gorm:"primaryKey"`
	ModelConfig     string `json:"modelConfig" gorm:"size:134217728"`
	StorageProvider string `json:"storageProvider"`
	ImageHistory    string `json:"imageHistory"`
	AssetData       string `json:"assetData"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}
