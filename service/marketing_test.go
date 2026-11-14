package service

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"gorm.io/gorm"
)

var marketingDBTestLock sync.Mutex

func setupMarketingServiceDB(t *testing.T) {
	t.Helper()
	marketingDBTestLock.Lock()
	t.Cleanup(marketingDBTestLock.Unlock)
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []any{&model.MarketingAssetReferenceRecord{}, &model.MarketingLocationOffering{}, &model.MarketingOffering{}, &model.MarketingLocation{}, &model.MarketingBrand{}, &model.MarketingWorkspace{}, &model.StorageObject{}, &model.UserConfig{}} {
		if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(table).Error; err != nil {
			t.Fatal(err)
		}
	}
}

func marketingContext(id string) context.Context {
	return WithUser(context.Background(), model.AuthUser{ID: id})
}
func validMarketingWorkspace() model.MarketingWorkspace {
	return model.MarketingWorkspace{Name: "直营餐饮", Industry: "餐饮", Brands: []model.MarketingBrand{{ID: "brand-1", Name: "好味道"}}, Locations: []model.MarketingLocation{{ID: "store-1", BrandID: "brand-1", Name: "西湖店", Kind: "store", City: "杭州", LocalContext: "附近写字楼午休客群"}}, Offerings: []model.MarketingOffering{{ID: "dish-1", BrandID: "brand-1", Name: "招牌饭", Kind: "product"}}, Listings: []model.MarketingLocationOffering{{LocationID: "store-1", OfferingID: "dish-1", Available: true, Highlights: "午市主推", Facts: []model.MarketingFact{}}}}
}

func TestMarketingWorkspaceOwnerIsolationAndRevision(t *testing.T) {
	setupMarketingServiceDB(t)
	first, err := SaveMarketingWorkspace(marketingContext("owner-a"), validMarketingWorkspace())
	if err != nil {
		t.Fatal(err)
	}
	if first.Revision != 1 || first.ID == "" {
		t.Fatalf("unexpected created workspace: %#v", first)
	}
	if _, err := CurrentMarketingWorkspace(marketingContext("owner-b"), first.ID); err == nil {
		t.Fatal("other owner read workspace")
	}
	if _, err := SaveMarketingWorkspace(marketingContext("owner-b"), model.MarketingWorkspace{ID: first.ID, Revision: first.Revision, Name: "stolen"}); err == nil {
		t.Fatal("other owner modified workspace")
	}
	first.Name = "更新后"
	updated, err := SaveMarketingWorkspace(marketingContext("owner-a"), first)
	if err != nil || updated.Revision != 2 {
		t.Fatalf("save: revision=%d err=%v", updated.Revision, err)
	}
	first.Name = "stale write"
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), first); err == nil {
		t.Fatal("stale revision overwrote current workspace")
	}
	result, err := ListMarketingWorkspaces(marketingContext("owner-b"), model.Query{})
	if err != nil || len(result.Items) != 0 {
		t.Fatalf("other owner's list leaked: %#v err=%v", result, err)
	}
}

func TestMarketingWorkspaceRejectsInvalidRelationshipsAndUntrustedFacts(t *testing.T) {
	setupMarketingServiceDB(t)
	item := validMarketingWorkspace()
	item.Brands[0].Facts = []model.MarketingFact{{ID: "price", Label: "价格", Value: "38 元", Approved: true}}
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), item); err == nil {
		t.Fatal("approved fact without evidence was accepted")
	}
	item = validMarketingWorkspace()
	item.Locations[0].BrandID = "outside-brand"
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), item); err == nil {
		t.Fatal("location with foreign brand was accepted")
	}
	item = validMarketingWorkspace()
	item.Listings = append(item.Listings, item.Listings[0])
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), item); err == nil {
		t.Fatal("duplicate location-offering edge was accepted")
	}
}

func TestMarketingWorkspaceRequiresOwnedCloudImages(t *testing.T) {
	setupMarketingServiceDB(t)
	db, _ := repository.DB()
	item := validMarketingWorkspace()
	item.Assets = []model.MarketingAssetReference{{AssetID: "asset-1", Role: "主图"}}
	saveAsset := func(storageKey string) {
		if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&model.UserConfig{}).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.UserConfig{UserID: "owner-a", AssetData: `{"assets":[{"id":"asset-1","kind":"image","data":{"storageKey":"` + storageKey + `"}}]}`}).Error; err != nil {
			t.Fatal(err)
		}
	}
	saveAsset("image:local")
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), item); err == nil {
		t.Fatal("local image reference was accepted")
	}
	saveAsset("server:missing")
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), item); err == nil {
		t.Fatal("missing cloud object was accepted")
	}
	if err := db.Create(&model.StorageObject{ID: "owned", ObjectKey: "owned.png", MimeType: "image/png", CreatedBy: "owner-a"}).Error; err != nil {
		t.Fatal(err)
	}
	saveAsset("server:owned")
	if _, err := SaveMarketingWorkspace(marketingContext("owner-a"), item); err != nil {
		t.Fatalf("owned cloud image rejected: %v", err)
	}
}

func TestMarketingWorkspaceFailedChildInsertRollsBackAggregate(t *testing.T) {
	setupMarketingServiceDB(t)
	db, _ := repository.DB()
	item := validMarketingWorkspace()
	item.ID = "workspace-rollback"
	if err := db.Callback().Create().Before("gorm:create").Register("marketing_test:fail_listing", func(tx *gorm.DB) {
		if tx.Statement.Table == "marketing_location_offerings" {
			tx.AddError(errors.New("forced listing insert failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Callback().Create().Remove("marketing_test:fail_listing") })
	if err := db.Create(&model.UserConfig{UserID: "rollback-owner", AssetData: `{"assets":[]}`}).Error; err != nil {
		t.Fatal(err)
	}
	item.OwnerUserID = "rollback-owner"
	if _, err := repository.SaveMarketingWorkspace(item, 0); err == nil {
		t.Fatal("expected listing insert failure")
	}
	var saved model.MarketingWorkspace
	if err := db.Where("id = ?", item.ID).First(&saved).Error; err == nil {
		t.Fatal("workspace row committed after child failure")
	}
}
