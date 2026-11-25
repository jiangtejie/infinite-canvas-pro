package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

const canvasRemixApprovalTTL = 30 * time.Minute

type CanvasRemixApprovalSkillInput struct {
	ID   string `json:"id"`
	Hash string `json:"hash"`
}

type CanvasRemixApprovalSlotInput struct {
	NodeID string `json:"nodeId"`
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type CanvasRemixApprovalInput struct {
	UserID            string                          `json:"-"`
	RunID             string                          `json:"runId"`
	ApprovalRequestID string                          `json:"approvalRequestId"`
	ApprovalKey       string                          `json:"approvalKey"`
	SourceSignature   string                          `json:"sourceSignature"`
	MarketingKey      string                          `json:"marketingKey,omitempty"`
	CoreVersion       string                          `json:"coreVersion"`
	Skills            []CanvasRemixApprovalSkillInput `json:"skills"`
	Slots             []CanvasRemixApprovalSlotInput  `json:"slots"`
}

func ApproveCanvasRemix(input CanvasRemixApprovalInput) (model.CanvasRemixApproval, []model.CanvasRemixApprovalSlot, error) {
	input.UserID = strings.TrimSpace(input.UserID)
	input.RunID = strings.TrimSpace(input.RunID)
	input.ApprovalRequestID = strings.TrimSpace(input.ApprovalRequestID)
	input.ApprovalKey = strings.TrimSpace(input.ApprovalKey)
	input.CoreVersion = strings.TrimSpace(input.CoreVersion)
	if input.UserID == "" || input.RunID == "" || input.ApprovalRequestID == "" || input.ApprovalKey == "" || input.CoreVersion == "" || len(input.Slots) == 0 || len(input.Slots) > 60 {
		return model.CanvasRemixApproval{}, nil, errors.New("复刻审批参数无效")
	}
	skills, _ := json.Marshal(input.Skills)
	createdAt := time.Now().UTC()
	approval := model.CanvasRemixApproval{
		ID:              "remix_approval_" + uuid.NewSHA1(uuid.NameSpaceOID, []byte(input.UserID+":"+input.RunID+":"+input.ApprovalKey+":"+input.ApprovalRequestID)).String(),
		UserID:          input.UserID,
		RunID:           input.RunID,
		ApprovalKey:     input.ApprovalKey,
		SourceSignature: strings.TrimSpace(input.SourceSignature),
		MarketingKey:    strings.TrimSpace(input.MarketingKey),
		CoreVersion:     input.CoreVersion,
		Skills:          string(skills),
		CreatedAt:       createdAt,
		ExpiresAt:       createdAt.Add(canvasRemixApprovalTTL),
	}
	slots := make([]model.CanvasRemixApprovalSlot, 0, len(input.Slots))
	seen := make(map[string]bool, len(input.Slots))
	for _, item := range input.Slots {
		item.NodeID = strings.TrimSpace(item.NodeID)
		item.Model = strings.TrimSpace(item.Model)
		item.Prompt = strings.TrimSpace(item.Prompt)
		if item.NodeID == "" || item.Model == "" || item.Prompt == "" || seen[item.NodeID] {
			return model.CanvasRemixApproval{}, nil, errors.New("复刻审批槽位无效")
		}
		seen[item.NodeID] = true
		slots = append(slots, model.CanvasRemixApprovalSlot{
			ID:          uuid.NewSHA1(uuid.NameSpaceOID, []byte(approval.ID+":"+item.NodeID)).String(),
			ApprovalID:  approval.ID,
			UserID:      input.UserID,
			RunID:       input.RunID,
			NodeID:      item.NodeID,
			Model:       item.Model,
			Prompt:      item.Prompt,
			RequestHash: CanvasRemixSlotRequestHash(item.NodeID, item.Model, item.Prompt),
			CreatedAt:   createdAt,
		})
	}
	return repository.SaveCanvasRemixApproval(approval, slots)
}

func CanvasRemixSlotRequestHash(nodeID, modelName, prompt string) string {
	payload, _ := json.Marshal([]string{strings.TrimSpace(nodeID), strings.TrimSpace(modelName), strings.TrimSpace(prompt)})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func ClaimCanvasRemixApprovalSlot(userID, approvalID, slotID, requestHash, taskID string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(approvalID) == "" || strings.TrimSpace(slotID) == "" || strings.TrimSpace(requestHash) == "" || strings.TrimSpace(taskID) == "" {
		return repository.ErrCanvasRemixApprovalInvalid
	}
	return repository.ClaimCanvasRemixApprovalSlot(userID, approvalID, slotID, requestHash, taskID)
}
