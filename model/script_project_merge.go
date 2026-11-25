package model

import (
	"sort"
)

type ScriptSceneBaseline struct {
	Revision  int64  `json:"revision"`
	Hash      string `json:"hash"`
	EpisodeID string `json:"episodeId"`
}

type ScriptSyncBaseline struct {
	Revision   int64                          `json:"revision"`
	HeaderHash string                         `json:"headerHash"`
	Scenes     map[string]ScriptSceneBaseline `json:"scenes"`
}

type ScriptConflictResolution struct {
	Scope  string `json:"scope"`
	ID     string `json:"id,omitempty"`
	Choice string `json:"choice"`
}

type ScriptConflict struct {
	Scope  string `json:"scope"`
	ID     string `json:"id,omitempty"`
	Local  any    `json:"local"`
	Remote any    `json:"remote"`
}

type ScriptChangeRequest struct {
	BaseRevision   int64                          `json:"baseRevision"`
	BaseHeaderHash string                         `json:"baseHeaderHash"`
	BaseScenes     map[string]ScriptSceneBaseline `json:"baseScenes"`
	Document       ScriptProjectDocument          `json:"document"`
	Resolutions    []ScriptConflictResolution     `json:"resolutions,omitempty"`
}

type ScriptChangeResponse struct {
	Document  ScriptProjectDocument `json:"document"`
	Revision  int64                 `json:"revision"`
	Conflicts []ScriptConflict      `json:"conflicts"`
}

type ScriptHeader struct {
	Title             string                `json:"title"`
	Format            string                `json:"format"`
	Genre             string                `json:"genre"`
	Logline           string                `json:"logline"`
	Theme             string                `json:"theme"`
	Synopsis          string                `json:"synopsis"`
	ActOne            string                `json:"actOne"`
	ActTwo            string                `json:"actTwo"`
	ActThree          string                `json:"actThree"`
	Characters        []ScriptCharacter     `json:"characters"`
	LockedVersionID   string                `json:"lockedVersionId,omitempty"`
	LockedVersionHash string                `json:"lockedVersionHash,omitempty"`
	Episodes          []ScriptHeaderEpisode `json:"episodes"`
	Publications      []ScriptPublication   `json:"publications"`
}

type ScriptHeaderEpisode struct {
	ID                string   `json:"id"`
	No                int      `json:"no"`
	Title             string   `json:"title"`
	SceneIDs          []string `json:"sceneIds"`
	LockedVersionID   string   `json:"lockedVersionId,omitempty"`
	LockedVersionHash string   `json:"lockedVersionHash,omitempty"`
}

type scriptSceneEntry struct {
	scene     ScriptScene
	episodeID string
	hash      string
}

func NewScriptSyncBaseline(document ScriptProjectDocument, revision int64) ScriptSyncBaseline {
	entries := scriptSceneEntries(document)
	baseline := ScriptSyncBaseline{
		Revision: revision, HeaderHash: ScriptDataHash(scriptHeader(document)),
		Scenes: make(map[string]ScriptSceneBaseline, len(entries)),
	}
	for id, entry := range entries {
		baseline.Scenes[id] = ScriptSceneBaseline{Revision: entry.scene.Revision, Hash: entry.hash, EpisodeID: entry.episodeID}
	}
	return baseline
}

func MergeScriptProjectDocument(remote, local ScriptProjectDocument, base ScriptChangeRequest, resolutions []ScriptConflictResolution) (ScriptProjectDocument, []ScriptConflict, bool) {
	baseline := ScriptSyncBaseline{Revision: base.BaseRevision, HeaderHash: base.BaseHeaderHash, Scenes: base.BaseScenes}
	conflicts := make([]ScriptConflict, 0)
	header := mergeScriptHeader(baseline, scriptHeader(local), scriptHeader(remote), resolutions, &conflicts)
	scenes := mergeScriptScenes(baseline, local, remote, resolutions, &conflicts)
	merged := remote
	merged.Title = header.Title
	merged.Format = header.Format
	merged.Genre = header.Genre
	merged.Logline = header.Logline
	merged.Theme = header.Theme
	merged.Synopsis = header.Synopsis
	merged.ActOne = header.ActOne
	merged.ActTwo = header.ActTwo
	merged.ActThree = header.ActThree
	merged.Characters = header.Characters
	merged.LockedVersionID = header.LockedVersionID
	merged.LockedVersionHash = header.LockedVersionHash
	merged.Episodes = assembleScriptEpisodes(header, scenes, baseline, local, remote)
	merged.Publications = header.Publications
	return merged, conflicts, ScriptDataHash(merged) != ScriptDataHash(remote)
}

func scriptHeader(document ScriptProjectDocument) ScriptHeader {
	header := ScriptHeader{
		Title: document.Title, Format: document.Format, Genre: document.Genre, Logline: document.Logline,
		Theme: document.Theme, Synopsis: document.Synopsis, ActOne: document.ActOne, ActTwo: document.ActTwo,
		ActThree: document.ActThree, Characters: document.Characters, LockedVersionID: document.LockedVersionID,
		LockedVersionHash: document.LockedVersionHash, Publications: document.Publications,
		Episodes: make([]ScriptHeaderEpisode, 0, len(document.Episodes)),
	}
	for _, episode := range document.Episodes {
		sceneIDs := make([]string, 0, len(episode.Scenes))
		for _, scene := range episode.Scenes {
			sceneIDs = append(sceneIDs, scene.ID)
		}
		header.Episodes = append(header.Episodes, ScriptHeaderEpisode{
			ID: episode.ID, No: episode.No, Title: episode.Title, SceneIDs: sceneIDs,
			LockedVersionID: episode.LockedVersionID, LockedVersionHash: episode.LockedVersionHash,
		})
	}
	return header
}

func scriptSceneHash(scene ScriptScene) string {
	return ScriptDataHash(struct {
		ID               string   `json:"id"`
		No               int      `json:"no"`
		InteriorExterior string   `json:"interiorExterior"`
		Location         string   `json:"location"`
		TimeOfDay        string   `json:"timeOfDay"`
		Characters       []string `json:"characters"`
		Goal             string   `json:"goal"`
		Conflict         string   `json:"conflict"`
		Turn             string   `json:"turn"`
		Outcome          string   `json:"outcome"`
		Summary          string   `json:"summary"`
		Content          string   `json:"content"`
		Notes            string   `json:"notes"`
	}{
		ID: scene.ID, No: scene.No, InteriorExterior: scene.InteriorExterior, Location: scene.Location,
		TimeOfDay: scene.TimeOfDay, Characters: scene.Characters, Goal: scene.Goal, Conflict: scene.Conflict,
		Turn: scene.Turn, Outcome: scene.Outcome, Summary: scene.Summary, Content: scene.Content, Notes: scene.Notes,
	})
}

func scriptSceneEntries(document ScriptProjectDocument) map[string]scriptSceneEntry {
	entries := make(map[string]scriptSceneEntry)
	for _, episode := range document.Episodes {
		for _, scene := range episode.Scenes {
			entries[scene.ID] = scriptSceneEntry{scene: scene, episodeID: episode.ID, hash: scriptSceneHash(scene)}
		}
	}
	return entries
}

func mergeScriptHeader(base ScriptSyncBaseline, local, remote ScriptHeader, resolutions []ScriptConflictResolution, conflicts *[]ScriptConflict) ScriptHeader {
	localHash, remoteHash := ScriptDataHash(local), ScriptDataHash(remote)
	if localHash == remoteHash {
		return local
	}
	if localHash == base.HeaderHash {
		return remote
	}
	if remoteHash == base.HeaderHash {
		return local
	}
	resolution := findScriptResolution(resolutions, "header", "")
	if resolution == nil {
		*conflicts = append(*conflicts, ScriptConflict{Scope: "header", Local: local, Remote: remote})
	}
	if resolution != nil && resolution.Choice == "remote" {
		return remote
	}
	return local
}

func mergeScriptScenes(base ScriptSyncBaseline, local, remote ScriptProjectDocument, resolutions []ScriptConflictResolution, conflicts *[]ScriptConflict) map[string]ScriptScene {
	localEntries, remoteEntries := scriptSceneEntries(local), scriptSceneEntries(remote)
	ids := make(map[string]bool, len(base.Scenes)+len(localEntries)+len(remoteEntries))
	for id := range base.Scenes {
		ids[id] = true
	}
	for id := range localEntries {
		ids[id] = true
	}
	for id := range remoteEntries {
		ids[id] = true
	}
	orderedIDs := make([]string, 0, len(ids))
	for id := range ids {
		orderedIDs = append(orderedIDs, id)
	}
	sort.Strings(orderedIDs)
	merged := make(map[string]ScriptScene)
	for _, id := range orderedIDs {
		localEntry, localExists := localEntries[id]
		remoteEntry, remoteExists := remoteEntries[id]
		baseEntry, baseExists := base.Scenes[id]
		var chosen *ScriptScene
		switch {
		case sameScriptHash(localEntry.hash, localExists, remoteEntry.hash, remoteExists):
			if localExists {
				scene := localEntry.scene
				if remoteExists && remoteEntry.scene.Revision > scene.Revision {
					scene = remoteEntry.scene
				}
				chosen = &scene
			}
		case sameScriptHash(localEntry.hash, localExists, baseEntry.Hash, baseExists):
			if remoteExists {
				scene := remoteEntry.scene
				chosen = &scene
			}
		case sameScriptHash(remoteEntry.hash, remoteExists, baseEntry.Hash, baseExists):
			if localExists {
				scene := localEntry.scene
				chosen = &scene
			}
		default:
			resolution := findScriptResolution(resolutions, "scene", id)
			if resolution == nil {
				*conflicts = append(*conflicts, ScriptConflict{Scope: "scene", ID: id, Local: scriptConflictSide(localEntry, localExists), Remote: scriptConflictSide(remoteEntry, remoteExists)})
			}
			if resolution != nil && resolution.Choice == "local" {
				if localExists {
					scene := localEntry.scene
					chosen = &scene
				}
			} else if remoteExists {
				scene := remoteEntry.scene
				chosen = &scene
			}
		}
		if chosen != nil {
			cloned := *chosen
			cloned.Characters = append([]string(nil), chosen.Characters...)
			if chosen.Characters != nil && cloned.Characters == nil {
				cloned.Characters = []string{}
			}
			merged[id] = cloned
		}
	}
	return merged
}

func sameScriptHash(first string, firstExists bool, second string, secondExists bool) bool {
	return firstExists == secondExists && (!firstExists || first == second)
}

func scriptConflictSide(entry scriptSceneEntry, exists bool) any {
	if !exists {
		return nil
	}
	return entry.scene
}

func findScriptResolution(resolutions []ScriptConflictResolution, scope, id string) *ScriptConflictResolution {
	for index := range resolutions {
		if resolutions[index].Scope == scope && resolutions[index].ID == id {
			return &resolutions[index]
		}
	}
	return nil
}

func assembleScriptEpisodes(header ScriptHeader, scenes map[string]ScriptScene, base ScriptSyncBaseline, local, remote ScriptProjectDocument) []ScriptEpisode {
	episodes := make([]ScriptEpisode, 0, len(header.Episodes))
	referenced := make(map[string]bool)
	for _, source := range header.Episodes {
		episode := ScriptEpisode{
			ID: source.ID, No: source.No, Title: source.Title,
			LockedVersionID: source.LockedVersionID, LockedVersionHash: source.LockedVersionHash,
			Scenes: make([]ScriptScene, 0, len(source.SceneIDs)),
		}
		for _, id := range source.SceneIDs {
			scene, exists := scenes[id]
			if !exists || referenced[id] {
				continue
			}
			referenced[id] = true
			episode.Scenes = append(episode.Scenes, scene)
		}
		episodes = append(episodes, episode)
	}
	orphans := make([]string, 0)
	for id := range scenes {
		if !referenced[id] {
			orphans = append(orphans, id)
		}
	}
	if len(orphans) == 0 {
		return episodes
	}
	sort.Strings(orphans)
	if len(episodes) == 0 {
		fallback := ScriptEpisode{ID: "merged-episode", No: 1, Title: "第 1 集", Scenes: []ScriptScene{}}
		if len(local.Episodes) > 0 {
			fallback.ID, fallback.No, fallback.Title = local.Episodes[0].ID, local.Episodes[0].No, local.Episodes[0].Title
		} else if len(remote.Episodes) > 0 {
			fallback.ID, fallback.No, fallback.Title = remote.Episodes[0].ID, remote.Episodes[0].No, remote.Episodes[0].Title
		}
		episodes = append(episodes, fallback)
	}
	localOwners, remoteOwners := scriptSceneOwners(local), scriptSceneOwners(remote)
	for _, id := range orphans {
		ownerID := base.Scenes[id].EpisodeID
		if ownerID == "" {
			ownerID = localOwners[id]
		}
		if ownerID == "" {
			ownerID = remoteOwners[id]
		}
		episodeIndex := 0
		for index := range episodes {
			if episodes[index].ID == ownerID {
				episodeIndex = index
				break
			}
		}
		episodes[episodeIndex].Scenes = append(episodes[episodeIndex].Scenes, scenes[id])
	}
	return episodes
}

func scriptSceneOwners(document ScriptProjectDocument) map[string]string {
	owners := make(map[string]string)
	for _, episode := range document.Episodes {
		for _, scene := range episode.Scenes {
			owners[scene.ID] = episode.ID
		}
	}
	return owners
}
