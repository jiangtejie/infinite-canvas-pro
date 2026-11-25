package service

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"gorm.io/gorm"
)

const maxScriptProjectBytes = 8 << 20

type scriptProjectError string

func (e scriptProjectError) Error() string       { return string(e) }
func (e scriptProjectError) SafeMessage() string { return string(e) }

func scriptUser(ctx context.Context) (string, error) {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" {
		return "", scriptProjectError("请先登录")
	}
	return user.ID, nil
}

func ListScriptProjects(ctx context.Context) ([]model.ScriptProjectSummary, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return nil, err
	}
	return repository.ListScriptProjects(userID)
}

func CurrentScriptProject(ctx context.Context, id string) (model.ScriptProjectView, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	item, err := repository.GetScriptProject(userID, id)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	return scriptProjectView(item)
}

func SaveScriptProject(ctx context.Context, document model.ScriptProjectDocument) (model.ScriptProjectView, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	if err := validateNewScriptDocument(document); err != nil {
		return model.ScriptProjectView{}, err
	}
	data, err := json.Marshal(document)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	if len(data) > maxScriptProjectBytes {
		return model.ScriptProjectView{}, scriptProjectError("剧本内容不能超过 8 MB")
	}
	summary := model.SummarizeScriptProjectDocument(document)
	summary.Revision = 1
	item := model.ScriptProject{
		UserID: userID, ID: document.ID, Title: summary.Title, Format: summary.Format,
		Genre: summary.Genre, Logline: summary.Logline, EpisodeCount: summary.EpisodeCount,
		SceneCount: summary.SceneCount, CharacterCount: summary.CharacterCount, WordCount: summary.WordCount,
		LockedEpisodeCount: summary.LockedEpisodeCount, HasPublication: summary.HasPublication,
		PublicationStale: summary.PublicationStale, Revision: 1, Data: string(data),
		CreatedAt: document.CreatedAt, UpdatedAt: document.UpdatedAt,
	}
	if err := repository.CreateScriptProject(item); err != nil {
		if !errors.Is(err, repository.ErrScriptProjectConflict) {
			return model.ScriptProjectView{}, err
		}
		existing, getErr := repository.GetScriptProject(userID, document.ID)
		if getErr != nil {
			return model.ScriptProjectView{}, getErr
		}
		var current model.ScriptProjectDocument
		if err := json.Unmarshal([]byte(existing.Data), &current); err != nil {
			return model.ScriptProjectView{}, err
		}
		if model.ScriptDataHash(current) != model.ScriptDataHash(document) {
			return model.ScriptProjectView{}, scriptProjectError("剧本编号已存在且内容不同，请新建项目")
		}
		return scriptProjectView(existing)
	}
	return scriptProjectView(item)
}

func ApplyScriptChanges(ctx context.Context, request model.ScriptChangeRequest) (model.ScriptChangeResponse, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return model.ScriptChangeResponse{}, err
	}
	if err := validateScriptDocument(request.Document); err != nil {
		return model.ScriptChangeResponse{}, err
	}
	if request.BaseRevision < 1 || request.BaseHeaderHash == "" {
		return model.ScriptChangeResponse{}, scriptProjectError("剧本同步基线无效")
	}
	for _, resolution := range request.Resolutions {
		if resolution.Scope != "header" && resolution.Scope != "scene" || resolution.Choice != "local" && resolution.Choice != "remote" || resolution.Scope == "scene" && resolution.ID == "" {
			return model.ScriptChangeResponse{}, scriptProjectError("剧本冲突处理方式无效")
		}
	}
	var response model.ScriptChangeResponse
	err = repository.WithScriptProjectTx(userID, request.Document.ID, func(tx *gorm.DB, item model.ScriptProject) error {
		if request.BaseRevision > item.Revision {
			return scriptProjectError("同步基线高于服务器版本，请刷新后重试")
		}
		var remote model.ScriptProjectDocument
		if err := json.Unmarshal([]byte(item.Data), &remote); err != nil {
			return err
		}
		merged, conflicts, changed := model.MergeScriptProjectDocument(remote, request.Document, request, request.Resolutions)
		revision := item.Revision
		if changed {
			merged.UpdatedAt = now()
			data, err := json.Marshal(merged)
			if err != nil {
				return err
			}
			if len(data) > maxScriptProjectBytes {
				return scriptProjectError("剧本内容不能超过 8 MB")
			}
			summary := model.SummarizeScriptProjectDocument(merged)
			item.Title, item.Format, item.Genre, item.Logline = summary.Title, summary.Format, summary.Genre, summary.Logline
			item.EpisodeCount, item.SceneCount, item.CharacterCount, item.WordCount = summary.EpisodeCount, summary.SceneCount, summary.CharacterCount, summary.WordCount
			item.LockedEpisodeCount, item.HasPublication, item.PublicationStale = summary.LockedEpisodeCount, summary.HasPublication, summary.PublicationStale
			item.Data, item.UpdatedAt, item.Revision = string(data), merged.UpdatedAt, item.Revision+1
			if err := repository.UpdateScriptProjectTx(tx, item, revision); err != nil {
				if errors.Is(err, repository.ErrScriptRevisionConflict) {
					return scriptProjectError("剧本已在其他页面更新，请刷新后重试")
				}
				return err
			}
			revision = item.Revision
		}
		response = model.ScriptChangeResponse{Document: merged, Revision: revision, Conflicts: conflicts}
		return nil
	})
	return response, err
}

func DeleteScriptProject(ctx context.Context, id string, revision int64) error {
	userID, err := scriptUser(ctx)
	if err != nil {
		return err
	}
	if revision < 1 {
		return scriptProjectError("请刷新剧本后再删除")
	}
	err = repository.DeleteScriptProject(userID, id, revision)
	if errors.Is(err, repository.ErrScriptRevisionConflict) {
		return scriptProjectError("剧本已在其他页面更新，请刷新后再删除")
	}
	return err
}

func scriptProjectView(item model.ScriptProject) (model.ScriptProjectView, error) {
	var document model.ScriptProjectDocument
	if err := json.Unmarshal([]byte(item.Data), &document); err != nil {
		return model.ScriptProjectView{}, err
	}
	return model.ScriptProjectView{Document: document, Revision: item.Revision}, nil
}

func validateNewScriptDocument(document model.ScriptProjectDocument) error {
	if err := validateScriptDocument(document); err != nil {
		return err
	}
	if len(document.Publications) != 0 {
		return scriptProjectError("新剧本不能包含发布记录")
	}
	return nil
}

func validateScriptDocument(document model.ScriptProjectDocument) error {
	if document.ID == "" || len(document.ID) > 48 {
		return scriptProjectError("剧本编号无效")
	}
	if document.SchemaVersion != 2 {
		return scriptProjectError("剧本数据结构版本无效")
	}
	if len(document.Episodes) == 0 {
		return scriptProjectError("剧本至少需要一集")
	}
	if (document.LockedVersionID == "") != (document.LockedVersionHash == "") {
		return scriptProjectError("剧本锁定版本编号与哈希须同时提供")
	}
	episodeIDs := make(map[string]bool, len(document.Episodes))
	characterIDs := make(map[string]bool, len(document.Characters))
	sceneIDs := make(map[string]bool)
	for _, character := range document.Characters {
		if character.ID == "" || characterIDs[character.ID] {
			return scriptProjectError("人物编号须唯一且不能为空")
		}
		characterIDs[character.ID] = true
	}
	for _, episode := range document.Episodes {
		if episode.ID == "" || episodeIDs[episode.ID] {
			return scriptProjectError("剧集编号须唯一且不能为空")
		}
		episodeIDs[episode.ID] = true
		if (episode.LockedVersionID == "") != (episode.LockedVersionHash == "") {
			return scriptProjectError("剧集锁定版本编号与哈希须同时提供")
		}
		for index, scene := range episode.Scenes {
			if scene.ID == "" || sceneIDs[scene.ID] {
				return scriptProjectError("场次编号须全局唯一且不能为空")
			}
			sceneIDs[scene.ID] = true
			if scene.No != index+1 {
				return scriptProjectError("每集场次编号须从 1 开始连续排列")
			}
		}
	}
	return nil
}

func ListScriptVersions(ctx context.Context, projectID string) ([]model.ScriptVersionSummary, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return nil, err
	}
	var items []model.ScriptVersionSummary
	err = repository.WithScriptProjectTx(userID, projectID, func(tx *gorm.DB, _ model.ScriptProject) error {
		var listErr error
		items, listErr = repository.ListScriptVersions(tx, userID, projectID)
		return listErr
	})
	return items, err
}

func GetScriptVersion(ctx context.Context, projectID, versionID string) (model.ScriptVersionPayload, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return model.ScriptVersionPayload{}, err
	}
	var payload model.ScriptVersionPayload
	err = repository.WithScriptProjectTx(userID, projectID, func(tx *gorm.DB, _ model.ScriptProject) error {
		item, getErr := repository.GetScriptVersion(tx, userID, projectID, versionID)
		if getErr != nil {
			return getErr
		}
		payload, getErr = scriptVersionPayload(item)
		return getErr
	})
	return payload, err
}

func CreateScriptVersion(ctx context.Context, request model.ScriptVersionCreateRequest) (model.ScriptProjectView, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	payload, hash, err := validateScriptVersionPayload(request.Version)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	if request.BaseRevision < 1 {
		return model.ScriptProjectView{}, scriptProjectError("剧本版本基线无效")
	}
	var response model.ScriptProjectView
	err = repository.WithScriptProjectTx(userID, payload.ProjectID, func(tx *gorm.DB, item model.ScriptProject) error {
		if request.BaseRevision > item.Revision {
			return scriptProjectError("剧本版本基线高于服务器版本，请刷新后重试")
		}
		var document model.ScriptProjectDocument
		if err := json.Unmarshal([]byte(item.Data), &document); err != nil {
			return err
		}
		existing, getErr := repository.GetScriptVersion(tx, userID, payload.ProjectID, payload.ID)
		if getErr == nil {
			if !scriptVersionMatches(existing, payload, hash) {
				return scriptProjectError("版本编号已存在且内容不同")
			}
			response = model.ScriptProjectView{Document: document, Revision: item.Revision}
			return nil
		}
		if !errors.Is(getErr, gorm.ErrRecordNotFound) {
			return getErr
		}
		version, err := scriptVersionRecord(userID, payload, hash, scriptVersionTimestamp())
		if err != nil {
			return err
		}
		if err := repository.CreateScriptVersion(tx, version); err != nil {
			return err
		}
		if request.ActivateLock {
			if request.BaseRevision != item.Revision {
				return scriptProjectError("锁定版本前请刷新剧本")
			}
			activateScriptLock(&document, payload)
			document.UpdatedAt = scriptVersionTimestamp()
			item.Revision++
			if err := writeScriptProjectDocument(tx, &item, document); err != nil {
				return err
			}
			if err := repository.UpdateScriptProjectTx(tx, item, item.Revision-1); err != nil {
				return err
			}
		}
		response = model.ScriptProjectView{Document: document, Revision: item.Revision}
		return nil
	})
	return response, err
}

func RestoreScriptVersion(ctx context.Context, projectID, versionID string, request model.ScriptVersionRestoreRequest) (model.ScriptProjectView, error) {
	userID, err := scriptUser(ctx)
	if err != nil {
		return model.ScriptProjectView{}, err
	}
	if request.BaseRevision < 1 {
		return model.ScriptProjectView{}, scriptProjectError("剧本恢复基线无效")
	}
	safetyID := "safety-" + model.ScriptDataHash(versionID+":"+strconv.FormatInt(request.BaseRevision, 10))
	var response model.ScriptProjectView
	err = repository.WithScriptProjectTx(userID, projectID, func(tx *gorm.DB, item model.ScriptProject) error {
		var document model.ScriptProjectDocument
		if err := json.Unmarshal([]byte(item.Data), &document); err != nil {
			return err
		}
		if _, err := repository.GetScriptVersion(tx, userID, projectID, safetyID); err == nil {
			response = model.ScriptProjectView{Document: document, Revision: item.Revision}
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if request.BaseRevision != item.Revision {
			return scriptProjectError("剧本已在其他页面更新，请刷新后再恢复")
		}
		version, err := repository.GetScriptVersion(tx, userID, projectID, versionID)
		if err != nil {
			return err
		}
		payload, err := scriptVersionPayload(version)
		if err != nil {
			return err
		}
		safetyData := model.SnapshotScriptContent(document)
		if payload.Scope == "episode" {
			episodes := make([]model.ScriptEpisode, 0, 1)
			for _, episode := range safetyData.Episodes {
				if episode.ID == payload.EpisodeID {
					episodes = append(episodes, episode)
				}
			}
			safetyData.Episodes = episodes
		}
		safety := model.ScriptVersionPayload{
			ID: safetyID, ProjectID: projectID, Scope: payload.Scope, EpisodeID: payload.EpisodeID,
			Label: "恢复前", Kind: "safety", Hash: model.ScriptTextHash(model.ExportScriptText(safetyData)),
			Data: safetyData, CreatedAt: scriptVersionTimestamp(),
		}
		safetyRecord, err := scriptVersionRecord(userID, safety, safety.Hash, safety.CreatedAt)
		if err != nil {
			return err
		}
		if err := repository.CreateScriptVersion(tx, safetyRecord); err != nil {
			return err
		}
		document, err = restoreScriptDocument(document, payload, version.ID, version.Hash)
		if err != nil {
			return err
		}
		if err := validateScriptDocument(document); err != nil {
			return err
		}
		document.UpdatedAt = scriptVersionTimestamp()
		item.Revision++
		if err := writeScriptProjectDocument(tx, &item, document); err != nil {
			return err
		}
		if err := repository.UpdateScriptProjectTx(tx, item, item.Revision-1); err != nil {
			return err
		}
		safeties, err := repository.ListScriptSafetyVersions(tx, userID, projectID)
		if err != nil {
			return err
		}
		if len(safeties) > 3 {
			for _, older := range safeties[3:] {
				if err := repository.TombstoneScriptVersion(tx, userID, projectID, older.ID); err != nil {
					return err
				}
			}
		}
		response = model.ScriptProjectView{Document: document, Revision: item.Revision}
		return nil
	})
	return response, err
}

func DeleteScriptVersion(ctx context.Context, projectID, versionID string, baseRevision int64) error {
	userID, err := scriptUser(ctx)
	if err != nil {
		return err
	}
	if baseRevision < 1 {
		return scriptProjectError("剧本版本基线无效")
	}
	return repository.WithScriptProjectTx(userID, projectID, func(tx *gorm.DB, item model.ScriptProject) error {
		version, err := repository.GetScriptVersionRecord(tx, userID, projectID, versionID)
		if err != nil {
			return err
		}
		if version.DeletedAt != "" {
			return nil
		}
		if baseRevision != item.Revision {
			return scriptProjectError("剧本已在其他页面更新，请刷新后再删除版本")
		}
		var document model.ScriptProjectDocument
		if err := json.Unmarshal([]byte(item.Data), &document); err != nil {
			return err
		}
		if document.LockedVersionID == versionID {
			return scriptProjectError("当前项目锁定版本不能删除")
		}
		for _, episode := range document.Episodes {
			if episode.LockedVersionID == versionID {
				return scriptProjectError("当前本集锁定版本不能删除")
			}
		}
		for _, publication := range document.Publications {
			for _, sourceID := range publication.SourceVersionIDs {
				if sourceID == versionID {
					return scriptProjectError("已发布来源版本不能删除")
				}
			}
		}
		if err := repository.TombstoneScriptVersion(tx, userID, projectID, versionID); err != nil {
			return err
		}
		document.UpdatedAt = scriptVersionTimestamp()
		item.Revision++
		if err := writeScriptProjectDocument(tx, &item, document); err != nil {
			return err
		}
		return repository.UpdateScriptProjectTx(tx, item, item.Revision-1)
	})
}

func validateScriptVersionPayload(payload model.ScriptVersionPayload) (model.ScriptVersionPayload, string, error) {
	if payload.ID == "" || len(payload.ID) > 48 || payload.ProjectID == "" || len(payload.ProjectID) > 48 {
		return payload, "", scriptProjectError("版本编号或项目编号无效")
	}
	if payload.Scope != "project" && payload.Scope != "episode" || payload.Scope == "episode" && payload.EpisodeID == "" || payload.Scope == "project" && payload.EpisodeID != "" {
		return payload, "", scriptProjectError("版本范围无效")
	}
	if payload.Kind != "manual" && payload.Kind != "locked" {
		return payload, "", scriptProjectError("公开请求只能创建手动或锁定版本")
	}
	payload.Label = strings.TrimSpace(payload.Label)
	if payload.Label == "" {
		payload.Label = "未命名版本"
	}
	if len(payload.Data.Episodes) == 0 {
		return payload, "", scriptProjectError("版本快照至少需要一集")
	}
	if payload.Scope == "episode" && (len(payload.Data.Episodes) != 1 || payload.Data.Episodes[0].ID != payload.EpisodeID) {
		return payload, "", scriptProjectError("本集版本快照与目标剧集不一致")
	}
	episodeIDs, sceneIDs, characterIDs := make(map[string]bool), make(map[string]bool), make(map[string]bool)
	for _, character := range payload.Data.Characters {
		if character.ID == "" || characterIDs[character.ID] {
			return payload, "", scriptProjectError("版本快照人物编号须唯一")
		}
		characterIDs[character.ID] = true
	}
	for _, episode := range payload.Data.Episodes {
		if episode.ID == "" || episodeIDs[episode.ID] {
			return payload, "", scriptProjectError("版本快照剧集编号须唯一")
		}
		episodeIDs[episode.ID] = true
		for index, scene := range episode.Scenes {
			if scene.ID == "" || sceneIDs[scene.ID] || scene.No != index+1 {
				return payload, "", scriptProjectError("版本快照场次编号无效")
			}
			sceneIDs[scene.ID] = true
		}
	}
	hash := model.ScriptTextHash(model.ExportScriptText(payload.Data))
	if payload.Hash != hash {
		return payload, "", scriptProjectError("版本内容哈希不匹配")
	}
	data, err := json.Marshal(payload.Data)
	if err != nil {
		return payload, "", err
	}
	if len(data) > 16<<20 {
		return payload, "", scriptProjectError("版本快照不能超过 16 MB")
	}
	return payload, hash, nil
}

func scriptVersionMatches(item model.ScriptVersion, payload model.ScriptVersionPayload, hash string) bool {
	if item.Scope != payload.Scope || item.EpisodeID != payload.EpisodeID || item.Kind != payload.Kind || item.Label != payload.Label || item.Hash != hash {
		return false
	}
	var existing model.ScriptContentSnapshot
	return json.Unmarshal([]byte(item.Data), &existing) == nil && model.ScriptDataHash(existing) == model.ScriptDataHash(payload.Data)
}

func scriptVersionRecord(userID string, payload model.ScriptVersionPayload, hash, createdAt string) (model.ScriptVersion, error) {
	data, err := json.Marshal(payload.Data)
	if err != nil {
		return model.ScriptVersion{}, err
	}
	return model.ScriptVersion{
		UserID: userID, ProjectID: payload.ProjectID, ID: payload.ID, Scope: payload.Scope,
		EpisodeID: payload.EpisodeID, Label: payload.Label, Kind: payload.Kind, Hash: hash,
		Data: string(data), CreatedAt: createdAt,
	}, nil
}

func scriptVersionPayload(item model.ScriptVersion) (model.ScriptVersionPayload, error) {
	var payload model.ScriptVersionPayload
	err := json.Unmarshal([]byte(item.Data), &payload.Data)
	payload.ID, payload.ProjectID, payload.Scope, payload.EpisodeID = item.ID, item.ProjectID, item.Scope, item.EpisodeID
	payload.Label, payload.Kind, payload.Hash, payload.CreatedAt = item.Label, item.Kind, item.Hash, item.CreatedAt
	return payload, err
}

func scriptVersionTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func activateScriptLock(document *model.ScriptProjectDocument, version model.ScriptVersionPayload) {
	if version.Scope == "project" {
		document.LockedVersionID, document.LockedVersionHash = version.ID, version.Hash
		return
	}
	for index := range document.Episodes {
		if document.Episodes[index].ID == version.EpisodeID {
			document.Episodes[index].LockedVersionID = version.ID
			document.Episodes[index].LockedVersionHash = version.Hash
			return
		}
	}
}

func restoreScriptDocument(document model.ScriptProjectDocument, version model.ScriptVersionPayload, versionID, versionHash string) (model.ScriptProjectDocument, error) {
	now := scriptVersionTimestamp()
	if version.Scope == "episode" {
		currentIndex, snapshotIndex := -1, -1
		for index := range document.Episodes {
			if document.Episodes[index].ID == version.EpisodeID {
				currentIndex = index
			}
		}
		for index := range version.Data.Episodes {
			if version.Data.Episodes[index].ID == version.EpisodeID {
				snapshotIndex = index
			}
		}
		if currentIndex < 0 || snapshotIndex < 0 {
			return document, scriptProjectError("剧集不存在")
		}
		current := document.Episodes[currentIndex]
		restored := restoreScriptEpisode(version.Data.Episodes[snapshotIndex], now)
		if current.LockedVersionID == versionID && current.LockedVersionHash == versionHash {
			restored.LockedVersionID, restored.LockedVersionHash = versionID, versionHash
		}
		document.Episodes[currentIndex] = restored
		return document, nil
	}
	currentByID := make(map[string]model.ScriptEpisode, len(document.Episodes))
	for _, episode := range document.Episodes {
		currentByID[episode.ID] = episode
	}
	document.Title, document.Format, document.Genre, document.Logline = version.Data.Title, version.Data.Format, version.Data.Genre, version.Data.Logline
	document.Theme, document.Synopsis, document.ActOne, document.ActTwo, document.ActThree = version.Data.Theme, version.Data.Synopsis, version.Data.ActOne, version.Data.ActTwo, version.Data.ActThree
	document.Characters = append([]model.ScriptCharacter{}, version.Data.Characters...)
	document.Episodes = make([]model.ScriptEpisode, 0, len(version.Data.Episodes))
	for _, snapshot := range version.Data.Episodes {
		restored := restoreScriptEpisode(snapshot, now)
		if current := currentByID[snapshot.ID]; current.LockedVersionID != "" && current.LockedVersionHash != "" {
			restored.LockedVersionID, restored.LockedVersionHash = current.LockedVersionID, current.LockedVersionHash
		}
		document.Episodes = append(document.Episodes, restored)
	}
	if document.LockedVersionID != versionID || document.LockedVersionHash != versionHash {
		document.LockedVersionID, document.LockedVersionHash = "", ""
	}
	return document, nil
}

func restoreScriptEpisode(episode model.ScriptEpisode, updatedAt string) model.ScriptEpisode {
	restored := model.ScriptEpisode{ID: episode.ID, No: episode.No, Title: episode.Title, Scenes: make([]model.ScriptScene, 0, len(episode.Scenes))}
	for _, scene := range episode.Scenes {
		scene.Revision++
		scene.UpdatedAt = updatedAt
		scene.Characters = append([]string{}, scene.Characters...)
		restored.Scenes = append(restored.Scenes, scene)
	}
	return restored
}

func writeScriptProjectDocument(tx *gorm.DB, item *model.ScriptProject, document model.ScriptProjectDocument) error {
	data, err := json.Marshal(document)
	if err != nil {
		return err
	}
	if len(data) > maxScriptProjectBytes {
		return scriptProjectError("剧本内容不能超过 8 MB")
	}
	summary := model.SummarizeScriptProjectDocument(document)
	item.Title, item.Format, item.Genre, item.Logline = summary.Title, summary.Format, summary.Genre, summary.Logline
	item.EpisodeCount, item.SceneCount, item.CharacterCount, item.WordCount = summary.EpisodeCount, summary.SceneCount, summary.CharacterCount, summary.WordCount
	item.LockedEpisodeCount, item.HasPublication, item.PublicationStale = summary.LockedEpisodeCount, summary.HasPublication, summary.PublicationStale
	item.Data, item.UpdatedAt = string(data), document.UpdatedAt
	return nil
}
