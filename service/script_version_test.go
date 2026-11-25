package service

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"gorm.io/gorm"
)

func validScriptVersion(document model.ScriptProjectDocument, kind string) model.ScriptVersionPayload {
	snapshot := model.SnapshotScriptContent(document)
	return model.ScriptVersionPayload{
		ID: "version-" + kind, ProjectID: document.ID, Scope: "project", Label: kind,
		Kind: kind, Hash: model.ScriptTextHash(model.ExportScriptText(snapshot)),
		Data: snapshot, CreatedAt: "2026-11-25T11:00:00Z",
	}
}

func TestScriptVersionLockAndDeleteInvariant(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	project, err := SaveScriptProject(ctx, validScriptDocument())
	if err != nil {
		t.Fatal(err)
	}
	version := validScriptVersion(project.Document, "locked")
	created, err := CreateScriptVersion(ctx, model.ScriptVersionCreateRequest{Version: version, ActivateLock: true, BaseRevision: project.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if created.Document.LockedVersionID != version.ID || created.Document.LockedVersionHash != version.Hash {
		t.Fatalf("lock pair=%#v", created.Document)
	}
	if err := DeleteScriptVersion(ctx, project.Document.ID, version.ID, created.Revision); err == nil {
		t.Fatal("current locked version was deleted")
	}
}

func TestScriptVersionCreateIsIdempotentAndRejectsHashMismatch(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	project, err := SaveScriptProject(ctx, validScriptDocument())
	if err != nil {
		t.Fatal(err)
	}
	version := validScriptVersion(project.Document, "manual")
	request := model.ScriptVersionCreateRequest{Version: version, BaseRevision: project.Revision}
	first, err := CreateScriptVersion(ctx, request)
	if err != nil || first.Revision != project.Revision {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	retried, err := CreateScriptVersion(ctx, request)
	if err != nil || retried.Revision != first.Revision {
		t.Fatalf("retry=%#v err=%v", retried, err)
	}
	version.Hash = "wrong"
	request.Version = version
	if _, err := CreateScriptVersion(ctx, request); err == nil {
		t.Fatal("mismatched content hash was accepted")
	}
	version = validScriptVersion(project.Document, "manual")
	version.Data.Title = "篡改快照"
	version.Hash = model.ScriptTextHash(model.ExportScriptText(version.Data))
	request.Version = version
	if _, err := CreateScriptVersion(ctx, request); err == nil {
		t.Fatal("same version ID with different content was accepted")
	}
}

func TestScriptVersionEpisodeRestoreCreatesSafetyAndIsRetryable(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	project, err := SaveScriptProject(ctx, validScriptDocument())
	if err != nil {
		t.Fatal(err)
	}
	version := validScriptVersion(project.Document, "locked")
	version.Scope = "episode"
	version.EpisodeID = "episode-1"
	version.Data.Episodes = version.Data.Episodes[:1]
	version.Hash = model.ScriptTextHash(model.ExportScriptText(version.Data))
	created, err := CreateScriptVersion(ctx, model.ScriptVersionCreateRequest{Version: version, ActivateLock: true, BaseRevision: project.Revision})
	if err != nil || created.Document.LockedVersionID != "" || created.Document.Episodes[0].LockedVersionID != version.ID {
		t.Fatalf("created=%#v err=%v", created, err)
	}
	changed := cloneScriptDocument(created.Document)
	changed.Episodes[0].Scenes[0].Content = "恢复后需要覆盖的内容"
	remote := scriptStoredProject(t, changed, created.Revision)
	restored, err := RestoreScriptVersion(ctx, project.Document.ID, version.ID, model.ScriptVersionRestoreRequest{BaseRevision: remote.Revision})
	if err != nil || restored.Revision != remote.Revision+1 {
		t.Fatalf("restored=%#v err=%v", restored, err)
	}
	if restored.Document.Episodes[0].Scenes[0].Content != "第一场正文" || restored.Document.Episodes[0].Scenes[0].Revision != 2 {
		t.Fatalf("restored scene=%#v", restored.Document.Episodes[0].Scenes[0])
	}
	if restored.Document.Episodes[0].LockedVersionID != version.ID {
		t.Fatalf("current episode lock was not preserved: %#v", restored.Document.Episodes[0])
	}
	items, err := ListScriptVersions(ctx, project.Document.ID)
	if err != nil {
		t.Fatal(err)
	}
	var safetyCount int
	for _, item := range items {
		if item.Kind == "safety" {
			safetyCount++
		}
	}
	if safetyCount != 1 {
		t.Fatalf("versions=%#v", items)
	}
	retried, err := RestoreScriptVersion(ctx, project.Document.ID, version.ID, model.ScriptVersionRestoreRequest{BaseRevision: remote.Revision})
	if err != nil || retried.Revision != restored.Revision {
		t.Fatalf("retry=%#v err=%v", retried, err)
	}
}

func TestScriptVersionProjectRestoreClearsStaleLock(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	project, err := SaveScriptProject(ctx, validScriptDocument())
	if err != nil {
		t.Fatal(err)
	}
	version := validScriptVersion(project.Document, "locked")
	created, err := CreateScriptVersion(ctx, model.ScriptVersionCreateRequest{Version: version, ActivateLock: true, BaseRevision: project.Revision})
	if err != nil {
		t.Fatal(err)
	}
	manual := validScriptVersion(created.Document, "manual")
	manual.ID = "version-current"
	if _, err := CreateScriptVersion(ctx, model.ScriptVersionCreateRequest{Version: manual, ActivateLock: true, BaseRevision: created.Revision}); err != nil {
		t.Fatal(err)
	}
	restored, err := RestoreScriptVersion(ctx, project.Document.ID, version.ID, model.ScriptVersionRestoreRequest{BaseRevision: created.Revision + 1})
	if err != nil {
		t.Fatal(err)
	}
	if restored.Document.LockedVersionID != "" || restored.Document.LockedVersionHash != "" {
		t.Fatalf("stale project lock restored: %#v", restored.Document)
	}
}

func TestScriptVersionDeleteProtectsPublicationAndIsIdempotent(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	project, err := SaveScriptProject(ctx, validScriptDocument())
	if err != nil {
		t.Fatal(err)
	}
	version := validScriptVersion(project.Document, "manual")
	if _, err := CreateScriptVersion(ctx, model.ScriptVersionCreateRequest{Version: version, BaseRevision: project.Revision}); err != nil {
		t.Fatal(err)
	}
	published := cloneScriptDocument(project.Document)
	published.Publications = []model.ScriptPublication{{ID: "publication-1", EpisodeIDs: []string{"episode-1"}, SourceVersionIDs: []string{version.ID}, SourceHash: "hash", Status: "published"}}
	remote := scriptStoredProject(t, published, project.Revision)
	if err := DeleteScriptVersion(ctx, project.Document.ID, version.ID, remote.Revision); err == nil {
		t.Fatal("published source version was deleted")
	}
	clean := cloneScriptDocument(published)
	clean.Publications = []model.ScriptPublication{}
	remote = scriptStoredProject(t, clean, remote.Revision)
	if err := DeleteScriptVersion(ctx, project.Document.ID, version.ID, remote.Revision); err != nil {
		t.Fatal(err)
	}
	if err := DeleteScriptVersion(ctx, project.Document.ID, version.ID, remote.Revision); err != nil {
		t.Fatalf("repeat delete: %v", err)
	}
}

func TestScriptVersionSnapshotJSONContainsNoLocksOrPublications(t *testing.T) {
	document := validScriptDocument()
	document.LockedVersionID, document.LockedVersionHash = "locked", "hash"
	document.Episodes[0].LockedVersionID, document.Episodes[0].LockedVersionHash = "episode-lock", "episode-hash"
	document.Publications = []model.ScriptPublication{{ID: "publication-1"}}
	data, err := json.Marshal(model.SnapshotScriptContent(document))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "lockedVersion") || strings.Contains(string(data), "publications") {
		t.Fatalf("snapshot leaked non-content fields: %s", data)
	}
}

func TestScriptVersionMissingProjectIsNotFound(t *testing.T) {
	setupScriptServiceDB(t)
	_, err := GetScriptVersion(marketingContext("owner-a"), "missing", "missing")
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("error=%v", err)
	}
}
