package model

type VideoTask struct {
	ID                           string  `json:"id" gorm:"primaryKey"`
	UserID                       string  `json:"userId" gorm:"index"`
	UserDisplayName              string  `json:"userDisplayName"`
	Model                        string  `json:"model" gorm:"index"`
	ChannelID                    string  `json:"channelId" gorm:"index"`
	UserChannelID                string  `json:"userChannelId" gorm:"index"`
	ChannelName                  string  `json:"channelName"`
	WorkflowRef                  string  `json:"workflowRef,omitempty"`
	Source                       string  `json:"source" gorm:"index"`
	SourceID                     string  `json:"source_id" gorm:"index"`
	UpstreamTaskID               string  `json:"upstreamTaskId" gorm:"index"`
	UpstreamVideoID              string  `json:"upstreamVideoId" gorm:"index"`
	Status                       string  `json:"status" gorm:"index:idx_video_tasks_status_created_at,priority:1"`
	Progress                     int     `json:"progress"`
	Seconds                      string  `json:"seconds"`
	Size                         string  `json:"size"`
	VideoURL                     string  `json:"videoUrl"`
	Error                        string  `json:"error"`
	ErrorDetail                  string  `json:"errorDetail"`
	RequestBody                  string  `json:"requestBody"`
	ParameterTranslationSnapshot string  `json:"-"`
	ResponseBody                 string  `json:"responseBody"`
	LastResponse                 string  `json:"lastResponse"`
	Credits                      float64 `json:"credits" gorm:"type:decimal(20,2)"`
	CreatedAt                    string  `json:"createdAt" gorm:"index;index:idx_video_tasks_status_created_at,priority:2"`
	UpdatedAt                    string  `json:"updatedAt" gorm:"index"`
	StartedAt                    string  `json:"startedAt"`
	CompletedAt                  string  `json:"completedAt"`
	LastPolledAt                 string  `json:"lastPolledAt" gorm:"index"`
}
