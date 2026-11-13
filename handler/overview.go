package handler

import (
	"net/http"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func AdminOverview(w http.ResponseWriter, _ *http.Request) {
	overview, err := service.AdminOverview()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, overview)
}
