package service

import (
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
