package service

import (
	"errors"
	"strings"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"golang.org/x/crypto/bcrypt"
)

func UpdateCurrentUser(userID, displayName, avatarURL, email string) (model.AuthUser, error) {
	user, ok, err := repository.GetUserByID(userID)
	if err != nil {
		return model.AuthUser{}, err
	}
	if !ok {
		return model.AuthUser{}, safeMessageError{message: "用户不存在"}
	}
	user.DisplayName = strings.TrimSpace(displayName)
	user.AvatarURL = strings.TrimSpace(avatarURL)
	user.Email = strings.TrimSpace(email)
	user.UpdatedAt = now()
	user, err = repository.SaveUser(user)
	if err != nil {
		return model.AuthUser{}, err
	}
	return model.PublicUser(user), nil
}

func ChangeCurrentUserPassword(userID, oldPassword, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" || len(newPassword) < 6 {
		return safeMessageError{message: "新密码至少需要 6 位"}
	}
	user, ok, err := repository.GetUserByID(userID)
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "用户不存在"}
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(oldPassword)) != nil {
		return safeMessageError{message: "当前密码错误"}
	}
	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	user.Password = hash
	user.UpdatedAt = now()
	_, err = repository.SaveUser(user)
	return err
}

func CurrentUserCreditLogs(userID string, q model.Query) (model.CreditLogList, error) {
	items, total, err := repository.ListUserCreditLogs(userID, q)
	return model.CreditLogList{Items: items, Total: int(total)}, err
}

func CurrentUserRechargeOrders(userID string, q model.Query) ([]model.RechargeOrder, int, error) {
	items, total, err := repository.ListRechargeOrders(userID, q)
	return items, int(total), err
}

func CreateInvoiceRequest(userID, orderNo, title, taxNumber, email string) (model.InvoiceRequest, error) {
	if strings.TrimSpace(orderNo) == "" || strings.TrimSpace(title) == "" || strings.TrimSpace(email) == "" {
		return model.InvoiceRequest{}, errors.New("订单、发票抬头和邮箱不能为空")
	}
	order, ok, err := repository.GetRechargeOrderByNo(strings.TrimSpace(orderNo))
	if err != nil {
		return model.InvoiceRequest{}, err
	}
	if !ok || order.UserID != userID || order.Status != model.RechargeOrderPaid {
		return model.InvoiceRequest{}, safeMessageError{message: "仅支持已支付的本人订单开票"}
	}
	item := model.InvoiceRequest{ID: newID("invoice"), UserID: userID, OrderNo: strings.TrimSpace(orderNo), Title: strings.TrimSpace(title), TaxNumber: strings.TrimSpace(taxNumber), Email: strings.TrimSpace(email), Status: "pending", CreatedAt: now()}
	return item, repository.SaveInvoiceRequest(&item)
}

func CurrentUserInvoices(userID string) ([]model.InvoiceRequest, error) {
	return repository.ListInvoiceRequests(userID)
}
