package model

type MarketingFact struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Subject    string `json:"subject"`
	Value      string `json:"value"`
	Source     string `json:"source"`
	Approved   bool   `json:"approved"`
	ValidUntil string `json:"validUntil"`
}

type MarketingAssetReference struct {
	AssetID    string `json:"assetId"`
	StorageKey string `json:"storageKey"`
	Role       string `json:"role"`
}

type MarketingDetails struct {
	Description string                    `json:"description"`
	Audience    string                    `json:"audience"`
	Guidance    string                    `json:"guidance"`
	Forbidden   []string                  `json:"forbidden" gorm:"serializer:json"`
	Facts       []MarketingFact           `json:"facts" gorm:"serializer:json"`
	Assets      []MarketingAssetReference `json:"assets" gorm:"serializer:json"`
}

type MarketingWorkspace struct {
	ID          string `json:"id" gorm:"primaryKey;size:48"`
	OwnerUserID string `json:"ownerUserId" gorm:"index;size:191"`
	Name        string `json:"name"`
	Industry    string `json:"industry"`
	Revision    int64  `json:"revision"`
	MarketingDetails
	CreatedAt string                      `json:"createdAt"`
	UpdatedAt string                      `json:"updatedAt"`
	Brands    []MarketingBrand            `json:"brands" gorm:"-"`
	Locations []MarketingLocation         `json:"locations" gorm:"-"`
	Offerings []MarketingOffering         `json:"offerings" gorm:"-"`
	Listings  []MarketingLocationOffering `json:"listings" gorm:"-"`
}

type MarketingBrand struct {
	WorkspaceID string `json:"workspaceId" gorm:"primaryKey;size:48"`
	ID          string `json:"id" gorm:"primaryKey;size:48"`
	Name        string `json:"name"`
	MarketingDetails
}

type MarketingLocation struct {
	WorkspaceID  string `json:"workspaceId" gorm:"primaryKey;size:48"`
	ID           string `json:"id" gorm:"primaryKey;size:48"`
	BrandID      string `json:"brandId"`
	Name         string `json:"name"`
	Kind         string `json:"kind"`
	City         string `json:"city"`
	District     string `json:"district"`
	Address      string `json:"address"`
	LocalContext string `json:"localContext"`
	MarketingDetails
}

type MarketingOffering struct {
	WorkspaceID string `json:"workspaceId" gorm:"primaryKey;size:48"`
	ID          string `json:"id" gorm:"primaryKey;size:48"`
	BrandID     string `json:"brandId"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Category    string `json:"category"`
	MarketingDetails
}

type MarketingLocationOffering struct {
	WorkspaceID string          `json:"workspaceId" gorm:"primaryKey;size:48"`
	LocationID  string          `json:"locationId" gorm:"primaryKey;size:48"`
	OfferingID  string          `json:"offeringId" gorm:"primaryKey;size:48"`
	Available   bool            `json:"available"`
	Highlights  string          `json:"highlights"`
	Facts       []MarketingFact `json:"facts" gorm:"serializer:json"`
}

type MarketingAssetReferenceRecord struct {
	ID          string `json:"id" gorm:"primaryKey;size:48"`
	OwnerUserID string `json:"ownerUserId" gorm:"index;size:191"`
	WorkspaceID string `json:"workspaceId" gorm:"index;size:191"`
	EntityID    string `json:"entityId" gorm:"size:191"`
	AssetID     string `json:"assetId" gorm:"index;size:191"`
	Role        string `json:"role"`
}

type MarketingWorkspaceSummary struct {
	ID          string `json:"id" gorm:"primaryKey;size:48"`
	OwnerUserID string `json:"ownerUserId" gorm:"index;size:191"`
	Name        string `json:"name"`
	Industry    string `json:"industry"`
	Revision    int64  `json:"revision"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type MarketingWorkspaceList struct {
	Items []MarketingWorkspaceSummary `json:"items"`
	Total int64                       `json:"total"`
}
