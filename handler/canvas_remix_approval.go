package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func ApproveCanvasRemix(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.CanvasRemixApprovalInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		Fail(w, "复刻审批参数无效")
		return
	}
	input.UserID = user.ID
	approval, slots, err := service.ApproveCanvasRemix(input)
	if err != nil {
		Fail(w, err.Error())
		return
	}
	OK(w, map[string]any{
		"id":              approval.ID,
		"requestId":       input.ApprovalRequestID,
		"runId":           approval.RunID,
		"approvalKey":     approval.ApprovalKey,
		"sourceSignature": approval.SourceSignature,
		"marketingKey":    approval.MarketingKey,
		"coreVersion":     approval.CoreVersion,
		"expiresAt":       approval.ExpiresAt,
		"slots":           slots,
	})
}
