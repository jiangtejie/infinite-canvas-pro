package service

import (
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestAILogMatchesKeywordByIdAndFields(t *testing.T) {
	item := model.AICallLog{ID: "log-123", Model: "gpt-image", ChannelName: "主渠道", Status: 502, Error: "upstream failed"}
	for _, keyword := range []string{"log-123", "gpt-image", "主渠道", "502", "upstream"} {
		if !aiLogMatchesKeyword(item, keyword) {
			t.Fatalf("expected keyword %q to match", keyword)
		}
	}
	if aiLogMatchesKeyword(item, "missing") {
		t.Fatal("unexpected match")
	}
}
