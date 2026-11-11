package service

import (
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestBuildMidjourneyChannelURL(t *testing.T) {
	channel := model.ModelChannel{Protocol: "midjourney", BaseURL: "https://api.teamorouter.ai"}
	if got := BuildMidjourneyChannelURL(channel, "/mj/submit/imagine"); got != "https://api.teamorouter.ai/mj/submit/imagine" {
		t.Fatalf("url = %s", got)
	}
	channel.BaseURL = "https://api.teamorouter.ai/v1"
	if got := BuildMidjourneyChannelURL(channel, "/mj/task/1/fetch"); got != "https://api.teamorouter.ai/mj/task/1/fetch" {
		t.Fatalf("url with /v1 = %s", got)
	}
}

func TestIsMidjourneyChannel(t *testing.T) {
	if !IsMidjourneyChannel(model.ModelChannel{Protocol: "MidJourney"}) {
		t.Fatal("protocol should match case-insensitively")
	}
	if IsMidjourneyChannel(model.ModelChannel{Protocol: "openai"}) {
		t.Fatal("openai must not match")
	}
}

func TestMidjourneyModels(t *testing.T) {
	models := MidjourneyModels()
	if len(models) != 1 || models[0] != "midjourney" {
		t.Fatalf("models = %#v", models)
	}
}
