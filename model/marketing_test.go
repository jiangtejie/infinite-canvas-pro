package model

import (
	"encoding/json"
	"testing"
)

func TestMarketingAssetReferenceJSONHasOnlyIdentityAndRole(t *testing.T) {
	raw := []byte(`{"assetId":"asset-1","role":"招牌菜主图"}`)
	var ref MarketingAssetReference
	if err := json.Unmarshal(raw, &ref); err != nil {
		t.Fatal(err)
	}
	if ref.AssetID != "asset-1" || ref.Role != "招牌菜主图" {
		t.Fatalf("unexpected reference: %#v", ref)
	}
	encoded, err := json.Marshal(ref)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"assetId":"asset-1","role":"招牌菜主图"}` {
		t.Fatalf("storage key leaked into marketing reference: %s", encoded)
	}
}
