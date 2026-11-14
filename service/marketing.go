package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"gorm.io/gorm"
)

type marketingError string

func (e marketingError) Error() string       { return string(e) }
func (e marketingError) SafeMessage() string { return string(e) }

func marketingUser(ctx context.Context) (string, error) {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" {
		return "", marketingError("请先登录")
	}
	return user.ID, nil
}

func ListMarketingWorkspaces(ctx context.Context, q model.Query) (model.MarketingWorkspaceList, error) {
	userID, err := marketingUser(ctx)
	if err != nil {
		return model.MarketingWorkspaceList{}, err
	}
	return repository.ListMarketingWorkspaces(userID, q)
}

func CurrentMarketingWorkspace(ctx context.Context, id string) (model.MarketingWorkspace, error) {
	userID, err := marketingUser(ctx)
	if err != nil {
		return model.MarketingWorkspace{}, err
	}
	item, err := repository.GetMarketingWorkspace(userID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = marketingError("营销资料不存在或无权访问")
	}
	return item, err
}

func SaveMarketingWorkspace(ctx context.Context, item model.MarketingWorkspace) (model.MarketingWorkspace, error) {
	userID, err := marketingUser(ctx)
	if err != nil {
		return item, err
	}
	if err := normalizeMarketingWorkspace(&item); err != nil {
		return item, err
	}
	assets, err := CurrentUserAssetData(ctx)
	if err != nil {
		return item, err
	}
	var data struct {
		Assets []struct {
			ID   string `json:"id"`
			Kind string `json:"kind"`
		} `json:"assets"`
	}
	if err := json.Unmarshal(assets, &data); err != nil {
		return item, err
	}
	available := make(map[string]bool)
	for _, asset := range data.Assets {
		if asset.Kind == "image" {
			available[asset.ID] = true
		}
	}
	expected := item.Revision
	current := now()
	if expected == 0 {
		if item.ID == "" {
			item.ID = newID("marketing")
		}
		item.CreatedAt = current
	} else {
		existing, err := CurrentMarketingWorkspace(ctx, item.ID)
		if err != nil {
			return item, err
		}
		item.CreatedAt = existing.CreatedAt
	}
	item.OwnerUserID = userID
	item.Revision = expected + 1
	item.UpdatedAt = current
	for i := range item.Brands {
		item.Brands[i].WorkspaceID = item.ID
	}
	for i := range item.Locations {
		item.Locations[i].WorkspaceID = item.ID
	}
	for i := range item.Offerings {
		item.Offerings[i].WorkspaceID = item.ID
	}
	for i := range item.Listings {
		item.Listings[i].WorkspaceID = item.ID
	}
	item, err = repository.SaveMarketingWorkspace(item, expected)
	if errors.Is(err, repository.ErrMarketingRevision) {
		err = marketingError("资料已在其他页面更新，请刷新后重新编辑")
	}
	return item, err
}

func DeleteMarketingWorkspace(ctx context.Context, id string, revision int64) error {
	userID, err := marketingUser(ctx)
	if err != nil {
		return err
	}
	if _, err := CurrentMarketingWorkspace(ctx, id); err != nil {
		return err
	}
	if revision < 1 {
		return marketingError("请刷新资料后再删除")
	}
	err = repository.DeleteMarketingWorkspace(userID, id, revision)
	if errors.Is(err, repository.ErrMarketingRevision) {
		return marketingError("资料已在其他页面更新，请刷新后再删除")
	}
	return err
}

func CurrentMarketingAssetReferences(ctx context.Context) ([]string, error) {
	userID, err := marketingUser(ctx)
	if err != nil {
		return nil, err
	}
	return repository.MarketingReferencedAssetIDs(userID)
}

func marketingAssetReferences(item model.MarketingWorkspace) []model.MarketingAssetReference {
	refs := append([]model.MarketingAssetReference{}, item.Assets...)
	for _, child := range item.Brands {
		refs = append(refs, child.Assets...)
	}
	for _, child := range item.Locations {
		refs = append(refs, child.Assets...)
	}
	for _, child := range item.Offerings {
		refs = append(refs, child.Assets...)
	}
	return refs
}

func normalizeMarketingWorkspace(item *model.MarketingWorkspace) error {
	if item.Brands == nil {
		item.Brands = []model.MarketingBrand{}
	}
	if item.Locations == nil {
		item.Locations = []model.MarketingLocation{}
	}
	if item.Offerings == nil {
		item.Offerings = []model.MarketingOffering{}
	}
	if item.Listings == nil {
		item.Listings = []model.MarketingLocationOffering{}
	}
	normalizeDetails := func(details *model.MarketingDetails) {
		if details.Forbidden == nil {
			details.Forbidden = []string{}
		}
		if details.Facts == nil {
			details.Facts = []model.MarketingFact{}
		}
		if details.Assets == nil {
			details.Assets = []model.MarketingAssetReference{}
		}
	}
	normalizeDetails(&item.MarketingDetails)
	for i := range item.Brands {
		normalizeDetails(&item.Brands[i].MarketingDetails)
	}
	for i := range item.Locations {
		normalizeDetails(&item.Locations[i].MarketingDetails)
	}
	for i := range item.Offerings {
		normalizeDetails(&item.Offerings[i].MarketingDetails)
	}
	for i := range item.Listings {
		if item.Listings[i].Facts == nil {
			item.Listings[i].Facts = []model.MarketingFact{}
		}
	}
	item.Name = strings.TrimSpace(item.Name)
	item.Industry = strings.TrimSpace(item.Industry)
	if item.Name == "" || utf8.RuneCountInString(item.Name) > 100 {
		return marketingError("资料空间名称须为 1–100 字")
	}
	if item.Revision < 0 || (item.Revision > 0 && item.ID == "") || len(item.ID) > 191 {
		return marketingError("资料版本或编号无效")
	}
	if len(item.Brands) > 100 || len(item.Locations) > 500 || len(item.Offerings) > 500 || len(item.Listings) > 2000 {
		return marketingError("单个资料空间的条目数量超出限制")
	}
	ids, facts := make(map[string]bool), make(map[string]bool)
	validID := func(id string) bool {
		if id == "" || len(id) > 191 || ids[id] {
			return false
		}
		ids[id] = true
		return true
	}
	checkFacts := func(values []model.MarketingFact) error {
		if len(values) > 100 {
			return marketingError("单条资料最多保存 100 项事实")
		}
		for _, fact := range values {
			if fact.ID == "" || len(fact.ID) > 191 || facts[fact.ID] || strings.TrimSpace(fact.Label) == "" || strings.TrimSpace(fact.Value) == "" {
				return marketingError("事实编号须唯一，名称与内容不能为空")
			}
			facts[fact.ID] = true
			if fact.Approved && strings.TrimSpace(fact.Source) == "" {
				return marketingError("确认营销事实前请填写依据")
			}
			if fact.ValidUntil != "" {
				if _, err := time.Parse(time.RFC3339, fact.ValidUntil); err != nil {
					return marketingError("事实有效期须为带时区的日期时间")
				}
			}
		}
		return nil
	}
	check := func(details model.MarketingDetails) error {
		if len(details.Description)+len(details.Audience)+len(details.Guidance) > 30000 || len(details.Forbidden) > 100 || len(details.Assets) > 50 {
			return marketingError("资料内容超出限制")
		}
		seen := make(map[string]bool)
		for _, ref := range details.Assets {
			if ref.AssetID == "" || ref.Role == "" || seen[ref.AssetID] {
				return marketingError("图片引用须唯一并注明用途")
			}
			seen[ref.AssetID] = true
		}
		return checkFacts(details.Facts)
	}
	if err := check(item.MarketingDetails); err != nil {
		return err
	}
	brands, locations, offerings := make(map[string]bool), make(map[string]string), make(map[string]string)
	for _, brand := range item.Brands {
		if !validID(brand.ID) || strings.TrimSpace(brand.Name) == "" {
			return marketingError("品牌编号须唯一且名称不能为空")
		}
		brands[brand.ID] = true
		if err := check(brand.MarketingDetails); err != nil {
			return err
		}
	}
	for _, location := range item.Locations {
		if !validID(location.ID) || !brands[location.BrandID] || strings.TrimSpace(location.Name) == "" {
			return marketingError("门店须属于当前空间中的品牌，且编号唯一、名称非空")
		}
		if location.Kind != "store" && location.Kind != "service" && location.Kind != "online" {
			return marketingError("门店类型无效")
		}
		locations[location.ID] = location.BrandID
		if err := check(location.MarketingDetails); err != nil {
			return err
		}
	}
	for _, offering := range item.Offerings {
		if !validID(offering.ID) || !brands[offering.BrandID] || strings.TrimSpace(offering.Name) == "" {
			return marketingError("商品/服务须属于当前空间中的品牌，且编号唯一、名称非空")
		}
		if offering.Kind != "product" && offering.Kind != "service" {
			return marketingError("商品/服务类型无效")
		}
		offerings[offering.ID] = offering.BrandID
		if err := check(offering.MarketingDetails); err != nil {
			return err
		}
	}
	pairs := make(map[string]bool)
	for _, listing := range item.Listings {
		key := listing.LocationID + ":" + listing.OfferingID
		if locations[listing.LocationID] == "" || locations[listing.LocationID] != offerings[listing.OfferingID] || pairs[key] {
			return marketingError("门店商品关联须唯一且属于同一品牌")
		}
		pairs[key] = true
		if err := checkFacts(listing.Facts); err != nil {
			return err
		}
	}
	return nil
}
