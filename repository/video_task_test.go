package repository

import (
	"testing"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func setupVideoTaskDB(t *testing.T) {
	t.Helper()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	if _, err := DB(); err != nil {
		t.Fatal(err)
	}
	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Where("1 = 1").Delete(&model.VideoTask{}).Error; err != nil {
		t.Fatal(err)
	}
}

func TestListDueVideoTasksRotatesByLastPolledAt(t *testing.T) {
	setupVideoTaskDB(t)
	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	nowTime := time.Now().UTC()
	created := func(id string, createdAt string, lastPolledAt string) {
		task := model.VideoTask{
			ID: id, UserID: "u1", Status: "running", Model: "m1",
			CreatedAt: createdAt, UpdatedAt: createdAt, LastPolledAt: lastPolledAt,
		}
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	created("old-1", "2026-11-01T00:00:00Z", "")
	created("old-2", "2026-11-02T00:00:00Z", "")
	created("polled", "2026-11-03T00:00:00Z", nowTime.Format(time.RFC3339Nano))

	dueBefore := nowTime.Add(-5 * time.Second).Format(time.RFC3339Nano)
	tasks, err := ListDueVideoTasks(dueBefore, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 2 {
		t.Fatalf("expected two due tasks, got %d", len(tasks))
	}
	// 从未轮询过的任务按创建时间排在前面，刚轮询过的任务本轮不返回。
	seen := map[string]bool{}
	for _, task := range tasks {
		seen[task.ID] = true
	}
	if !seen["old-1"] || !seen["old-2"] || seen["polled"] {
		t.Fatalf("unexpected rotation: %v", seen)
	}

	active, err := HasActiveVideoTasks()
	if err != nil || !active {
		t.Fatalf("expected active video tasks, got active=%v err=%v", active, err)
	}
	if err := db.Model(&model.VideoTask{}).Where("1 = 1").Update("status", "completed").Error; err != nil {
		t.Fatal(err)
	}
	active, err = HasActiveVideoTasks()
	if err != nil || active {
		t.Fatalf("expected no active video tasks, got active=%v err=%v", active, err)
	}
}
