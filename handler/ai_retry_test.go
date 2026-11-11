package handler

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jiangtejie/infinite-canvas-pro/model"
)

func TestRetryableAIImageEndpoint(t *testing.T) {
	if !retryableAIImageEndpoint("/images/generations") || !retryableAIImageEndpoint("/images/edits") {
		t.Fatal("image endpoints should be retryable")
	}
	if retryableAIImageEndpoint("/chat/completions") || retryableAIImageEndpoint("/videos") {
		t.Fatal("non-image endpoints must not be retried")
	}
}

func TestIsRetryableAITransportError(t *testing.T) {
	retryable := []string{
		"unexpected EOF",
		"connection reset by peer",
		"write: broken pipe",
		"http2: server sent GOAWAY",
		"An existing connection was forcibly closed by the remote host",
	}
	for _, message := range retryable {
		if !isRetryableAITransportError(errors.New(message)) {
			t.Fatalf("expected retryable: %s", message)
		}
	}
	notRetryable := []string{
		"context canceled",
		"context deadline exceeded",
		"no such host",
		"certificate verify failed",
	}
	for _, message := range notRetryable {
		if isRetryableAITransportError(errors.New(message)) {
			t.Fatalf("expected not retryable: %s", message)
		}
	}
}

func TestAIUnexpectedEOFMessage(t *testing.T) {
	message := aiTransportErrorMessage(errors.New("unexpected EOF"))
	if !strings.Contains(message, "上游连接中断") {
		t.Fatalf("unexpected message: %s", message)
	}
}
func TestDoAIRequestWithRetryReplaysImageBody(t *testing.T) {
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		_, _ = io.Copy(io.Discard, r.Body)
		if attempts == 1 {
			hijacker, ok := w.(http.Hijacker)
			if !ok {
				t.Fatal("test server does not support hijacking")
				return
			}
			conn, _, err := hijacker.Hijack()
			if err != nil {
				t.Fatal(err)
				return
			}
			_ = conn.Close()
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, "ok")
	}))
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL+"/images/edits", bytes.NewReader([]byte("image-body")))
	if err != nil {
		t.Fatal(err)
	}
	response, err := doAIRequestWithRetry(server.Client(), request, "/images/edits", model.ModelChannel{})
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if attempts != 2 {
		t.Fatalf("attempts = %d, want 2", attempts)
	}
	body, _ := io.ReadAll(response.Body)
	if string(body) != "ok" {
		t.Fatalf("body = %q", body)
	}
}

func TestDoAIRequestDoesNotRetryChat(t *testing.T) {
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("test server does not support hijacking")
			return
		}
		conn, _, err := hijacker.Hijack()
		if err != nil {
			t.Fatal(err)
			return
		}
		_ = conn.Close()
	}))
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL+"/chat/completions", bytes.NewReader([]byte("chat-body")))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := doAIRequestWithRetry(server.Client(), request, "/chat/completions", model.ModelChannel{}); err == nil {
		t.Fatal("expected error")
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}
func TestDoAIRequestWithRetryRetriesImage5xx(t *testing.T) {
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		_, _ = io.Copy(io.Discard, r.Body)
		if attempts == 1 {
			http.Error(w, "upstream unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, "ok")
	}))
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL+"/images/edits", bytes.NewReader([]byte("image-body")))
	if err != nil {
		t.Fatal(err)
	}
	response, err := doAIRequestWithRetry(server.Client(), request, "/images/edits", model.ModelChannel{})
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if attempts != 2 {
		t.Fatalf("attempts = %d, want 2", attempts)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", response.StatusCode)
	}
}
func TestDoAIRequestDoesNotRetryMidjourney(t *testing.T) {
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("test server does not support hijacking")
			return
		}
		conn, _, err := hijacker.Hijack()
		if err != nil {
			t.Fatal(err)
			return
		}
		_ = conn.Close()
	}))
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL+"/images/edits", bytes.NewReader([]byte("image-body")))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := doAIRequestWithRetry(server.Client(), request, "/images/edits", model.ModelChannel{Protocol: "midjourney"}); err == nil {
		t.Fatal("expected error")
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}
