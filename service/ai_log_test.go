package service

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/config"
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

func withAILogDir(t *testing.T, dir string) {
	t.Helper()
	previous := config.Cfg.AILogDir
	config.Cfg.AILogDir = dir
	t.Cleanup(func() { config.Cfg.AILogDir = previous })
}

func TestAILogFileSignatureChangesOnWrite(t *testing.T) {
	dir := t.TempDir()
	withAILogDir(t, dir)
	before, err := aiLogFilesSignature()
	if err != nil {
		t.Fatalf("signature failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "ai-calls-2026-01-01.log"), []byte("{}\n"), 0644); err != nil {
		t.Fatalf("write log failed: %v", err)
	}
	after, err := aiLogFilesSignature()
	if err != nil {
		t.Fatalf("signature failed: %v", err)
	}
	if before == after {
		t.Fatal("expected signature to change after writing a log")
	}
}

func TestListAICallLogsRefreshesWhenFilesChange(t *testing.T) {
	dir := t.TempDir()
	withAILogDir(t, dir)
	path := filepath.Join(dir, "ai-calls-2026-01-01.log")
	if err := os.WriteFile(path, []byte("{\"id\":\"log-1\",\"model\":\"m1\",\"createdAt\":\"2026-01-01 00:00:00\"}\n"), 0644); err != nil {
		t.Fatalf("write log failed: %v", err)
	}
	first, err := ListAICallLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil || first.Total != 1 {
		t.Fatalf("expected one cached log, got total=%d err=%v", first.Total, err)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		t.Fatalf("open log failed: %v", err)
	}
	if _, err := file.WriteString("{\"id\":\"log-2\",\"model\":\"m2\",\"createdAt\":\"2026-01-02 00:00:00\"}\n"); err != nil {
		t.Fatalf("append log failed: %v", err)
	}
	_ = file.Close()
	second, err := ListAICallLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil || second.Total != 2 {
		t.Fatalf("expected cache to refresh to two logs, got total=%d err=%v", second.Total, err)
	}
}

func TestListAICallLogsOrdersByCreatedAtAcrossFiles(t *testing.T) {
	dir := t.TempDir()
	withAILogDir(t, dir)
	older := filepath.Join(dir, "ai-calls-2026-01-01.log")
	newer := filepath.Join(dir, "ai-calls-2026-01-02.log")
	if err := os.WriteFile(older, []byte("{\"id\":\"a\",\"createdAt\":\"2026-01-01 10:00:00\"}\n"), 0644); err != nil {
		t.Fatalf("write log failed: %v", err)
	}
	if err := os.WriteFile(newer, []byte("{\"id\":\"b\",\"createdAt\":\"2026-01-02 10:00:00\"}\n"), 0644); err != nil {
		t.Fatalf("write log failed: %v", err)
	}
	list, err := ListAICallLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil || list.Total != 2 {
		t.Fatalf("expected two logs, got total=%d err=%v", list.Total, err)
	}
	if list.Items[0].ID != "b" || list.Items[1].ID != "a" {
		t.Fatalf("expected newest first, got %q then %q", list.Items[0].ID, list.Items[1].ID)
	}
}
