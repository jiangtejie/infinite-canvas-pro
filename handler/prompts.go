package handler

import (
	"net/http"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func Prompts(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListPrompts(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
