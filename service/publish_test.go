package service

import (
	"net/url"
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestDouyinSignatureMatchesOfficialExample(t *testing.T) {
	nonce := "Wm3WZYTPz0wzccnW"
	ticket := "@ml6sqYBGgTKmQNajnKNkaj8yksCAY++adIhlGIqfTiKyvBqOIkzdJ6WRgP+nO+wtVItqKbX4iZ+mFIYkyPJjpQ=="
	got := douyinSignature(nonce, ticket, "1650941858")
	want := "3f7b739a91a52cb7d85c4f89c5f611fe"
	if got != want {
		t.Fatalf("signature = %s, want %s", got, want)
	}
}

func TestNormalizePublishInputDeduplicatesTagsAndImages(t *testing.T) {
	pkg := NormalizePublishInput(PublishInput{
		Title: "  标题  ",
		Body:  "  正文  ",
		Tags:  []string{"#话题1", "话题1", " 话题2 ", "", "#"},
		Images: []PublishImage{
			{URL: " https://jl.lx.cq.cn/api/publish/media/a.jpg ", Width: 1080, Height: 1440},
			{URL: "   "},
		},
	})
	if pkg.Title != "标题" || pkg.Body != "正文" {
		t.Fatalf("unexpected title/body: %#v", pkg)
	}
	if len(pkg.Tags) != 2 || pkg.Tags[0] != "话题1" || pkg.Tags[1] != "话题2" {
		t.Fatalf("unexpected tags: %#v", pkg.Tags)
	}
	if len(pkg.Images) != 1 || pkg.Images[0].URL != "https://jl.lx.cq.cn/api/publish/media/a.jpg" {
		t.Fatalf("unexpected images: %#v", pkg.Images)
	}
}

func TestSummarizePublishIssuesSortsErrorsFirst(t *testing.T) {
	preflight := summarizePublishIssues([]PublishIssue{
		{Level: "warn", Code: "W"},
		{Level: "error", Code: "E"},
	})
	if preflight.Passed || preflight.Errors != 1 || preflight.Warnings != 1 || preflight.Issues[0].Level != "error" {
		t.Fatalf("unexpected preflight: %#v", preflight)
	}
}

func TestPublishRecordViewExpired(t *testing.T) {
	view := publishRecordView(model.PublishRecord{ID: "pub_test", ExpiresAt: "2000-01-01T00:00:00Z", Package: "{}"})
	if !view.Expired || view.ExpiresInSeconds != 0 {
		t.Fatalf("unexpected expired view: %#v", view)
	}
}

func TestBuildDouyinH5SchemaMock(t *testing.T) {
	schema, mock, err := BuildDouyinH5Schema(model.PrivatePublishSetting{
		PublicBaseURL:   "https://jl.lx.cq.cn/",
		DouyinClientKey: "test_client_key",
		DouyinMock:      true,
	}, "pub_record_1", "测试标题", []string{"话题1", "话题2"}, []string{"https://jl.lx.cq.cn/api/publish/media/a.jpg"})
	if err != nil {
		t.Fatal(err)
	}
	if !mock {
		t.Fatal("expected mock schema")
	}
	if !strings.HasPrefix(schema, douyinShareScheme+"?") {
		t.Fatalf("unexpected schema: %s", schema)
	}
	parsed, err := url.Parse(schema)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	if query.Get("share_type") != "h5" || query.Get("client_key") != "test_client_key" || query.Get("state") != "pub_record_1" {
		t.Fatalf("unexpected params: %v", query)
	}
	if len(query.Get("signature")) != 32 {
		t.Fatalf("unexpected signature: %s", query.Get("signature"))
	}
	if !strings.Contains(query.Get("image_list_path"), "a.jpg") {
		t.Fatalf("unexpected image list: %s", query.Get("image_list_path"))
	}
}

func TestBuildDouyinH5SchemaRequiresPublicBaseURL(t *testing.T) {
	_, _, err := BuildDouyinH5Schema(model.PrivatePublishSetting{DouyinMock: true}, "pub_record_1", "", nil, []string{"https://example.com/a.jpg"})
	if err == nil {
		t.Fatal("expected error when publicBaseUrl is empty")
	}
}
