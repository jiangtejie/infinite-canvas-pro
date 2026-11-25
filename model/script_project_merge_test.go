package model

import (
	"encoding/json"
	"testing"
)

func mergeFixtureDocument() ScriptProjectDocument {
	return ScriptProjectDocument{
		SchemaVersion: 2, ID: "project-1", Title: "原稿", Format: "film", Genre: "剧情",
		Characters: []ScriptCharacter{{ID: "character-1", Name: "阿岚"}},
		Episodes: []ScriptEpisode{
			{ID: "episode-1", No: 1, Title: "第一集", Scenes: []ScriptScene{
				{ID: "scene-1", No: 1, Content: "第一场", Revision: 1, Characters: []string{}},
				{ID: "scene-2", No: 2, Content: "第二场", Revision: 1, Characters: []string{}},
			}},
			{ID: "episode-2", No: 2, Title: "第二集", Scenes: []ScriptScene{}},
		},
		Publications: []ScriptPublication{}, CreatedAt: "2026-11-25T09:00:00Z", UpdatedAt: "2026-11-25T10:00:00Z",
	}
}

func cloneMergeDocument(document ScriptProjectDocument) ScriptProjectDocument {
	data, _ := json.Marshal(document)
	var cloned ScriptProjectDocument
	_ = json.Unmarshal(data, &cloned)
	return cloned
}

func mergeChangeRequest(base, local ScriptProjectDocument, revision int64) ScriptChangeRequest {
	baseline := NewScriptSyncBaseline(base, revision)
	return ScriptChangeRequest{
		BaseRevision: revision, BaseHeaderHash: baseline.HeaderHash,
		BaseScenes: baseline.Scenes, Document: local,
	}
}

func TestMergeScriptProjectDocumentMergesIndependentScenes(t *testing.T) {
	base := mergeFixtureDocument()
	local := cloneMergeDocument(base)
	remote := cloneMergeDocument(base)
	local.Episodes[0].Scenes[0].Content = "本地第一场"
	remote.Episodes[0].Scenes[1].Content = "远端第二场"
	merged, conflicts, changed := MergeScriptProjectDocument(remote, local, mergeChangeRequest(base, local, 1), nil)
	if !changed || len(conflicts) != 0 {
		t.Fatalf("changed=%v conflicts=%#v", changed, conflicts)
	}
	if merged.Episodes[0].Scenes[0].Content != "本地第一场" || merged.Episodes[0].Scenes[1].Content != "远端第二场" {
		t.Fatalf("merged=%#v", merged.Episodes[0].Scenes)
	}
}

func TestMergeScriptProjectDocumentResolvesHeaderConflict(t *testing.T) {
	base := mergeFixtureDocument()
	local := cloneMergeDocument(base)
	remote := cloneMergeDocument(base)
	local.Title = "本地标题"
	remote.Title = "远端标题"
	request := mergeChangeRequest(base, local, 1)
	merged, conflicts, _ := MergeScriptProjectDocument(remote, local, request, nil)
	if merged.Title != "本地标题" || len(conflicts) != 1 || conflicts[0].Scope != "header" {
		t.Fatalf("merged=%#v conflicts=%#v", merged, conflicts)
	}
	request.Resolutions = []ScriptConflictResolution{{Scope: "header", Choice: "remote"}}
	merged, conflicts, _ = MergeScriptProjectDocument(remote, local, request, request.Resolutions)
	if merged.Title != "远端标题" || len(conflicts) != 0 {
		t.Fatalf("resolved merged=%#v conflicts=%#v", merged, conflicts)
	}
}

func TestMergeScriptProjectDocumentSceneConflictDefaultsRemote(t *testing.T) {
	base := mergeFixtureDocument()
	local := cloneMergeDocument(base)
	remote := cloneMergeDocument(base)
	local.Episodes[0].Scenes[0].Content = "本地内容"
	remote.Episodes[0].Scenes[0].Content = "远端内容"
	request := mergeChangeRequest(base, local, 1)
	merged, conflicts, changed := MergeScriptProjectDocument(remote, local, request, nil)
	if changed || merged.Episodes[0].Scenes[0].Content != "远端内容" || len(conflicts) != 1 {
		t.Fatalf("changed=%v merged=%#v conflicts=%#v", changed, merged.Episodes[0].Scenes[0], conflicts)
	}
	if conflicts[0].Local.(ScriptScene).Content != "本地内容" {
		t.Fatalf("local conflict side=%#v", conflicts[0].Local)
	}
	request.Resolutions = []ScriptConflictResolution{{Scope: "scene", ID: "scene-1", Choice: "local"}}
	merged, conflicts, changed = MergeScriptProjectDocument(remote, local, request, request.Resolutions)
	if !changed || merged.Episodes[0].Scenes[0].Content != "本地内容" || len(conflicts) != 0 {
		t.Fatalf("resolved changed=%v merged=%#v conflicts=%#v", changed, merged.Episodes[0].Scenes[0], conflicts)
	}
}

func TestMergeScriptProjectDocumentEqualSceneContentUsesHigherRevision(t *testing.T) {
	base := mergeFixtureDocument()
	local := cloneMergeDocument(base)
	remote := cloneMergeDocument(base)
	local.Episodes[0].Scenes[0].Revision = 4
	remote.Episodes[0].Scenes[0].Revision = 2
	merged, conflicts, changed := MergeScriptProjectDocument(remote, local, mergeChangeRequest(base, local, 1), nil)
	if len(conflicts) != 0 || !changed || merged.Episodes[0].Scenes[0].Revision != 4 {
		t.Fatalf("changed=%v conflicts=%#v scene=%#v", changed, conflicts, merged.Episodes[0].Scenes[0])
	}
}

func TestMergeScriptProjectDocumentDeleteEditConflictCanChooseDeletion(t *testing.T) {
	base := mergeFixtureDocument()
	local := cloneMergeDocument(base)
	remote := cloneMergeDocument(base)
	local.Episodes[0].Scenes = local.Episodes[0].Scenes[1:]
	remote.Episodes[0].Scenes[0].Content = "远端修改"
	request := mergeChangeRequest(base, local, 1)
	merged, conflicts, _ := MergeScriptProjectDocument(remote, local, request, nil)
	if len(conflicts) != 1 || conflicts[0].Scope != "scene" || conflicts[0].Local != nil {
		t.Fatalf("conflicts=%#v", conflicts)
	}
	if len(merged.Episodes[0].Scenes) != 2 {
		t.Fatalf("default remote deletion was not preserved: %#v", merged.Episodes[0].Scenes)
	}
	request.Resolutions = []ScriptConflictResolution{{Scope: "scene", ID: "scene-1", Choice: "local"}}
	merged, conflicts, _ = MergeScriptProjectDocument(remote, local, request, request.Resolutions)
	if len(conflicts) != 0 || len(merged.Episodes[0].Scenes) != 1 || merged.Episodes[0].Scenes[0].ID != "scene-2" {
		t.Fatalf("resolved scenes=%#v conflicts=%#v", merged.Episodes[0].Scenes, conflicts)
	}
}

func TestNewScriptSyncBaselineRecordsSceneOwnership(t *testing.T) {
	baseline := NewScriptSyncBaseline(mergeFixtureDocument(), 7)
	if baseline.Revision != 7 || baseline.HeaderHash == "" || baseline.Scenes["scene-2"].EpisodeID != "episode-1" || baseline.Scenes["scene-2"].Revision != 1 {
		t.Fatalf("baseline=%#v", baseline)
	}
}
