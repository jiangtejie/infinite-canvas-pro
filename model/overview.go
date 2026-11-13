package model

// AdminOverview 后台概览的聚合数据。
type AdminOverview struct {
	Users            AdminOverviewUsers             `json:"users"`
	AI               AdminOverviewAI                `json:"ai"`
	Credits          AdminOverviewCredits           `json:"credits"`
	Content          AdminOverviewContent           `json:"content"`
	Channels         AdminOverviewChannels          `json:"channels"`
	Storage          AdminOverviewStorage           `json:"storage"`
	RecentAILogs     []AdminOverviewRecentAILog     `json:"recentAiLogs"`
	RecentCreditLogs []AdminOverviewRecentCreditLog `json:"recentCreditLogs"`
}

type AdminOverviewUsers struct {
	Total    int `json:"total"`
	NewToday int `json:"newToday"`
	Active7d int `json:"active7d"`
}

type AdminOverviewAI struct {
	Total         int                    `json:"total"`
	TodayCalls    int                    `json:"todayCalls"`
	TodayFailed   int                    `json:"todayFailed"`
	SuccessRate   float64                `json:"successRate"`
	AvgDurationMs int64                  `json:"avgDurationMs"`
	Trend         []AdminOverviewAITrend `json:"trend"`
}

type AdminOverviewAITrend struct {
	Date    string  `json:"date"`
	Calls   int     `json:"calls"`
	Credits float64 `json:"credits"`
}

type AdminOverviewCredits struct {
	TodayConsumed float64 `json:"todayConsumed"`
	TodayGranted  float64 `json:"todayGranted"`
	TotalBalance  float64 `json:"totalBalance"`
}

type AdminOverviewContent struct {
	Prompts         int `json:"prompts"`
	Assets          int `json:"assets"`
	Skills          int `json:"skills"`
	EnabledPackages int `json:"enabledPackages"`
}

type AdminOverviewChannels struct {
	Total   int `json:"total"`
	Enabled int `json:"enabled"`
}

type AdminOverviewStorage struct {
	Configured int   `json:"configured"`
	UsedBytes  int64 `json:"usedBytes"`
	LimitBytes int64 `json:"limitBytes"`
	Exceeded   int   `json:"exceeded"`
}

type AdminOverviewRecentAILog struct {
	ID              string  `json:"id"`
	UserID          string  `json:"userId"`
	UserDisplayName string  `json:"userDisplayName"`
	Model           string  `json:"model"`
	Status          int     `json:"status"`
	Failed          bool    `json:"failed"`
	DurationMs      int64   `json:"durationMs"`
	Credits         float64 `json:"credits"`
	CreatedAt       string  `json:"createdAt"`
}

type AdminOverviewRecentCreditLog struct {
	ID              string        `json:"id"`
	UserID          string        `json:"userId"`
	UserDisplayName string        `json:"userDisplayName"`
	Type            CreditLogType `json:"type"`
	Amount          float64       `json:"amount"`
	Balance         float64       `json:"balance"`
	Remark          string        `json:"remark"`
	CreatedAt       string        `json:"createdAt"`
}
