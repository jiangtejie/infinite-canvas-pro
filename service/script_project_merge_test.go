package service

import (
	"encoding/json"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

func cloneScriptDocument(document model.ScriptProjectDocument) model.ScriptProjectDocument {
	data, _ := json.Marshal(document)
	var cloned model.ScriptProjectDocument
	_ = json.Unmarshal(data, &cloned)
	return cloned
}

func scriptChangeRequest(base, local model.ScriptProjectDocument, revision int64) model.ScriptChangeRequest {
	baseline := model.NewScriptSyncBaseline(base, revision)
	return model.ScriptChangeRequest{
		BaseRevision: revision, BaseHeaderHash: baseline.HeaderHash,
		BaseScenes: baseline.Scenes, Document: local,
	}
}

func TestApplyScriptChangesPersistsIndependentSceneEdits(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	base := validScriptDocument()
	created, err := SaveScriptProject(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	local := cloneScriptDocument(base)
	local.Episodes[0].Scenes[0].Content = "本地第一场"
	request := scriptChangeRequest(base, local, created.Revision)
	result, err := ApplyScriptChanges(ctx, request)
	if err != nil || result.Revision != 2 || len(result.Conflicts) != 0 {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if result.Document.Episodes[0].Scenes[0].Content != "本地第一场" {
		t.Fatalf("document=%#v", result.Document)
	}
	stored, err := CurrentScriptProject(ctx, base.ID)
	if err != nil || stored.Revision != 2 || stored.Document.Episodes[0].Scenes[0].Content != "本地第一场" {
		t.Fatalf("stored=%#v err=%v", stored, err)
	}
}

func TestApplyScriptChangesKeepsConflictWithoutIncrementingRevision(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	base := validScriptDocument()
	created, err := SaveScriptProject(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	remote := cloneScriptDocument(base)
	remote.Episodes[0].Scenes[0].Content = "远端内容"
	remoteItem := scriptStoredProject(t, remote, created.Revision)
	local := cloneScriptDocument(base)
	local.Episodes[0].Scenes[0].Content = "本地内容"
	result, err := ApplyScriptChanges(ctx, scriptChangeRequest(base, local, created.Revision))
	if err != nil || result.Revision != remoteItem.Revision || len(result.Conflicts) != 1 {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if result.Document.Episodes[0].Scenes[0].Content != "远端内容" {
		t.Fatalf("remote scene overwritten: %#v", result.Document.Episodes[0].Scenes[0])
	}
}

func TestApplyScriptChangesAppliesResolutionAndRejectsFutureBase(t *testing.T) {
	setupScriptServiceDB(t)
	ctx := marketingContext("owner-a")
	base := validScriptDocument()
	created, err := SaveScriptProject(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	remote := cloneScriptDocument(base)
	remote.Episodes[0].Scenes[0].Content = "远端内容"
	remoteItem := scriptStoredProject(t, remote, created.Revision)
	local := cloneScriptDocument(base)
	local.Episodes[0].Scenes[0].Content = "本地内容"
	request := scriptChangeRequest(base, local, created.Revision)
	request.Resolutions = []model.ScriptConflictResolution{{Scope: "scene", ID: "scene-1", Choice: "local"}}
	result, err := ApplyScriptChanges(ctx, request)
	if err != nil || result.Revision != remoteItem.Revision+1 || len(result.Conflicts) != 0 || result.Document.Episodes[0].Scenes[0].Content != "本地内容" {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	request.BaseRevision = result.Revision + 1
	if _, err := ApplyScriptChanges(ctx, request); err == nil {
		t.Fatal("future base revision was accepted")
	}
}

func TestApplyScriptChangesRejectsOtherOwner(t *testing.T) {
	setupScriptServiceDB(t)
	base := validScriptDocument()
	created, err := SaveScriptProject(marketingContext("owner-a"), base)
	if err != nil {
		t.Fatal(err)
	}
	request := scriptChangeRequest(base, base, created.Revision)
	if _, err := ApplyScriptChanges(marketingContext("owner-b"), request); err == nil {
		t.Fatal("other owner changed project")
	}
}

func scriptStoredProject(t *testing.T, document model.ScriptProjectDocument, revision int64) model.ScriptProject {
	t.Helper()
	item, err := repository.GetScriptProject("owner-a", document.ID)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	summary := model.SummarizeScriptProjectDocument(document)
	item.Title, item.Format, item.Genre, item.Logline = summary.Title, summary.Format, summary.Genre, summary.Logline
	item.EpisodeCount, item.SceneCount, item.CharacterCount, item.WordCount = summary.EpisodeCount, summary.SceneCount, summary.CharacterCount, summary.WordCount
	item.LockedEpisodeCount, item.HasPublication, item.PublicationStale = summary.LockedEpisodeCount, summary.HasPublication, summary.PublicationStale
	item.Data, item.UpdatedAt, item.Revision = string(data), document.UpdatedAt, revision+1
	if err := repository.UpdateScriptProject(item, revision); err != nil {
		t.Fatal(err)
	}
	return item
}
