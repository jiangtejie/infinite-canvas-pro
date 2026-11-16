package handler

import (
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func teamorouterChannel() model.ModelChannel {
	return model.ModelChannel{Protocol: service.ModelChannelProtocolGemini, BaseURL: "https://api.teamorouter.ai", APIKey: "sk-teamo"}
}

func TestTeamorouterVideoUsesOpenAIVideosPath(t *testing.T) {
	teamo := teamorouterChannel()
	google := model.ModelChannel{Protocol: service.ModelChannelProtocolGemini, BaseURL: "https://generativelanguage.googleapis.com", APIKey: "k"}
	for _, path := range []string{"/videos", "/videos/vid_1", "/videos/vid_1/content"} {
		if got := resolveAIProxyPath(teamo, "seedance-2-0-mini-text-to-video-basic", path); got != path {
			t.Fatalf("teamo video path %q rewritten to %q, want unchanged OpenAI-Videos path", path, got)
		}
	}
	if got := resolveAIProxyPath(google, "veo-3.1-generate", "/videos"); !strings.Contains(got, "predictLongRunning") {
		t.Fatalf("google video path = %q, want gemini predictLongRunning", got)
	}
	if got := resolveAIProxyPath(teamo, "gemini-3.1-flash-image", "/images/generations"); !strings.Contains(got, "generateContent") {
		t.Fatalf("teamo image path = %q, want gemini generateContent", got)
	}
}

func TestTeamorouterVideoPrepareKeepsBody(t *testing.T) {
	body := `{"model":"seedance-2-0-mini-text-to-video-basic","prompt":"p","seconds":"5","size":"1280x720"}`
	input := aiProtocolRequest{mode: aiProtocolVideoRequest, channel: teamorouterChannel(), body: []byte(body), contentType: "application/json", endpoint: "/videos", modelName: "seedance-2-0-mini-text-to-video-basic"}
	out, id, err := prepareAIProtocolRequest(input)
	if err != nil {
		t.Fatalf("prepare err: %v", err)
	}
	if id != "model:teamorouter-video" {
		t.Fatalf("prepared by %q, want model:teamorouter-video", id)
	}
	if string(out.body) != body {
		t.Fatalf("teamo video body mutated: %s", out.body)
	}
}

func TestTeamorouterVideoResponsePassthrough(t *testing.T) {
	payload := []byte(`{"id":"v","object":"video","status":"completed"}`)
	got := transformAIProtocolVideoPayload(payload, nil, teamorouterChannel(), "m", true)
	if string(got) != string(payload) {
		t.Fatalf("teamo video response transformed: %s", got)
	}
}