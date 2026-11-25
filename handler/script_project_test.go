package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScriptProjectHTTPRequiresLogin(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/script/projects", strings.NewReader(`{}`))
	writer := httptest.NewRecorder()
	CreateScriptProject(writer, request)
	if !strings.Contains(writer.Body.String(), `"code":1`) || !strings.Contains(writer.Body.String(), "请先登录") {
		t.Fatalf("anonymous create accepted: %s", writer.Body)
	}
}

func TestScriptProjectHTTPRejectsPathProjectMismatch(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/script/projects/other/versions", strings.NewReader(`{"version":{"projectId":"different"}}`))
	writer := httptest.NewRecorder()
	CreateScriptProjectVersion(writer, request, "expected")
	if !strings.Contains(writer.Body.String(), "项目编号不一致") {
		t.Fatalf("mismatched project accepted: %s", writer.Body)
	}
}
