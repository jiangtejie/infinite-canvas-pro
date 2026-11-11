package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

// ParseContentSource 解析外部平台作品链接（当前支持抖音图文/视频）。
func ParseContentSource(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Input    string `json:"input"`
		Platform string `json:"platform"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	result, err := service.ParseContentSource(r.Context(), request.Input, request.Platform)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
