package service

import (
	"net/http/httptest"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestIsTeamorouterBaseURL(t *testing.T) {
	cases := []struct {
		baseURL string
		want    bool
	}{
		{"https://api.teamorouter.ai", true},
		{"https://api.teamorouter.ai/v1beta", true},
		{"https://TEAMOROUTER.AI", true},
		{"https://generativelanguage.googleapis.com", false},
		{"https://teamorouter.ai.example.com", false},
		{"not a url", false},
	}
	for _, item := range cases {
		if got := IsTeamorouterBaseURL(item.baseURL); got != item.want {
			t.Fatalf("IsTeamorouterBaseURL(%q) = %v, want %v", item.baseURL, got, item.want)
		}
	}
}

func TestSetModelChannelAuthHeaderTeamorouter(t *testing.T) {
	teamorouter := model.ModelChannel{Protocol: ModelChannelProtocolGemini, BaseURL: "https://api.teamorouter.ai", APIKey: "sk-teamo-test"}
	request := httptest.NewRequest("POST", "https://api.teamorouter.ai/v1beta/models/gemini-3.1-flash-image:generateContent", nil)
	SetModelChannelAuthHeader(request, teamorouter)
	if got := request.Header.Get("Authorization"); got != "Bearer sk-teamo-test" {
		t.Fatalf("Authorization = %q", got)
	}
	if got := request.Header.Get("x-goog-api-key"); got != "" {
		t.Fatalf("x-goog-api-key should be empty, got %q", got)
	}

	google := model.ModelChannel{Protocol: ModelChannelProtocolGemini, BaseURL: "https://generativelanguage.googleapis.com", APIKey: "google-key"}
	request = httptest.NewRequest("POST", "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent", nil)
	SetModelChannelAuthHeader(request, google)
	if got := request.Header.Get("x-goog-api-key"); got != "google-key" {
		t.Fatalf("x-goog-api-key = %q", got)
	}
	if got := request.Header.Get("Authorization"); got != "" {
		t.Fatalf("Authorization should be empty, got %q", got)
	}
}
