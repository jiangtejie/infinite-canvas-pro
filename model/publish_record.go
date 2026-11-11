package model

// PublishRecord 一次发布签发记录。只保存发布快照、二维码和结果，不保存密钥。
type PublishRecord struct {
	ID           string `json:"id" gorm:"size:64;primaryKey"`
	UserID       string `json:"userId" gorm:"size:64;index"`
	Channel      string `json:"channel" gorm:"size:32;index"`
	Status       string `json:"status" gorm:"size:32;index"`
	Title        string `json:"title"`
	Package      string `json:"package"`
	Preflight    string `json:"preflight"`
	QRText       string `json:"qrText"`
	Mock         bool   `json:"mock"`
	ExpiresAt    string `json:"expiresAt"`
	PublishedURL string `json:"publishedUrl"`
	Source       string `json:"source" gorm:"size:32;index"`
	SourceID     string `json:"sourceId" gorm:"size:191;index"`
	NodeID       string `json:"nodeId" gorm:"size:191;index"`
	CreatedAt    string `json:"createdAt" gorm:"size:32;index"`
	UpdatedAt    string `json:"updatedAt" gorm:"size:32"`
}
