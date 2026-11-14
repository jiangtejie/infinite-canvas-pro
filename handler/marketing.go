package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func MarketingWorkspaces(w http.ResponseWriter, r *http.Request) {
	items, err := service.ListMarketingWorkspaces(r.Context(), parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func MarketingWorkspace(w http.ResponseWriter, r *http.Request, id string) {
	item, err := service.CurrentMarketingWorkspace(r.Context(), id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func SaveMarketingWorkspace(w http.ResponseWriter, r *http.Request) {
	var input model.MarketingWorkspace
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		Fail(w, "营销资料格式错误或内容过大")
		return
	}
	item, err := service.SaveMarketingWorkspace(r.Context(), input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func DeleteMarketingWorkspace(w http.ResponseWriter, r *http.Request, id string) {
	revision, _ := strconv.ParseInt(r.URL.Query().Get("revision"), 10, 64)
	if err := service.DeleteMarketingWorkspace(r.Context(), id, revision); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func MarketingAssetReferences(w http.ResponseWriter, r *http.Request) {
	ids, err := service.CurrentMarketingAssetReferences(r.Context())
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, ids)
}
