package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

type CanvasImageTaskCreateInput struct {
	ID              string
	UserID          string
	UserDisplayName string
	Source          string
	SourceID        string
	NodeID          string
	ClientTaskID    string
	RequestHash     string
	RemixApproval   string
	RemixSlot       string
	Model           string
	ChannelID       string
	UserChannelID   string
	ChannelName     string
	WorkflowRef     string
	Credits         float64
	BillingName     string
	BillingPath     string
	Prompt          string
	GenerationType  string
	Endpoint        string
	ContentType     string
	RequestBody     string
	Payload         []byte
}

func CreateCanvasImageTask(input CanvasImageTaskCreateInput) (model.CanvasImageTask, bool, error) {
	current := now()
	task := model.CanvasImageTask{
		ID:              firstVideoTaskValue(input.ID, "canvas_image_task_"+uuid.NewString()),
		ClientTaskID:    strings.TrimSpace(input.ClientTaskID),
		UserID:          strings.TrimSpace(input.UserID),
		UserDisplayName: strings.TrimSpace(input.UserDisplayName),
		Source:          normalizeCanvasImageTaskSource(input.Source),
		SourceID:        strings.TrimSpace(input.SourceID),
		NodeID:          strings.TrimSpace(input.NodeID),
		RequestHash:     canvasImageTaskRequestHash(input),
		RemixApproval:   strings.TrimSpace(input.RemixApproval),
		RemixSlot:       strings.TrimSpace(input.RemixSlot),
		Model:           strings.TrimSpace(input.Model),
		ChannelID:       strings.TrimSpace(input.ChannelID),
		UserChannelID:   strings.TrimSpace(input.UserChannelID),
		ChannelName:     strings.TrimSpace(input.ChannelName),
		WorkflowRef:     input.WorkflowRef,
		Credits:         input.Credits,
		Status:          "queued",
		Progress:        0,
		Prompt:          strings.TrimSpace(input.Prompt),
		GenerationType:  strings.TrimSpace(input.GenerationType),
		Endpoint:        strings.TrimSpace(input.Endpoint),
		ContentType:     strings.TrimSpace(input.ContentType),
		RequestBody:     input.RequestBody,
		Payload:         input.Payload,
		BillingState:    "free",
		CreatedAt:       current,
		UpdatedAt:       current,
	}
	created := true
	var err error
	approvalHash := ""
	if task.RemixSlot != "" {
		approvalModel := task.Model
		if task.WorkflowRef != "" {
			approvalModel = firstVideoTaskValue(input.BillingName, task.Model)
		}
		approvalHash = CanvasRemixSlotRequestHash(task.NodeID, approvalModel, task.Prompt)
	}
	extra, _ := json.Marshal(map[string]string{"model": task.Model, "path": firstVideoTaskValue(input.BillingPath, task.Endpoint)})
	consumeLog := model.CreditLog{ID: newID("credit"), UserID: task.UserID, Type: model.CreditLogTypeAIConsume, Amount: -normalizeCredits(task.Credits), Remark: "调用模型 " + task.Model, Extra: string(extra), CreatedAt: current}
	task, created, err = repository.CreateCanvasImageTaskWithCredits(task, consumeLog, approvalHash)
	if err == nil && created && task.WorkflowRef == "" {
		WakeCanvasImageTaskWorker()
	}
	return task, created, err
}

func canvasImageTaskRequestHash(input CanvasImageTaskCreateInput) string {
	if hash := strings.TrimSpace(input.RequestHash); hash != "" {
		return hash
	}
	payloadSum := sha256.Sum256(input.Payload)
	payload, _ := json.Marshal([]string{
		input.UserID,
		input.Source,
		input.SourceID,
		input.NodeID,
		input.Model,
		input.ChannelID,
		input.UserChannelID,
		input.Prompt,
		input.GenerationType,
		input.Endpoint,
		input.ContentType,
		input.RequestBody,
		input.WorkflowRef,
		hex.EncodeToString(payloadSum[:]),
	})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func GetUserCanvasImageTask(userID string, id string) (model.CanvasImageTask, bool, error) {
	return repository.GetUserCanvasImageTask(strings.TrimSpace(userID), strings.TrimSpace(id))
}

func ListUserCanvasImageTasks(userID string, sources []string, limit int) ([]map[string]any, error) {
	tasks, err := repository.ListUserCanvasImageTasks(strings.TrimSpace(userID), normalizeCanvasImageTaskSources(sources), limit)
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		result = append(result, CanvasImageTaskResponse(task))
	}
	return result, nil
}

func BatchUserCanvasImageTasks(userID string, ids []string) ([]map[string]any, error) {
	tasks, err := repository.BatchUserCanvasImageTasks(strings.TrimSpace(userID), ids)
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		result = append(result, CanvasImageTaskResponse(task))
	}
	return result, nil
}

func DeleteUserCanvasImageTask(userID string, id string) error {
	return repository.DeleteUserCanvasImageTask(strings.TrimSpace(userID), strings.TrimSpace(id))
}

func CanvasImageTaskResponse(task model.CanvasImageTask) map[string]any {
	result := map[string]any{
		"id":             task.ID,
		"object":         "canvas.image.task",
		"source":         task.Source,
		"source_id":      task.SourceID,
		"node_id":        task.NodeID,
		"model":          task.Model,
		"credits":        task.Credits,
		"billingState":   task.BillingState,
		"status":         task.Status,
		"progress":       task.Progress,
		"prompt":         task.Prompt,
		"generationType": task.GenerationType,
		"created_at":     task.CreatedAt,
		"updated_at":     task.UpdatedAt,
		"started_at":     task.StartedAt,
		"completed_at":   task.CompletedAt,
		"createdAt":      task.CreatedAt,
		"updatedAt":      task.UpdatedAt,
	}
	if task.ImageURL != "" {
		result["url"] = task.ImageURL
		result["image_url"] = task.ImageURL
		if len(task.ImageURLs) > 0 {
			result["image_urls"] = task.ImageURLs
		}
		result["storageKey"] = task.StorageKey
		result["width"] = task.Width
		result["height"] = task.Height
		result["mimeType"] = task.MimeType
		result["bytes"] = task.Bytes
	}
	if task.WorkflowRef != "" {
		result["workflowRef"] = task.WorkflowRef
	}
	if task.UpstreamTaskID != "" {
		result["upstream_task_id"] = task.UpstreamTaskID
	}
	if task.Error != "" || task.ErrorDetail != "" {
		result["error"] = map[string]any{"message": firstVideoTaskValue(task.Error, task.ErrorDetail)}
		result["error_detail"] = task.ErrorDetail
	}
	return result
}

func normalizeCanvasImageTaskSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "image-workbench":
		return "image-workbench"
	case "workflow":
		return "workflow"
	case "canvas", "":
		return "canvas"
	default:
		return "canvas"
	}
}

func normalizeCanvasImageTaskSources(sources []string) []string {
	result := make([]string, 0, len(sources))
	seen := map[string]bool{}
	for _, source := range sources {
		normalized := normalizeCanvasImageTaskSource(source)
		if normalized != "" && !seen[normalized] {
			result = append(result, normalized)
			seen[normalized] = true
		}
	}
	return result
}
