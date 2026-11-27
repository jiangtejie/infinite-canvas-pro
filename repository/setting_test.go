package repository

import (
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestPrivateStorageSettingCacheInvalidatesOnSave(t *testing.T) {
	setupVideoTaskDB(t)
	settings := model.Settings{}
	settings.Private.Storage.Providers = []model.StorageProvider{{ID: "p1", Type: model.StorageProviderTypeS3}}
	if _, err := SaveSettings(settings, "2026-11-27T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	first := GetPrivateStorageSetting()
	if len(first.Providers) != 1 || first.Providers[0].ID != "p1" {
		t.Fatalf("unexpected providers: %+v", first.Providers)
	}
	// 调用方改返回值不应污染缓存。
	first.Providers[0].ID = "mutated"
	if cached := GetPrivateStorageSetting(); len(cached.Providers) != 1 || cached.Providers[0].ID != "p1" {
		t.Fatalf("cache was poisoned by caller mutation: %+v", cached.Providers)
	}

	settings.Private.Storage.Providers = []model.StorageProvider{{ID: "p2", Type: model.StorageProviderTypeWebDAV}}
	if _, err := SaveSettings(settings, "2026-11-27T00:00:01Z"); err != nil {
		t.Fatal(err)
	}
	next := GetPrivateStorageSetting()
	if len(next.Providers) != 1 || next.Providers[0].ID != "p2" {
		t.Fatalf("cache was not invalidated after save: %+v", next.Providers)
	}
}
