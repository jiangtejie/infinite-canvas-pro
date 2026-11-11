package service

import (
	"context"
	"encoding/json"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

const (
	publishChannelDouyinH5 = "douyin-h5"
	publishRecordExpires   = 2 * time.Hour
	publishMaxImages       = 35
	publishTitleLimit      = 20
	publishBodyLimit       = 1000
	publishTagsLimit       = 5
	publishMinImageSide    = 360
	publishMaxImageBytes   = 20 << 20
	publishMinImageRatio   = 1.0 / 2.2
	publishMaxImageRatio   = 2.2
)

// PublishImage 发布图片。URL 必须是发布域名下的公网 HTTPS 地址。
type PublishImage struct {
	URL      string `json:"url"`
	Width    int    `json:"width,omitempty"`
	Height   int    `json:"height,omitempty"`
	Bytes    int64  `json:"bytes,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

// PublishPackage 是对外发布使用的归一化内容。
type PublishPackage struct {
	Platform string         `json:"platform"`
	Kind     string         `json:"kind"`
	Title    string         `json:"title"`
	Body     string         `json:"body"`
	Tags     []string       `json:"tags"`
	Images   []PublishImage `json:"images"`
}

type PublishIssue struct {
	Level   string         `json:"level"`
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Params  map[string]any `json:"params,omitempty"`
}

type PublishPreflight struct {
	Passed   bool           `json:"passed"`
	Errors   int            `json:"errors"`
	Warnings int            `json:"warnings"`
	Issues   []PublishIssue `json:"issues"`
}

type PublishInput struct {
	Title    string         `json:"title"`
	Body     string         `json:"body"`
	Tags     []string       `json:"tags"`
	Images   []PublishImage `json:"images"`
	Source   string         `json:"source"`
	SourceID string         `json:"sourceId"`
	NodeID   string         `json:"nodeId"`
}

type PublishRecordView struct {
	ID               string           `json:"id"`
	Channel          string           `json:"channel"`
	Status           string           `json:"status"`
	Mock             bool             `json:"mock"`
	QRText           string           `json:"qrText"`
	ExpiresAt        string           `json:"expiresAt"`
	ExpiresInSeconds int64            `json:"expiresInSeconds"`
	Expired          bool             `json:"expired"`
	CreatedAt        string           `json:"createdAt"`
	PublishedURL     string           `json:"publishedUrl"`
	Title            string           `json:"title"`
	ImageCount       int              `json:"imageCount"`
	Package          PublishPackage   `json:"package"`
	Preflight        PublishPreflight `json:"preflight"`
}

type PublishChannel struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Available bool   `json:"available"`
	Reason    string `json:"reason"`
	Mock      bool   `json:"mock"`
}

type PublishChannelsResult struct {
	Channels      []PublishChannel `json:"channels"`
	PublicBaseURL string           `json:"publicBaseUrl"`
	Configured    bool             `json:"configured"`
	Mock          bool             `json:"mock"`
}

// ListPublishChannels 返回发布节点可用的渠道状态；密钥不在这里下发。
func ListPublishChannels() PublishChannelsResult {
	setting := PublishSetting()
	configured := DouyinPublishConfigured(setting)
	channel := PublishChannel{ID: publishChannelDouyinH5, Label: "抖音扫码发布", Mock: setting.DouyinMock}
	if !setting.DouyinMock && !configured {
		channel.Reason = "NEED_CREDENTIALS"
	} else if douyinPublicBaseURL(setting) == "" {
		channel.Reason = "NEED_PUBLIC_BASE_URL"
	} else if !setting.DouyinMock && !strings.HasPrefix(douyinPublicBaseURL(setting), "https://") {
		channel.Reason = "NEED_HTTPS"
	} else {
		channel.Available = true
	}
	return PublishChannelsResult{
		Channels:      []PublishChannel{channel},
		PublicBaseURL: douyinPublicBaseURL(setting),
		Configured:    configured,
		Mock:          setting.DouyinMock,
	}
}

func NormalizePublishInput(input PublishInput) PublishPackage {
	tags := make([]string, 0, len(input.Tags))
	seen := map[string]bool{}
	for _, tag := range input.Tags {
		value := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(tag), "#"))
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		tags = append(tags, value)
	}
	images := make([]PublishImage, 0, len(input.Images))
	for _, image := range input.Images {
		if strings.TrimSpace(image.URL) == "" {
			continue
		}
		images = append(images, PublishImage{
			URL:      strings.TrimSpace(image.URL),
			Width:    image.Width,
			Height:   image.Height,
			Bytes:    image.Bytes,
			MimeType: strings.TrimSpace(image.MimeType),
		})
	}
	return PublishPackage{
		Platform: "douyin",
		Kind:     "image",
		Title:    strings.TrimSpace(input.Title),
		Body:     strings.TrimSpace(input.Body),
		Tags:     tags,
		Images:   images,
	}
}

// PreflightPublish 校验一次发布内容，返回可直接展示的中文问题清单。
func PreflightPublish(input PublishInput) (PublishPackage, PublishPreflight) {
	setting := PublishSetting()
	pkg := NormalizePublishInput(input)
	issues := make([]PublishIssue, 0)
	add := func(level string, code string, message string, params map[string]any) {
		issues = append(issues, PublishIssue{Level: level, Code: code, Message: message, Params: params})
	}

	if pkg.Title == "" {
		add("error", "TITLE_REQUIRED", "请填写发布标题", nil)
	} else if len([]rune(pkg.Title)) > publishTitleLimit {
		add("error", "TITLE_TOO_LONG", "标题不能超过 20 个字", map[string]any{"max": publishTitleLimit})
	}
	if len([]rune(pkg.Body)) > publishBodyLimit {
		add("error", "BODY_TOO_LONG", "正文不能超过 1000 个字", map[string]any{"max": publishBodyLimit})
	}
	if len(pkg.Tags) > publishTagsLimit {
		add("error", "TAGS_TOO_MANY", "话题最多 5 个", map[string]any{"max": publishTagsLimit})
	}
	if len(pkg.Images) == 0 {
		add("error", "NO_IMAGES", "请至少连接一张图片节点", nil)
	}
	if len(pkg.Images) > publishMaxImages {
		add("error", "TOO_MANY_IMAGES", "图片最多 35 张", map[string]any{"max": publishMaxImages})
	}

	baseURL := douyinPublicBaseURL(setting)
	mediaPrefix := baseURL + "/api/publish/media/"
	for index, image := range pkg.Images {
		label := map[string]any{"n": index + 1}
		parsedImageURL, parseImageErr := url.Parse(image.URL)
		if baseURL == "" || !strings.HasPrefix(image.URL, mediaPrefix) {
			add("error", "NOT_PUBLISH_MEDIA", "第 "+strconv.Itoa(index+1)+" 张图片还没有转存到发布域名", label)
		} else if parseImageErr != nil || (parsedImageURL.Scheme != "https" && !setting.DouyinMock) {
			add("error", "NOT_PUBLIC_HTTPS", "第 "+strconv.Itoa(index+1)+" 张图片地址不是公网 HTTPS", label)
		} else if _, _, mediaErr := PublishMediaFilePath(path.Base(parsedImageURL.Path)); mediaErr != nil {
			add("error", "NOT_PUBLISH_MEDIA", "第 "+strconv.Itoa(index+1)+" 张图片不存在，请重新生成二维码", label)
		}
		if image.Bytes > publishMaxImageBytes {
			add("error", "IMAGE_TOO_LARGE", "第 "+strconv.Itoa(index+1)+" 张图片超过 20MB", label)
		}
		if image.Width > 0 && image.Height > 0 {
			side := image.Width
			if image.Height < side {
				side = image.Height
			}
			if side < publishMinImageSide {
				add("error", "IMAGE_TOO_SMALL", "第 "+strconv.Itoa(index+1)+" 张图片短边小于 360px", label)
			}
			ratio := float64(image.Width) / float64(image.Height)
			if ratio < publishMinImageRatio || ratio > publishMaxImageRatio {
				add("error", "IMAGE_RATIO", "第 "+strconv.Itoa(index+1)+" 张图片比例需在 1:2.2 到 2.2:1 之间", label)
			}
		}
	}

	preflight := summarizePublishIssues(issues)
	return pkg, preflight
}

// CreatePublishRecord 签发一次抖音图文发布记录。
func CreatePublishRecord(ctx context.Context, userID string, input PublishInput) (PublishRecordView, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return PublishRecordView{}, safeMessageError{message: "请先登录"}
	}
	setting := PublishSetting()
	channels := ListPublishChannels()
	if len(channels.Channels) == 0 || !channels.Channels[0].Available {
		return PublishRecordView{}, safeMessageError{message: publishChannelUnavailableMessage(channels.Channels)}
	}
	pkg, preflight := PreflightPublish(input)
	if !preflight.Passed {
		message := "发布内容未通过预检"
		for _, issue := range preflight.Issues {
			if issue.Level == "error" {
				message = issue.Message
				break
			}
		}
		return PublishRecordView{}, safeMessageError{message: message}
	}
	recordID := "pub_" + randomHex(16)
	qrText, mock, err := BuildDouyinH5Schema(setting, recordID, pkg.Title, pkg.Tags, publishImageURLs(pkg.Images))
	if err != nil {
		return PublishRecordView{}, err
	}
	now := time.Now()
	expiresAt := now.Add(publishRecordExpires)
	pkgJSON, _ := json.Marshal(pkg)
	preflightJSON, _ := json.Marshal(preflight)
	record := model.PublishRecord{
		ID:        recordID,
		UserID:    userID,
		Channel:   publishChannelDouyinH5,
		Status:    "issued",
		Title:     pkg.Title,
		Package:   string(pkgJSON),
		Preflight: string(preflightJSON),
		QRText:    qrText,
		Mock:      mock,
		ExpiresAt: expiresAt.Format(time.RFC3339),
		Source:    strings.TrimSpace(input.Source),
		SourceID:  strings.TrimSpace(input.SourceID),
		NodeID:    strings.TrimSpace(input.NodeID),
		CreatedAt: now.Format(time.RFC3339),
		UpdatedAt: now.Format(time.RFC3339),
	}
	saved, err := repository.SavePublishRecord(record)
	if err != nil {
		return PublishRecordView{}, safeMessageError{message: "保存发布记录失败"}
	}
	return publishRecordView(saved), nil
}

func GetPublishRecord(userID string, id string) (PublishRecordView, bool, error) {
	record, found, err := repository.GetPublishRecord(id)
	if err != nil {
		return PublishRecordView{}, false, safeMessageError{message: "读取发布记录失败"}
	}
	if !found || strings.TrimSpace(record.UserID) != strings.TrimSpace(userID) {
		return PublishRecordView{}, false, nil
	}
	return publishRecordView(record), true, nil
}

func ListPublishRecords(userID string, limit int) ([]PublishRecordView, error) {
	records, err := repository.ListUserPublishRecords(userID, limit)
	if err != nil {
		return nil, safeMessageError{message: "读取发布记录失败"}
	}
	views := make([]PublishRecordView, 0, len(records))
	for _, record := range records {
		views = append(views, publishRecordView(record))
	}
	return views, nil
}

func ConfirmPublishRecord(userID string, id string, publishedURL string) (PublishRecordView, bool, error) {
	record, found, err := repository.GetPublishRecord(id)
	if err != nil {
		return PublishRecordView{}, false, safeMessageError{message: "读取发布记录失败"}
	}
	if !found || strings.TrimSpace(record.UserID) != strings.TrimSpace(userID) {
		return PublishRecordView{}, false, nil
	}
	publishedURL = strings.TrimSpace(publishedURL)
	if publishedURL != "" {
		if parsed, err := url.Parse(publishedURL); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return PublishRecordView{}, false, safeMessageError{message: "请填写正确的抖音作品链接"}
		}
	}
	record.Status = "confirmed"
	record.PublishedURL = publishedURL
	record.UpdatedAt = time.Now().Format(time.RFC3339)
	saved, err := repository.UpdatePublishRecord(record)
	if err != nil {
		return PublishRecordView{}, false, safeMessageError{message: "更新发布记录失败"}
	}
	return publishRecordView(saved), true, nil
}

func publishRecordView(record model.PublishRecord) PublishRecordView {
	pkg := PublishPackage{}
	_ = json.Unmarshal([]byte(record.Package), &pkg)
	preflight := PublishPreflight{}
	_ = json.Unmarshal([]byte(record.Preflight), &preflight)
	expiresAt, parseErr := time.Parse(time.RFC3339, record.ExpiresAt)
	now := time.Now()
	expiresInSeconds := int64(0)
	expired := true
	if parseErr == nil {
		expired = !expiresAt.After(now)
		expiresInSeconds = int64(expiresAt.Sub(now).Seconds())
		if expiresInSeconds < 0 {
			expiresInSeconds = 0
		}
	}
	return PublishRecordView{
		ID:               record.ID,
		Channel:          record.Channel,
		Status:           record.Status,
		Mock:             record.Mock,
		QRText:           record.QRText,
		ExpiresAt:        record.ExpiresAt,
		ExpiresInSeconds: expiresInSeconds,
		Expired:          expired,
		CreatedAt:        record.CreatedAt,
		PublishedURL:     record.PublishedURL,
		Title:            record.Title,
		ImageCount:       len(pkg.Images),
		Package:          pkg,
		Preflight:        preflight,
	}
}

func summarizePublishIssues(issues []PublishIssue) PublishPreflight {
	errors := 0
	warnings := 0
	for _, issue := range issues {
		if issue.Level == "error" {
			errors++
		} else if issue.Level == "warn" {
			warnings++
		}
	}
	if issues == nil {
		issues = []PublishIssue{}
	}
	sort.SliceStable(issues, func(i int, j int) bool {
		return issues[i].Level == "error" && issues[j].Level != "error"
	})
	return PublishPreflight{Passed: errors == 0, Errors: errors, Warnings: warnings, Issues: issues}
}

func publishImageURLs(images []PublishImage) []string {
	urls := make([]string, 0, len(images))
	for _, image := range images {
		urls = append(urls, image.URL)
	}
	return urls
}

func publishChannelUnavailableMessage(channels []PublishChannel) string {
	if len(channels) == 0 {
		return "发布渠道不可用"
	}
	switch channels[0].Reason {
	case "NEED_CREDENTIALS":
		return "请先在后台配置抖音 Client Key / Client Secret"
	case "NEED_PUBLIC_BASE_URL":
		return "请先在后台配置发布域名 publicBaseUrl"
	case "NEED_HTTPS":
		return "发布域名必须是公网 HTTPS 地址"
	default:
		return "发布渠道暂不可用"
	}
}
