package service

import (
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

func EnsureDefaultRechargePackages() error {
	now := time.Now().Format(time.RFC3339)
	return repository.SeedRechargePackages([]model.RechargePackage{
		{ID: "credits-100", Name: "基础包", AmountFen: 1000, Credits: 100, Bonus: 0, Sort: 1, Enabled: true, CreatedAt: now, UpdatedAt: now},
		{ID: "credits-500", Name: "进阶包", AmountFen: 4500, Credits: 500, Bonus: 50, Sort: 2, Enabled: true, CreatedAt: now, UpdatedAt: now},
		{ID: "credits-1000", Name: "专业包", AmountFen: 8000, Credits: 1000, Bonus: 200, Sort: 3, Enabled: true, CreatedAt: now, UpdatedAt: now},
	})
}

// RechargePackageInput 后台维护充值套餐时的入参。
type RechargePackageInput struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	AmountFen int     `json:"amountFen"`
	Credits   float64 `json:"credits"`
	Bonus     float64 `json:"bonus"`
	Sort      int     `json:"sort"`
	Enabled   bool    `json:"enabled"`
}

func ListAdminRechargePackages() ([]model.RechargePackage, error) {
	return repository.ListAllRechargePackages()
}

func SaveRechargePackage(input RechargePackageInput) (model.RechargePackage, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return model.RechargePackage{}, safeMessageError{message: "套餐名称不能为空"}
	}
	if input.AmountFen <= 0 {
		return model.RechargePackage{}, safeMessageError{message: "套餐金额必须大于 0"}
	}
	if input.Credits <= 0 {
		return model.RechargePackage{}, safeMessageError{message: "到账算力点必须大于 0"}
	}
	if input.Bonus < 0 {
		return model.RechargePackage{}, safeMessageError{message: "赠送算力点不能为负数"}
	}

	now := time.Now().Format(time.RFC3339)
	item := model.RechargePackage{
		ID:        strings.TrimSpace(input.ID),
		Name:      name,
		AmountFen: input.AmountFen,
		Credits:   input.Credits,
		Bonus:     input.Bonus,
		Sort:      input.Sort,
		Enabled:   input.Enabled,
		UpdatedAt: now,
	}
	existing, ok, err := repository.GetAnyRechargePackage(item.ID)
	if err != nil {
		return model.RechargePackage{}, err
	}
	if ok {
		item.CreatedAt = existing.CreatedAt
	} else {
		if item.ID == "" {
			item.ID = newID("pkg")
		}
		item.CreatedAt = now
	}
	if err := repository.SaveRechargePackage(&item); err != nil {
		return model.RechargePackage{}, err
	}
	return item, nil
}

func DeleteRechargePackage(id string) error {
	ok, err := repository.DeleteRechargePackage(id)
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "套餐不存在"}
	}
	return nil
}
