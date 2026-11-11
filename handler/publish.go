package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/jiangtejie/infinite-canvas-pro/service"
)

const publishUploadLimit = 21 << 20

func publishUserID(r *http.Request) (string, bool) {
	user, ok := service.UserFromContext(r.Context())
	if !ok || strings.TrimSpace(user.ID) == "" {
		return "", false
	}
	return user.ID, true
}

func PublishChannels(w http.ResponseWriter, r *http.Request) {
	OK(w, service.ListPublishChannels())
}

func PublishPreflight(w http.ResponseWriter, r *http.Request) {
	if _, ok := publishUserID(r); !ok {
		Fail(w, "请先登录")
		return
	}
	var request service.PublishInput
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	pkg, preflight := service.PreflightPublish(request)
	OK(w, map[string]any{"package": pkg, "preflight": preflight})
}

func PublishCreateRecord(w http.ResponseWriter, r *http.Request) {
	userID, ok := publishUserID(r)
	if !ok {
		Fail(w, "请先登录")
		return
	}
	var request service.PublishInput
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	if !service.AllowPublishCreateRecord(userID) {
		Fail(w, "发布操作太频繁了，请稍后再试")
		return
	}
	record, err := service.CreatePublishRecord(r.Context(), userID, request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"record": record})
}

func PublishRecords(w http.ResponseWriter, r *http.Request) {
	userID, ok := publishUserID(r)
	if !ok {
		Fail(w, "请先登录")
		return
	}
	records, err := service.ListPublishRecords(userID, 20)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"records": records})
}

func PublishRecord(w http.ResponseWriter, r *http.Request, id string) {
	userID, ok := publishUserID(r)
	if !ok {
		Fail(w, "请先登录")
		return
	}
	record, found, err := service.GetPublishRecord(userID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	if !found {
		Fail(w, "发布记录不存在")
		return
	}
	OK(w, map[string]any{"record": record})
}

func PublishConfirmRecord(w http.ResponseWriter, r *http.Request, id string) {
	userID, ok := publishUserID(r)
	if !ok {
		Fail(w, "请先登录")
		return
	}
	var request struct {
		PublishedURL string `json:"publishedUrl"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			Fail(w, "请求格式错误")
			return
		}
	}
	record, found, err := service.ConfirmPublishRecord(userID, id, request.PublishedURL)
	if err != nil {
		FailError(w, err)
		return
	}
	if !found {
		Fail(w, "发布记录不存在")
		return
	}
	OK(w, map[string]any{"record": record})
}

// UploadPublishMedia 把画布图片转存到发布域名下，返回抖音可回源的公网 HTTPS 地址。
func UploadPublishMedia(w http.ResponseWriter, r *http.Request) {
	userID, ok := publishUserID(r)
	if !ok {
		Fail(w, "请先登录")
		return
	}
	if !service.AllowPublishMediaUpload(userID) {
		Fail(w, "图片上传太频繁了，请稍后再试")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, publishUploadLimit)
	if err := r.ParseMultipartForm(publishUploadLimit); err != nil {
		Fail(w, "图片上传失败，单张不能超过 20MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择要上传的图片")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, publishUploadLimit))
	if err != nil {
		Fail(w, "读取图片失败")
		return
	}
	media, err := service.SavePublishMedia(header.Filename, header.Header.Get("Content-Type"), data)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, media)
}

// PublishMedia 公共发布图片访问，抖音服务器需要无鉴权回源抓取。
func PublishMedia(w http.ResponseWriter, r *http.Request, name string) {
	path, mimeType, err := service.PublishMediaFilePath(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, path)
}

// AdminTestDouyinPublish 验证 Client Key / Secret 与权限是否真的可用，不返回敏感凭证。
func AdminTestDouyinPublish(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ClientKey    string `json:"clientKey"`
		ClientSecret string `json:"clientSecret"`
		Mock         bool   `json:"mock"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	result, err := service.TestDouyinPublishConfig(r.Context(), service.DouyinPublishTestInput{
		ClientKey:    request.ClientKey,
		ClientSecret: request.ClientSecret,
		Mock:         request.Mock,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
