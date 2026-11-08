package service

import (
	"strings"
	"testing"
)

func TestParseRegistryPrompts(t *testing.T) {
	raw := []byte(`[
		{"id":"a:1","title":"海报","prompt":"生成一张海报","coverUrl":"https://example.com/a.png","referenceImageUrls":["https://example.com/r.png"],"tags":["海报","Official"],"createdAt":"2026-01-06T14:40:05+08:00"},
		{"id":"a:2","title":"","prompt":"缺少标题"},
		{"id":"a:3","title":"无封面","prompt":"无封面提示词","tags":["t"],"imageModel":"gpt-image-2"}
	]`)
	items, err := parseRegistryPrompts(raw, "test", "gpt-image-2")
	if err != nil {
		t.Fatalf("parseRegistryPrompts error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("want 2 items, got %d", len(items))
	}
	first := items[0]
	if first.Title != "海报" || first.CoverURL != "https://example.com/a.png" {
		t.Fatalf("unexpected first item: %+v", first)
	}
	if !strings.Contains(first.Preview, "r.png") {
		t.Fatalf("preview should keep reference image: %q", first.Preview)
	}
	if !containsTag(first.Tags, "海报") || !containsTag(first.Tags, "gpt-image-2") {
		t.Fatalf("tags missing: %v", first.Tags)
	}
	if first.CreatedAt != "2026-01-06T14:40:05+08:00" {
		t.Fatalf("createdAt = %q", first.CreatedAt)
	}
	if items[1].CoverURL != "" {
		t.Fatalf("empty cover expected, got %q", items[1].CoverURL)
	}
}

func TestParseRegistryPromptsEmpty(t *testing.T) {
	if _, err := parseRegistryPrompts([]byte("[]"), "test", ""); err == nil {
		t.Fatal("empty registry should return error")
	}
}

func TestParseTranscendoPrompts(t *testing.T) {
	fence := "```"
	markdown := `<a id="card-en-s01-01"></a>
<strong>Example: Torn Paper Layers</strong><br/>
<img alt="Example: Torn Paper Layers" src="./images/like/l1.png" width="100%" />
<a id="prompt-en-s01-01"></a>
#### Example: Torn Paper Layers

[Back to image](#card-en-s01-01)

` + fence + `json
{"task":"edit-image: add torn paper effect"}
` + fence + `
`
	baseURL := "https://raw.githubusercontent.com/Transcendo/awesome-nanobanana-prompts/main"
	items := parseTranscendoPrompts(markdown, baseURL)
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	item := items[0]
	if item.Title != "Torn Paper Layers" {
		t.Fatalf("title = %q", item.Title)
	}
	if !strings.HasSuffix(item.CoverURL, "/images/like/l1.png") {
		t.Fatalf("cover = %q", item.CoverURL)
	}
	if !strings.Contains(item.Prompt, "torn paper effect") {
		t.Fatalf("prompt = %q", item.Prompt)
	}
	if !containsTag(item.Tags, "nano-banana") {
		t.Fatalf("tags = %v", item.Tags)
	}
}

func TestParseTranscendoPromptsWithoutImages(t *testing.T) {
	fence := "```"
	markdown := `<a id="prompt-en-s02-01"></a>
#### Example: No Cover

` + fence + `json
{"task":"generate"}
` + fence + `
`
	if items := parseTranscendoPrompts(markdown, "https://example.com"); len(items) != 1 || items[0].CoverURL != "" {
		t.Fatalf("unexpected items: %+v", items)
	}
}

func containsTag(tags []string, want string) bool {
	for _, tag := range tags {
		if tag == want {
			return true
		}
	}
	return false
}
