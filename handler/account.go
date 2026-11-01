package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

type profileRequest struct {
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl"`
	Email       string `json:"email"`
}
type passwordRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}
type invoiceRequest struct {
	OrderNo   string `json:"orderNo"`
	Title     string `json:"title"`
	TaxNumber string `json:"taxNumber"`
	Email     string `json:"email"`
}
type rechargeRequest struct {
	PackageID string `json:"packageId"`
}
type listResponse struct {
	Items any `json:"items"`
	Total int `json:"total"`
}

func CurrentProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	OK(w, user)
}
func UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var req profileRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		Fail(w, "请求参数无效")
		return
	}
	result, err := service.UpdateCurrentUser(user.ID, req.DisplayName, req.AvatarURL, req.Email)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
func ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var req passwordRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		Fail(w, "请求参数无效")
		return
	}
	if err := service.ChangeCurrentUserPassword(user.ID, req.OldPassword, req.NewPassword); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
func UserCreditLogs(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	result, err := service.CurrentUserCreditLogs(user.ID, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
func RechargePackages(w http.ResponseWriter, r *http.Request) {
	items, err := service.RechargePackages()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}
func CreateRecharge(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var req rechargeRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		Fail(w, "请求参数无效")
		return
	}
	order, err := service.CreateNativeRecharge(user.ID, req.PackageID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, order)
}
func GetRecharge(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	order, err := service.QueryNativeRecharge(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, order)
}
func RechargeOrders(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	items, total, err := service.CurrentUserRechargeOrders(user.ID, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, listResponse{Items: items, Total: total})
}
func CreateInvoice(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	var req invoiceRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		Fail(w, "请求参数无效")
		return
	}
	item, err := service.CreateInvoiceRequest(user.ID, req.OrderNo, req.Title, req.TaxNumber, req.Email)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}
func UserInvoices(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录")
		return
	}
	items, err := service.CurrentUserInvoices(user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}
func PaymentNotify(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil || service.ProcessPaymentNotify(body, r.Header) != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":"FAIL","message":"通知处理失败"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"code":"SUCCESS","message":"成功"}`))
}
