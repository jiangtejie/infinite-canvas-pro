package handler

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestNormalizeMidjourneyImageBody(t *testing.T) {
	body, contentType, err := normalizeMidjourneyImageBody([]byte(`{"model":"midjourney","prompt":"a cat","size":"1024x1536"}`))
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "application/json" {
		t.Fatalf("contentType = %s", contentType)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["botType"] != "MID_JOURNEY" || payload["prompt"] != "a cat --ar 2:3" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestNormalizeMidjourneyImageBodyRejectsUnsupported(t *testing.T) {
	for _, input := range []string{
		`{"prompt":"a cat --q 2"}`,
		`{"prompt":"a cat","image":"abc"}`,
		`{"prompt":""}`,
	} {
		if _, _, err := normalizeMidjourneyImageBody([]byte(input)); err == nil {
			t.Fatalf("expected error for %s", input)
		}
	}
}

func TestPrepareMidjourneyRejectsReferenceImages(t *testing.T) {
	_, handled, err := prepareMidjourneyImageRequest(aiProtocolRequest{
		channel:  model.ModelChannel{Protocol: "midjourney"},
		endpoint: "/images/edits",
		body:     []byte(`{"prompt":"a cat"}`),
	})
	if !handled || err == nil || !strings.Contains(err.Error(), "不支持参考图") {
		t.Fatalf("handled=%v err=%v", handled, err)
	}
}

func TestReadMidjourneySubmitResult(t *testing.T) {
	taskID, message := readMidjourneySubmitResult([]byte(`{"code":1,"description":"Submitted successfully","result":"1320098173412546"}`))
	if taskID != "1320098173412546" || message != "" {
		t.Fatalf("taskID=%s message=%s", taskID, message)
	}
	taskID, message = readMidjourneySubmitResult([]byte(`{"code":22,"result":12345}`))
	if taskID != "12345" || message != "" {
		t.Fatalf("numeric taskID=%s message=%s", taskID, message)
	}
	if _, message = readMidjourneySubmitResult([]byte(`{"code":3,"description":"rejected"}`)); message != "rejected" {
		t.Fatalf("message=%s", message)
	}
}

func TestReadMidjourneyTaskResult(t *testing.T) {
	urls, done, message := readMidjourneyTaskResult([]byte(`{"status":"SUCCESS","imageUrl":"https://example.com/mj.png"}`))
	if !done || message != "" || len(urls) != 1 || urls[0] != "https://example.com/mj.png" {
		t.Fatalf("urls=%v done=%v message=%s", urls, done, message)
	}
	urls, done, message = readMidjourneyTaskResult([]byte(`{"status":"IN_PROGRESS","progress":"50%"}`))
	if done || message != "" || len(urls) != 0 {
		t.Fatalf("in progress: urls=%v done=%v message=%s", urls, done, message)
	}
	if _, done, message = readMidjourneyTaskResult([]byte(`{"status":"FAILURE","failReason":"blocked"}`)); done || message != "blocked" {
		t.Fatalf("failure done=%v message=%s", done, message)
	}
}
