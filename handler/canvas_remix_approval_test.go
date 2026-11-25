package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func TestApproveCanvasRemixRequiresLoginAndReturnsSlots(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := repository.DB(); err != nil {
		t.Fatal(err)
	}
	body := `{"runId":"run-http","approvalRequestId":"request-http","approvalKey":"plan-http","sourceSignature":"source-http","coreVersion":"marketing-remix-1","slots":[{"nodeId":"image-http","model":"image-model","prompt":"prompt"}]}`
	request := httptest.NewRequest(http.MethodPost, "/api/v1/canvas/remix/approvals", strings.NewReader(body))
	writer := httptest.NewRecorder()
	ApproveCanvasRemix(writer, request)
	if !strings.Contains(writer.Body.String(), `"code":1`) {
		t.Fatalf("anonymous approval accepted: %s", writer.Body)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/v1/canvas/remix/approvals", strings.NewReader(body))
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "remix-http-user"}))
	writer = httptest.NewRecorder()
	ApproveCanvasRemix(writer, request)
	var result struct {
		Code int `json:"code"`
		Data struct {
			ID    string `json:"id"`
			Slots []struct {
				ID string `json:"id"`
			} `json:"slots"`
		} `json:"data"`
	}
	if err := json.Unmarshal(writer.Body.Bytes(), &result); err != nil || result.Code != 0 || result.Data.ID == "" || len(result.Data.Slots) != 1 || result.Data.Slots[0].ID == "" {
		t.Fatalf("approval response: %s err=%v", writer.Body, err)
	}
}
