package model

import (
	"bytes"
	"encoding/json"
	"hash/fnv"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
)

type ScriptProjectDocument struct {
	SchemaVersion     int                 `json:"schemaVersion"`
	ID                string              `json:"id"`
	Title             string              `json:"title"`
	Format            string              `json:"format"`
	Genre             string              `json:"genre"`
	Logline           string              `json:"logline"`
	Theme             string              `json:"theme"`
	Synopsis          string              `json:"synopsis"`
	ActOne            string              `json:"actOne"`
	ActTwo            string              `json:"actTwo"`
	ActThree          string              `json:"actThree"`
	Characters        []ScriptCharacter   `json:"characters"`
	Episodes          []ScriptEpisode     `json:"episodes"`
	LockedVersionID   string              `json:"lockedVersionId,omitempty"`
	LockedVersionHash string              `json:"lockedVersionHash,omitempty"`
	Publications      []ScriptPublication `json:"publications"`
	CreatedAt         string              `json:"createdAt"`
	UpdatedAt         string              `json:"updatedAt"`
}

type ScriptCharacter struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	Want        string `json:"want"`
	Need        string `json:"need"`
	Flaw        string `json:"flaw"`
	Arc         string `json:"arc"`
	Description string `json:"description"`
}

type ScriptEpisode struct {
	ID                string        `json:"id"`
	No                int           `json:"no"`
	Title             string        `json:"title"`
	Scenes            []ScriptScene `json:"scenes"`
	LockedVersionID   string        `json:"lockedVersionId,omitempty"`
	LockedVersionHash string        `json:"lockedVersionHash,omitempty"`
}

type ScriptScene struct {
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
	Revision         int64    `json:"revision"`
	UpdatedAt        string   `json:"updatedAt"`
}

type ScriptPublication struct {
	ID               string   `json:"id"`
	FilmProjectID    string   `json:"filmProjectId,omitempty"`
	EpisodeIDs       []string `json:"episodeIds"`
	SourceVersionIDs []string `json:"sourceVersionIds"`
	SourceHash       string   `json:"sourceHash"`
	Status           string   `json:"status"`
	PublishedAt      string   `json:"publishedAt,omitempty"`
	LastError        string   `json:"lastError,omitempty"`
}

type ScriptProjectSummary struct {
	ID                 string `json:"id"`
	Title              string `json:"title"`
	Format             string `json:"format"`
	Genre              string `json:"genre"`
	Logline            string `json:"logline"`
	EpisodeCount       int    `json:"episodeCount"`
	SceneCount         int    `json:"sceneCount"`
	CharacterCount     int    `json:"characterCount"`
	WordCount          int    `json:"wordCount"`
	LockedEpisodeCount int    `json:"lockedEpisodeCount"`
	HasPublication     bool   `json:"hasPublication"`
	PublicationStale   bool   `json:"publicationStale"`
	Revision           int64  `json:"revision"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

type ScriptProject struct {
	UserID             string `json:"userId" gorm:"primaryKey;size:191"`
	ID                 string `json:"id" gorm:"primaryKey;size:48"`
	Title              string `json:"title"`
	Format             string `json:"format"`
	Genre              string `json:"genre"`
	Logline            string `json:"logline"`
	EpisodeCount       int    `json:"episodeCount"`
	SceneCount         int    `json:"sceneCount"`
	CharacterCount     int    `json:"characterCount"`
	WordCount          int    `json:"wordCount"`
	LockedEpisodeCount int    `json:"lockedEpisodeCount"`
	HasPublication     bool   `json:"hasPublication"`
	PublicationStale   bool   `json:"publicationStale"`
	Revision           int64  `json:"revision"`
	Data               string `json:"data" gorm:"size:8388608"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
	DeletedAt          string `json:"deletedAt" gorm:"not null;default:''"`
}

type ScriptVersion struct {
	UserID    string `json:"userId" gorm:"primaryKey;size:191;index:idx_script_versions_project_created,priority:1"`
	ProjectID string `json:"projectId" gorm:"primaryKey;size:48;index:idx_script_versions_project_created,priority:2"`
	ID        string `json:"id" gorm:"primaryKey;size:48"`
	Scope     string `json:"scope"`
	EpisodeID string `json:"episodeId"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	Hash      string `json:"hash"`
	Data      string `json:"data" gorm:"size:8388608"`
	CreatedAt string `json:"createdAt" gorm:"index:idx_script_versions_project_created,priority:4"`
	DeletedAt string `json:"deletedAt" gorm:"not null;default:'';index:idx_script_versions_project_created,priority:3"`
}

type ScriptProjectView struct {
	Document ScriptProjectDocument `json:"document"`
	Revision int64                 `json:"revision"`
}

type ScriptContentSnapshot struct {
	Title      string            `json:"title"`
	Format     string            `json:"format"`
	Genre      string            `json:"genre"`
	Logline    string            `json:"logline"`
	Theme      string            `json:"theme"`
	Synopsis   string            `json:"synopsis"`
	ActOne     string            `json:"actOne"`
	ActTwo     string            `json:"actTwo"`
	ActThree   string            `json:"actThree"`
	Characters []ScriptCharacter `json:"characters"`
	Episodes   []ScriptEpisode   `json:"episodes"`
}

type ScriptVersionSummary struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Scope     string `json:"scope"`
	EpisodeID string `json:"episodeId,omitempty"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	Hash      string `json:"hash"`
	CreatedAt string `json:"createdAt"`
}

type ScriptVersionPayload struct {
	ID        string                `json:"id"`
	ProjectID string                `json:"projectId"`
	Scope     string                `json:"scope"`
	EpisodeID string                `json:"episodeId,omitempty"`
	Label     string                `json:"label"`
	Kind      string                `json:"kind"`
	Hash      string                `json:"hash"`
	Data      ScriptContentSnapshot `json:"data"`
	CreatedAt string                `json:"createdAt"`
}

type ScriptVersionCreateRequest struct {
	Version      ScriptVersionPayload `json:"version"`
	ActivateLock bool                 `json:"activateLock"`
	BaseRevision int64                `json:"baseRevision"`
}

type ScriptVersionRestoreRequest struct {
	BaseRevision int64 `json:"baseRevision"`
}

func ScriptDataHash(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var normalized any
	if err := decoder.Decode(&normalized); err != nil {
		return ""
	}
	var output bytes.Buffer
	writeCanonicalScriptValue(&output, normalized)
	hash := fnv.New32a()
	_, _ = hash.Write(output.Bytes())
	text := strconv.FormatUint(uint64(hash.Sum32()), 16)
	return strings.Repeat("0", 8-len(text)) + text
}

func writeCanonicalScriptValue(output *bytes.Buffer, value any) {
	switch item := value.(type) {
	case nil:
		output.WriteString("null")
	case bool:
		if item {
			output.WriteString("true")
		} else {
			output.WriteString("false")
		}
	case string:
		writeCanonicalScriptString(output, item)
	case json.Number:
		number, err := item.Float64()
		if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
			output.WriteString("null")
			return
		}
		output.WriteString(formatScriptNumber(number))
	case []any:
		output.WriteByte('[')
		for index, child := range item {
			if index > 0 {
				output.WriteByte(',')
			}
			writeCanonicalScriptValue(output, child)
		}
		output.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(item))
		for key := range item {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i, j int) bool {
			return scriptUTF16Less(keys[i], keys[j])
		})
		output.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				output.WriteByte(',')
			}
			writeCanonicalScriptString(output, key)
			output.WriteByte(':')
			writeCanonicalScriptValue(output, item[key])
		}
		output.WriteByte('}')
	}
}

func writeCanonicalScriptString(output *bytes.Buffer, value string) {
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
	text := strings.TrimSuffix(encoded.String(), "\n")
	text = strings.ReplaceAll(text, `\u2028`, "\u2028")
	text = strings.ReplaceAll(text, `\u2029`, "\u2029")
	output.WriteString(text)
}

func formatScriptNumber(value float64) string {
	if value == 0 {
		return "0"
	}
	absolute := math.Abs(value)
	if absolute >= 1e-6 && absolute < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64)
	}
	text := strconv.FormatFloat(value, 'g', -1, 64)
	if index := strings.IndexByte(text, 'e'); index >= 0 {
		exponent := text[index+1:]
		sign := ""
		if strings.HasPrefix(exponent, "+") || strings.HasPrefix(exponent, "-") {
			sign, exponent = exponent[:1], exponent[1:]
		}
		exponent = strings.TrimLeft(exponent, "0")
		if exponent == "" {
			exponent = "0"
		}
		text = text[:index] + "e" + sign + exponent
	}
	return text
}

func scriptUTF16Less(first, second string) bool {
	left, right := utf16.Encode([]rune(first)), utf16.Encode([]rune(second))
	for index := 0; index < len(left) && index < len(right); index++ {
		if left[index] != right[index] {
			return left[index] < right[index]
		}
	}
	return len(left) < len(right)
}

func SummarizeScriptProjectDocument(document ScriptProjectDocument) ScriptProjectSummary {
	summary := ScriptProjectSummary{
		ID:             document.ID,
		Title:          document.Title,
		Format:         document.Format,
		Genre:          document.Genre,
		Logline:        document.Logline,
		EpisodeCount:   len(document.Episodes),
		CharacterCount: len(document.Characters),
		HasPublication: len(document.Publications) > 0,
		CreatedAt:      document.CreatedAt,
		UpdatedAt:      document.UpdatedAt,
	}
	projectLocked := document.LockedVersionID != "" && document.LockedVersionHash != ""
	if projectLocked {
		summary.LockedEpisodeCount = len(document.Episodes)
	}
	for _, episode := range document.Episodes {
		summary.SceneCount += len(episode.Scenes)
		if !projectLocked && episode.LockedVersionID != "" && episode.LockedVersionHash != "" {
			summary.LockedEpisodeCount++
		}
		for _, scene := range episode.Scenes {
			summary.WordCount += len([]rune(strings.Map(func(r rune) rune {
				if unicode.IsSpace(r) || r == '\ufeff' {
					return -1
				}
				return r
			}, scene.Content)))
		}
	}
	for _, publication := range document.Publications {
		if publication.Status == "failed" {
			continue
		}
		sourceHash := scriptPublicationSourceHash(document, publication.EpisodeIDs)
		if sourceHash == "" || sourceHash != publication.SourceHash {
			summary.PublicationStale = true
			break
		}
	}
	return summary
}

func scriptPublicationSourceHash(document ScriptProjectDocument, episodeIDs []string) string {
	if document.LockedVersionID != "" || document.LockedVersionHash != "" {
		if document.LockedVersionID == "" || document.LockedVersionHash == "" {
			return ""
		}
		return document.LockedVersionHash
	}
	locked := make(map[string]string, len(document.Episodes))
	for _, episode := range document.Episodes {
		if episode.LockedVersionID != "" && episode.LockedVersionHash != "" {
			locked[episode.ID] = episode.LockedVersionHash
		}
	}
	parts := make([]string, 0, len(episodeIDs))
	for _, episodeID := range episodeIDs {
		hash := locked[episodeID]
		if hash == "" {
			return ""
		}
		parts = append(parts, episodeID+":"+hash)
	}
	sort.Strings(parts)
	return ScriptDataHash(strings.Join(parts, "\n"))
}

func SnapshotScriptContent(document ScriptProjectDocument) ScriptContentSnapshot {
	snapshot := ScriptContentSnapshot{
		Title: document.Title, Format: document.Format, Genre: document.Genre, Logline: document.Logline,
		Theme: document.Theme, Synopsis: document.Synopsis, ActOne: document.ActOne, ActTwo: document.ActTwo,
		ActThree: document.ActThree, Characters: append([]ScriptCharacter{}, document.Characters...),
		Episodes: make([]ScriptEpisode, 0, len(document.Episodes)),
	}
	for _, episode := range document.Episodes {
		cloned := ScriptEpisode{
			ID: episode.ID, No: episode.No, Title: episode.Title,
			Scenes: make([]ScriptScene, 0, len(episode.Scenes)),
		}
		for _, scene := range episode.Scenes {
			scene.Characters = append([]string{}, scene.Characters...)
			cloned.Scenes = append(cloned.Scenes, scene)
		}
		snapshot.Episodes = append(snapshot.Episodes, cloned)
	}
	return snapshot
}

func ExportScriptText(snapshot ScriptContentSnapshot) string {
	var output strings.Builder
	add := func(label string, value any) {
		output.WriteString(label)
		output.WriteString("：")
		switch item := value.(type) {
		case string:
			var encoded bytes.Buffer
			writeCanonicalScriptString(&encoded, item)
			output.Write(encoded.Bytes())
		case int:
			output.WriteString(strconv.Itoa(item))
		case []string:
			output.WriteByte('[')
			for index, child := range item {
				if index > 0 {
					output.WriteByte(',')
				}
				var encoded bytes.Buffer
				writeCanonicalScriptString(&encoded, child)
				output.Write(encoded.Bytes())
			}
			output.WriteByte(']')
		}
		output.WriteByte('\n')
	}
	add("标题", snapshot.Title)
	add("格式", snapshot.Format)
	add("题材", snapshot.Genre)
	add("Logline", snapshot.Logline)
	add("主题", snapshot.Theme)
	add("梗概", snapshot.Synopsis)
	add("第一幕", snapshot.ActOne)
	add("第二幕", snapshot.ActTwo)
	add("第三幕", snapshot.ActThree)
	for _, character := range snapshot.Characters {
		add("人物ID", character.ID)
		add("人物姓名", character.Name)
		add("人物定位", character.Role)
		add("人物想要", character.Want)
		add("人物需要", character.Need)
		add("人物缺陷", character.Flaw)
		add("人物变化", character.Arc)
		add("人物小传", character.Description)
	}
	for _, episode := range snapshot.Episodes {
		add("剧集ID", episode.ID)
		add("剧集编号", episode.No)
		add("剧集标题", episode.Title)
		for _, scene := range episode.Scenes {
			add("场次ID", scene.ID)
			add("场次编号", scene.No)
			add("内外景", scene.InteriorExterior)
			add("地点", scene.Location)
			add("时间", scene.TimeOfDay)
			add("场次人物", scene.Characters)
			add("目标", scene.Goal)
			add("冲突", scene.Conflict)
			add("转折", scene.Turn)
			add("结果", scene.Outcome)
			add("剧情", scene.Summary)
			add("场次正文", scene.Content)
			add("备注", scene.Notes)
		}
	}
	return strings.TrimSuffix(output.String(), "\n")
}

func ScriptTextHash(text string) string {
	normalized := strings.TrimPrefix(text, "\ufeff")
	normalized = strings.ReplaceAll(normalized, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	var hash uint32 = 0x811c9dc5
	for _, unit := range utf16.Encode([]rune(normalized)) {
		hash ^= uint32(unit)
		hash *= 0x01000193
	}
	encoded := strconv.FormatUint(uint64(hash), 16)
	return strings.Repeat("0", 8-len(encoded)) + encoded
}
