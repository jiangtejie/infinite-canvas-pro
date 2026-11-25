package model

import "time"

type CanvasImageTask struct {
	ID              string    `json:"id" gorm:"primaryKey"`
	ClientTaskID    string    `json:"clientTaskId" gorm:"uniqueIndex:idx_canvas_image_tasks_user_client,priority:2"`
	UserID          string    `json:"userId" gorm:"index:idx_canvas_image_tasks_user_source_node,priority:1;uniqueIndex:idx_canvas_image_tasks_user_client,priority:1"`
	RequestHash     string    `json:"requestHash" gorm:"index"`
	RemixApproval   string    `json:"remixApproval,omitempty"`
	RemixSlot       string    `json:"remixSlot,omitempty"`
	UserDisplayName string    `json:"userDisplayName"`
	Source          string    `json:"source" gorm:"index:idx_canvas_image_tasks_user_source_node,priority:2"`
	SourceID        string    `json:"sourceId" gorm:"index:idx_canvas_image_tasks_user_source_node,priority:3"`
	NodeID          string    `json:"nodeId" gorm:"index:idx_canvas_image_tasks_user_source_node,priority:4"`
	Model           string    `json:"model"`
	ChannelID       string    `json:"channelId"`
	UserChannelID   string    `json:"userChannelId"`
	ChannelName     string    `json:"channelName"`
	WorkflowRef     string    `json:"workflowRef,omitempty"`
	Credits         float64   `json:"credits,omitempty" gorm:"type:decimal(20,2)"`
	Status          string    `json:"status"`
	Progress        int       `json:"progress"`
	Prompt          string    `json:"prompt"`
	GenerationType  string    `json:"generationType"`
	Endpoint        string    `json:"endpoint"`
	ContentType     string    `json:"contentType"`
	RequestBody     string    `json:"requestBody"`
	Payload         []byte    `json:"-" gorm:"type:blob"`
	BillingState    string    `json:"billingState"`
	ResponseBody    string    `json:"responseBody"`
	UpstreamTaskID  string    `json:"upstreamTaskId,omitempty"`
	Error           string    `json:"error"`
	ErrorDetail     string    `json:"errorDetail"`
	ImageURL        string    `json:"imageUrl"`
	ImageURLs       []string  `json:"imageUrls" gorm:"serializer:json"`
	StorageKey      string    `json:"storageKey"`
	Width           int       `json:"width"`
	Height          int       `json:"height"`
	MimeType        string    `json:"mimeType"`
	Bytes           int64     `json:"bytes"`
	CreatedAt       string    `json:"createdAt"`
	UpdatedAt       string    `json:"updatedAt"`
	StartedAt       string    `json:"startedAt"`
	CompletedAt     string    `json:"completedAt"`
	Attempt         int       `json:"attempt"`
	DispatchState   string    `json:"dispatchState"`
	LeaseOwner      string    `json:"leaseOwner,omitempty" gorm:"index"`
	LeaseUntil      time.Time `json:"leaseUntil,omitempty" gorm:"index"`
}
