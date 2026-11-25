package service

import (
	"errors"
	"sync"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"gorm.io/gorm"
)

var scriptDBTestLock sync.Mutex

func setupScriptServiceDB(t *testing.T) {
	t.Helper()
	scriptDBTestLock.Lock()
	t.Cleanup(scriptDBTestLock.Unlock)
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []any{&model.ScriptVersion{}, &model.ScriptProject{}} {
		if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(table).Error; err != nil {
			t.Fatal(err)
		}
	}
}

func validScriptDocument() model.ScriptProjectDocument {
	return model.ScriptProjectDocument{
		SchemaVersion: 2,
		ID:            "project-1",
		Title:         "长街短梦",
		Format:        "film",
		Genre:         "剧情",
		Logline:       "一个雨夜，两家小店命运交汇。",
		Characters: []model.ScriptCharacter{{
			ID: "character-1", Name: "阿岚", Role: "店主", Want: "保住店铺", Need: "接受变化", Flaw: "固执", Arc: "学会放手", Description: "冷静的年轻店主",
		}},
		Episodes: []model.ScriptEpisode{
			{
				ID: "episode-1", No: 1, Title: "雨夜",
				Scenes: []model.ScriptScene{
					{ID: "scene-1", No: 1, InteriorExterior: "内景", Location: "旧书店", TimeOfDay: "夜", Characters: []string{"阿岚"}, Goal: "修好漏水", Conflict: "停电", Turn: "陌生人敲门", Outcome: "一起点灯", Summary: "雨夜相遇", Content: "第一场正文", Notes: "保留窗声", Revision: 1, UpdatedAt: "2026-11-25T10:00:00Z"},
					{ID: "scene-2", No: 2, InteriorExterior: "外景", Location: "长街", TimeOfDay: "夜", Characters: []string{}, Goal: "送走客人", Conflict: "店门锁死", Turn: "发现侧门", Outcome: "离开", Summary: "送别", Content: "第二场", Notes: "", Revision: 1, UpdatedAt: "2026-11-25T10:01:00Z"},
				},
			},
			{ID: "episode-2", No: 2, Title: "天明", Scenes: []model.ScriptScene{}},
		},
		Publications: []model.ScriptPublication{},
		CreatedAt:    "2026-11-25T09:00:00Z",
		UpdatedAt:    "2026-11-25T10:00:00Z",
	}
}

func TestScriptProjectOwnerIsolationAndSummary(t *testing.T) {
	setupScriptServiceDB(t)
	document := validScriptDocument()
	created, err := SaveScriptProject(marketingContext("owner-a"), document)
	if err != nil || created.Revision != 1 {
		t.Fatalf("create: %#v err=%v", created, err)
	}
	if _, err := CurrentScriptProject(marketingContext("owner-b"), document.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("other owner read error=%v", err)
	}
	items, err := ListScriptProjects(marketingContext("owner-a"))
	if err != nil || len(items) != 1 || items[0].SceneCount != 2 || items[0].EpisodeCount != 2 || items[0].CharacterCount != 1 || items[0].WordCount != 8 {
		t.Fatalf("summary=%#v err=%v", items, err)
	}
	retried, err := SaveScriptProject(marketingContext("owner-a"), document)
	if err != nil || retried.Revision != created.Revision {
		t.Fatalf("idempotent create=%#v err=%v", retried, err)
	}
}

func TestScriptProjectRejectsDifferentCreateWithoutOverwrite(t *testing.T) {
	setupScriptServiceDB(t)
	document := validScriptDocument()
	created, err := SaveScriptProject(marketingContext("owner-a"), document)
	if err != nil {
		t.Fatal(err)
	}
	document.Title = "另一部剧本"
	if _, err := SaveScriptProject(marketingContext("owner-a"), document); err == nil {
		t.Fatal("different document replaced an existing project")
	}
	current, err := CurrentScriptProject(marketingContext("owner-a"), document.ID)
	if err != nil || current.Document.Title != created.Document.Title || current.Revision != 1 {
		t.Fatalf("current=%#v err=%v", current, err)
	}
}

func TestScriptProjectValidatesDocumentInvariants(t *testing.T) {
	setupScriptServiceDB(t)
	cases := map[string]func(*model.ScriptProjectDocument){
		"schema":   func(item *model.ScriptProjectDocument) { item.SchemaVersion = 1 },
		"empty id": func(item *model.ScriptProjectDocument) { item.ID = "" },
		"episodes": func(item *model.ScriptProjectDocument) { item.Episodes = nil },
		"scene no": func(item *model.ScriptProjectDocument) { item.Episodes[0].Scenes[1].No = 3 },
		"scene id": func(item *model.ScriptProjectDocument) { item.Episodes[0].Scenes[1].ID = item.Episodes[0].Scenes[0].ID },
		"project lock": func(item *model.ScriptProjectDocument) {
			item.LockedVersionID = "version-1"
		},
		"episode lock": func(item *model.ScriptProjectDocument) {
			item.Episodes[0].LockedVersionHash = "hash"
		},
		"publication": func(item *model.ScriptProjectDocument) {
			item.Publications = []model.ScriptPublication{{ID: "publication-1"}}
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			document := validScriptDocument()
			document.ID = "project-" + name
			mutate(&document)
			if _, err := SaveScriptProject(marketingContext("owner-a"), document); err == nil {
				t.Fatal("invalid document was accepted")
			}
		})
	}
}

func TestScriptProjectDeleteTombstoneIsIdempotentAndHidden(t *testing.T) {
	setupScriptServiceDB(t)
	document := validScriptDocument()
	created, err := SaveScriptProject(marketingContext("owner-a"), document)
	if err != nil {
		t.Fatal(err)
	}
	if err := DeleteScriptProject(marketingContext("owner-a"), document.ID, created.Revision); err != nil {
		t.Fatal(err)
	}
	if err := DeleteScriptProject(marketingContext("owner-a"), document.ID, created.Revision); err != nil {
		t.Fatalf("repeat delete: %v", err)
	}
	if _, err := CurrentScriptProject(marketingContext("owner-a"), document.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("deleted project read error=%v", err)
	}
	items, err := ListScriptProjects(marketingContext("owner-a"))
	if err != nil || len(items) != 0 {
		t.Fatalf("deleted project listed: %#v err=%v", items, err)
	}
}
