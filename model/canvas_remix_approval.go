package model

import "time"

type CanvasRemixApproval struct {
	ID              string    `json:"id" gorm:"primaryKey"`
	UserID          string    `json:"userId" gorm:"index:idx_canvas_remix_approvals_user_run,priority:1"`
	RunID           string    `json:"runId" gorm:"index:idx_canvas_remix_approvals_user_run,priority:2"`
	ApprovalKey     string    `json:"approvalKey" gorm:"type:text"`
	SourceSignature string    `json:"sourceSignature"`
	MarketingKey    string    `json:"marketingKey,omitempty"`
	CoreVersion     string    `json:"coreVersion"`
	Skills          string    `json:"skills" gorm:"type:text"`
	CreatedAt       time.Time `json:"createdAt"`
	ExpiresAt       time.Time `json:"expiresAt" gorm:"index"`
}

type CanvasRemixApprovalSlot struct {
	ID             string    `json:"id" gorm:"primaryKey"`
	ApprovalID     string    `json:"approvalId" gorm:"uniqueIndex:idx_canvas_remix_approval_slots_approval_node,priority:1"`
	UserID         string    `json:"userId" gorm:"index"`
	RunID          string    `json:"runId" gorm:"index"`
	NodeID         string    `json:"nodeId" gorm:"uniqueIndex:idx_canvas_remix_approval_slots_approval_node,priority:2"`
	Model          string    `json:"model"`
	Prompt         string    `json:"prompt" gorm:"type:text"`
	RequestHash    string    `json:"requestHash" gorm:"index"`
	ConsumedByTask string    `json:"consumedByTask,omitempty" gorm:"index"`
	CreatedAt      time.Time `json:"createdAt"`
}
