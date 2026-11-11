package service

import "testing"

func TestPublishRateLimits(t *testing.T) {
	for index := 0; index < publishRecordRateLimit; index++ {
		if !AllowPublishCreateRecord("rate-record-user") {
			t.Fatalf("record attempt %d should pass", index)
		}
	}
	if AllowPublishCreateRecord("rate-record-user") {
		t.Fatal("record limit should reject extra attempt")
	}
	for index := 0; index < publishMediaRateLimit; index++ {
		if !AllowPublishMediaUpload("rate-media-user") {
			t.Fatalf("media attempt %d should pass", index)
		}
	}
	if AllowPublishMediaUpload("rate-media-user") {
		t.Fatal("media limit should reject extra attempt")
	}
}
