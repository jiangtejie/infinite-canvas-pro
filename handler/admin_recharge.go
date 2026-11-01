package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func AdminRechargePackages(w http.ResponseWriter, r *http.Request) {
	items, err := service.ListAdminRechargePackages()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func AdminSaveRechargePackage(w http.ResponseWriter, r *http.Request) {
	var input service.RechargePackageInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	item, err := service.SaveRechargePackage(input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func AdminDeleteRechargePackage(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteRechargePackage(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
