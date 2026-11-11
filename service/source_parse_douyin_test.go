package service

import (
	"encoding/json"
	"testing"
)

func TestSplitDouyinTags(t *testing.T) {
	tags, text := splitDouyinTags("第一行标题\n正文内容 #话题1 #话题2")
	if text != "第一行标题\n正文内容" {
		t.Fatalf("unexpected text: %q", text)
	}
	if len(tags) != 2 || tags[0] != "话题1" || tags[1] != "话题2" {
		t.Fatalf("unexpected tags: %#v", tags)
	}
	tags, _ = splitDouyinTags("正文 #话题2，继续写")
	if len(tags) != 1 || tags[0] != "话题2" {
		t.Fatalf("tag should stop at Chinese punctuation: %#v", tags)
	}
}

func TestExtractDouyinShareURL(t *testing.T) {
	cases := map[string]string{
		"复制打开抖音 https://v.douyin.com/abc123/ 看看":             "https://v.douyin.com/abc123/",
		"https://www.douyin.com/note/7412345678901234567，好看": "https://www.douyin.com/note/7412345678901234567",
	}
	for input, want := range cases {
		if got := extractDouyinShareURL(input); got != want {
			t.Fatalf("extractDouyinShareURL(%q)=%q want %q", input, got, want)
		}
	}
}

func TestParseDouyinWorkID(t *testing.T) {
	if id, kind := parseDouyinWorkID("https://www.douyin.com/video/7412345678901234567"); id != "7412345678901234567" || kind != "video" {
		t.Fatalf("video id parse failed: %q %q", id, kind)
	}
	if id, kind := parseDouyinWorkID("https://www.iesdouyin.com/share/note/7412345678901234567"); id != "7412345678901234567" || kind != "note" {
		t.Fatalf("note id parse failed: %q %q", id, kind)
	}
	if _, kind := parseDouyinWorkID("https://www.douyin.com/user/abc"); kind != "user" {
		t.Fatalf("user link should be recognized, got kind=%q", kind)
	}
}

func TestSanitizeJSONUndefined(t *testing.T) {
	input := `{"a":undefined,"b":"undefined","c":1}`
	want := `{"a":null,"b":"undefined","c":1}`
	if got := sanitizeJSONUndefined(input); got != want {
		t.Fatalf("sanitizeJSONUndefined=%q want %q", got, want)
	}
}

func TestExtractEmbeddedJSONAndFindItem(t *testing.T) {
	html := `<html><script>window._ROUTER_DATA = {"loaderData":{"note":{"item_list":[{"desc":"标题\n正文 #话题"}]}}};</script></html>`
	state, ok := extractEmbeddedJSON(html, "_ROUTER_DATA")
	if !ok {
		t.Fatal("extractEmbeddedJSON failed")
	}
	item := findDouyinItem(state)
	if item == nil {
		t.Fatal("findDouyinItem failed")
	}
	if desc := sourceString(item["desc"]); desc != "标题\n正文 #话题" {
		t.Fatalf("unexpected desc: %q", desc)
	}
}

func TestNormalizeDouyinItemKeepsBigAwemeID(t *testing.T) {
	item := map[string]any{
		"aweme_id": json.Number("7412345678901234567"),
		"desc":     "标题第一行\n正文内容 #话题1 #话题2",
		"images": []any{
			map[string]any{"url_list": []any{"http://p3.douyinpic.com/a.jpg"}},
		},
		"author": map[string]any{"nickname": "作者"},
		"statistics": map[string]any{
			"digg_count":    json.Number("123"),
			"collect_count": json.Number("4"),
			"comment_count": json.Number("5"),
			"share_count":   json.Number("6"),
		},
	}
	source := normalizeDouyinItem(item, douyinResolvedWork{ID: "7412345678901234567", Kind: "note", ShareURL: "https://www.douyin.com/note/7412345678901234567"})
	if source.SourceID != "7412345678901234567" {
		t.Fatalf("source id lost precision: %q", source.SourceID)
	}
	if source.Kind != "image" || source.Title != "标题第一行" {
		t.Fatalf("unexpected title/kind: %q %q", source.Title, source.Kind)
	}
	if len(source.Tags) != 2 || source.Tags[0] != "话题1" {
		t.Fatalf("unexpected tags: %#v", source.Tags)
	}
	if len(source.Images) != 1 || source.Images[0].URL != "https://p3.douyinpic.com/a.jpg" {
		t.Fatalf("unexpected images: %#v", source.Images)
	}
	if source.Stats == nil || source.Stats.Likes != 123 || source.Stats.Collects != 4 {
		t.Fatalf("unexpected stats: %#v", source.Stats)
	}
	if source.Author != "作者" {
		t.Fatalf("unexpected author: %q", source.Author)
	}
}

func TestSourceImageExtension(t *testing.T) {
	cases := map[string]string{
		"image/jpeg": "jpg",
		"image/png":  "png",
		"image/webp": "webp",
		"image/gif":  "gif",
		"text/html":  "jpg",
	}
	for contentType, want := range cases {
		if got := sourceImageExtension(contentType); got != want {
			t.Fatalf("sourceImageExtension(%q)=%q want %q", contentType, got, want)
		}
	}
}
