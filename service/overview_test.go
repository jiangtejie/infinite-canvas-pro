package service

import (
	"testing"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestLatestAILogsKeepsNewestInOrder(t *testing.T) {
	items := []model.AICallLog{
		{ID: "a", CreatedAt: "2026-01-01 00:00:00"},
		{ID: "b", CreatedAt: "2026-01-03 00:00:00"},
		{ID: "c", CreatedAt: "2026-01-02 00:00:00"},
		{ID: "d", CreatedAt: "2026-01-04 00:00:00"},
	}
	got := latestAILogs(items, 3)
	if len(got) != 3 {
		t.Fatalf("expected 3 logs, got %d", len(got))
	}
	for index, id := range []string{"d", "b", "c"} {
		if got[index].ID != id {
			t.Fatalf("expected %s at %d, got %s", id, index, got[index].ID)
		}
	}
}

func TestAILogCacheSignatureChangesAcrossDays(t *testing.T) {
	first, err := aiLogCacheSignature(time.Date(2026, 1, 1, 23, 59, 0, 0, time.Local))
	if err != nil {
		t.Fatalf("signature failed: %v", err)
	}
	second, err := aiLogCacheSignature(time.Date(2026, 1, 2, 0, 1, 0, 0, time.Local))
	if err != nil {
		t.Fatalf("signature failed: %v", err)
	}
	if first == second {
		t.Fatal("expected signature to change across days")
	}
}

func TestLatestAILogsKeepsOriginalOrderForEqualTimes(t *testing.T) {
	items := []model.AICallLog{
		{ID: "a", CreatedAt: "2026-01-01 00:00:00"},
		{ID: "b", CreatedAt: "2026-01-01 00:00:00"},
		{ID: "c", CreatedAt: "2026-01-01 00:00:00"},
	}
	got := latestAILogs(items, 2)
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "b" {
		t.Fatalf("expected stable [a b], got %#v", got)
	}
}
