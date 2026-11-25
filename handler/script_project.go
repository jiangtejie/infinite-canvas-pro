package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func ListScriptProjects(w http.ResponseWriter, r *http.Request) {
	items, err := service.ListScriptProjects(r.Context())
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, struct {
		Items []model.ScriptProjectSummary `json:"items"`
	}{Items: items})
}

func CreateScriptProject(w http.ResponseWriter, r *http.Request) {
	var document model.ScriptProjectDocument
	if err := decodeScriptBody(w, r, 8<<20, &document); err != nil {
		Fail(w, "剧本格式错误或内容过大")
		return
	}
	view, err := service.SaveScriptProject(r.Context(), document)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, view)
}

func GetScriptProject(w http.ResponseWriter, r *http.Request, id string) {
	view, err := service.CurrentScriptProject(r.Context(), id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, view)
}

func ChangeScriptProject(w http.ResponseWriter, r *http.Request, id string) {
	var request model.ScriptChangeRequest
	if err := decodeScriptBody(w, r, 8<<20, &request); err != nil {
		Fail(w, "剧本变更格式错误或内容过大")
		return
	}
	if request.Document.ID != id {
		Fail(w, "项目编号不一致")
		return
	}
	response, err := service.ApplyScriptChanges(r.Context(), request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, response)
}

func DeleteScriptProject(w http.ResponseWriter, r *http.Request, id string) {
	revision, _ := strconv.ParseInt(r.URL.Query().Get("revision"), 10, 64)
	if err := service.DeleteScriptProject(r.Context(), id, revision); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func ListScriptProjectVersions(w http.ResponseWriter, r *http.Request, projectID string) {
	items, err := service.ListScriptVersions(r.Context(), projectID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, struct {
		Items []model.ScriptVersionSummary `json:"items"`
	}{Items: items})
}

func CreateScriptProjectVersion(w http.ResponseWriter, r *http.Request, projectID string) {
	var request model.ScriptVersionCreateRequest
	if err := decodeScriptBody(w, r, 16<<20, &request); err != nil {
		Fail(w, "剧本版本格式错误或内容过大")
		return
	}
	if request.Version.ProjectID != projectID {
		Fail(w, "项目编号不一致")
		return
	}
	view, err := service.CreateScriptVersion(r.Context(), request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, view)
}

func GetScriptProjectVersion(w http.ResponseWriter, r *http.Request, projectID, versionID string) {
	payload, err := service.GetScriptVersion(r.Context(), projectID, versionID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, payload)
}

func RestoreScriptProjectVersion(w http.ResponseWriter, r *http.Request, projectID, versionID string) {
	var request model.ScriptVersionRestoreRequest
	if err := decodeScriptBody(w, r, 1<<20, &request); err != nil {
		Fail(w, "剧本恢复参数错误")
		return
	}
	view, err := service.RestoreScriptVersion(r.Context(), projectID, versionID, request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, view)
}

func DeleteScriptProjectVersion(w http.ResponseWriter, r *http.Request, projectID, versionID string) {
	revision, _ := strconv.ParseInt(r.URL.Query().Get("baseRevision"), 10, 64)
	if err := service.DeleteScriptVersion(r.Context(), projectID, versionID, revision); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func decodeScriptBody(w http.ResponseWriter, r *http.Request, limit int64, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}
