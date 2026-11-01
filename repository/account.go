package repository

import (
	"errors"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

func ListRechargePackages() ([]model.RechargePackage, error) {
	db, err := DB(); if err != nil { return nil, err }
	var items []model.RechargePackage
	err = db.Where("enabled = ?", true).Order("sort asc, amount_fen asc").Find(&items).Error
	return items, err
}

func GetRechargePackage(id string) (model.RechargePackage, bool, error) {
	db, err := DB(); if err != nil { return model.RechargePackage{}, false, err }
	var item model.RechargePackage
	err = db.Where("id = ? AND enabled = ?", id, true).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) { return model.RechargePackage{}, false, nil }
	return item, err == nil, err
}

func SeedRechargePackages(items []model.RechargePackage) error {
	db, err := DB(); if err != nil { return err }
	for _, item := range items {
		var count int64
		if err := db.Model(&model.RechargePackage{}).Where("id = ?", item.ID).Count(&count).Error; err != nil { return err }
		if count == 0 { if err := db.Create(&item).Error; err != nil { return err } }
	}
	return nil
}

func CreateRechargeOrder(order *model.RechargeOrder) error { db, err := DB(); if err != nil { return err }; return db.Create(order).Error }
func SaveRechargeOrder(order *model.RechargeOrder) error {
	db, err := DB()
	if err != nil {
		return err
	}
	result := db.Model(&model.RechargeOrder{}).Where("id = ?", order.ID).Updates(map[string]any{"code_url": order.CodeURL, "updated_at": order.UpdatedAt})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}


func GetRechargeOrder(id string) (model.RechargeOrder, bool, error) {
	db, err := DB(); if err != nil { return model.RechargeOrder{}, false, err }
	var order model.RechargeOrder
	err = db.Where("id = ?", id).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) { return model.RechargeOrder{}, false, nil }
	return order, err == nil, err
}

func GetRechargeOrderByNo(orderNo string) (model.RechargeOrder, bool, error) {
	db, err := DB(); if err != nil { return model.RechargeOrder{}, false, err }
	var order model.RechargeOrder
	err = db.Where("order_no = ?", orderNo).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) { return model.RechargeOrder{}, false, nil }
	return order, err == nil, err
}

func ListRechargeOrders(userID string, q model.Query) ([]model.RechargeOrder, int64, error) {
	db, err := DB(); if err != nil { return nil, 0, err }; q.Normalize()
	tx := db.Model(&model.RechargeOrder{}).Where("user_id = ?", userID)
	var total int64; if err := tx.Count(&total).Error; err != nil { return nil, 0, err }
	var items []model.RechargeOrder
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

func MarkRechargeOrderPaid(orderNo, transactionID, paidAt string, amountFen int) (bool, error) {
	db, err := DB(); if err != nil { return false, err }
	var changed bool
	err = db.Transaction(func(tx *gorm.DB) error {
		var order model.RechargeOrder
		if err := tx.Where("order_no = ?", orderNo).First(&order).Error; err != nil { return err }
		if order.Status == model.RechargeOrderPaid {
			if order.AmountFen != amountFen {
				return errors.New("paid order amount mismatch")
			}
			changed = false
			return nil
		}
		if order.Status != model.RechargeOrderPending || order.AmountFen != amountFen || IsExpiredAt(order.ExpiresAt, paidAt) {
			return errors.New("payment order status, amount, or expiry mismatch")
		}
		result := tx.Model(&model.RechargeOrder{}).Where("order_no = ? AND status = ? AND amount_fen = ? AND expires_at >= ?", orderNo, model.RechargeOrderPending, amountFen, paidAt).Updates(map[string]any{"status": model.RechargeOrderPaid, "transaction_id": transactionID, "paid_at": paidAt, "updated_at": paidAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("payment order was changed or expired")
		}
		var user model.User
		if err := tx.Where("id = ?", order.UserID).First(&user).Error; err != nil { return err }
		newBalance := user.Credits + order.Credits
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserID).Updates(map[string]any{"credits": newBalance, "updated_at": paidAt}).Error; err != nil { return err }
		if err := tx.Create(&model.CreditLog{ID: "credit-" + order.ID, UserID: order.UserID, Type: model.CreditLogTypeRecharge, Amount: order.Credits, Balance: newBalance, RelatedID: orderNo, Remark: "充值订单 " + orderNo, CreatedAt: paidAt}).Error; err != nil { return err }
		changed = true; return nil
	})
	return changed, err
}

func ExpireRechargeOrder(id, now string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	result := db.Model(&model.RechargeOrder{}).Where("id = ? AND status = ? AND expires_at <= ?", id, model.RechargeOrderPending, now).Updates(map[string]any{"status": model.RechargeOrderExpired, "updated_at": now})
	return result.RowsAffected == 1, result.Error
}


func SaveInvoiceRequest(item *model.InvoiceRequest) error {
	db, err := DB()
	if err != nil {
		return err
	}
	if err := db.Create(item).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique constraint") || strings.Contains(strings.ToLower(err.Error()), "duplicate key") || strings.Contains(strings.ToLower(err.Error()), "duplicate entry") {
			return errors.New("该订单已提交开票申请")
		}
		return err
	}
	return nil
}

func ListInvoiceRequests(userID string) ([]model.InvoiceRequest, error) {
	db, err := DB(); if err != nil { return nil, err }; var items []model.InvoiceRequest
	err = db.Where("user_id = ?", userID).Order("created_at desc").Find(&items).Error; return items, err
}

func ListUserCreditLogs(userID string, q model.Query) ([]model.CreditLog, int64, error) {
	db, err := DB(); if err != nil { return nil, 0, err }; q.Normalize()
	tx := db.Model(&model.CreditLog{}).Where("user_id = ?", userID)
	if strings.TrimSpace(q.Type) != "" { tx = tx.Where("type = ?", q.Type) }
	var total int64; if err := tx.Count(&total).Error; err != nil { return nil, 0, err }
	var items []model.CreditLog; err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

func IsExpired(expiresAt string) bool { t, err := time.Parse(time.RFC3339, expiresAt); return err == nil && time.Now().After(t) }
func IsExpiredAt(expiresAt, now string) bool { expiry, err := time.Parse(time.RFC3339, expiresAt); if err != nil { return true }; current, err := time.Parse(time.RFC3339, now); return err != nil || !expiry.After(current) }
