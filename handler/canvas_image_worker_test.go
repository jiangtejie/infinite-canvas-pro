package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

func TestCanvasTaskBilledHeaderCannotBypassProxyBilling(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:", AILogDir: t.TempDir()}
	blockProtocolNetwork(t)
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "proxy-billing-user", Username: "proxy-billing-user", AffCode: "proxy-billing-user", Role: model.UserRoleAdmin, Status: model.UserStatusActive, Credits: 0}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	channel := model.ModelChannel{ID: "proxy-billing-channel", Name: "fixture", Protocol: "openai", BaseURL: "https://upstream.invalid", APIKey: "remote-key", Models: []string{"image-model"}, Enabled: true, Weight: 1}
	if _, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{channel}}, Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{ModelCosts: []model.ModelCost{{Model: "image-model", Credits: 2}}}}}, "fixture"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	protocolMockHTTP(t, func(request *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"data":[{"url":"https://media.invalid/image.png"}]}`))}, nil
	})
	request := httptest.NewRequest(http.MethodPost, "/images/generations", strings.NewReader(`{"model":"image-model","prompt":"image prompt"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Model-Channel-ID", channel.ID)
	request.Header.Set("X-Canvas-Task-Billed", "true")
	request = request.WithContext(service.WithUser(request.Context(), model.PublicUser(user)))
	writer := httptest.NewRecorder()
	proxyAIRequest(writer, request, "/images/generations")
	if calls != 0 || !strings.Contains(writer.Body.String(), `"code":1`) || !strings.Contains(writer.Body.String(), "算力点不足") {
		t.Fatalf("billing bypass response=%s calls=%d", writer.Body.String(), calls)
	}
}

func TestPersistedCanvasImageWorkerStopCancelsAndRefunds(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:", AILogDir: t.TempDir()}
	blockProtocolNetwork(t)
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "stop-worker-user", Username: "stop-worker-user", AffCode: "stop-worker-user", Role: model.UserRoleAdmin, Status: model.UserStatusActive, Credits: 10}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	channel := model.ModelChannel{ID: "stop-worker-channel", Name: "fixture", Protocol: "openai", BaseURL: "https://upstream.invalid", APIKey: "remote-key", Models: []string{"image-model"}, Enabled: true, Weight: 1}
	if _, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{channel}}}, "fixture"); err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	calls := 0
	protocolMockHTTP(t, func(request *http.Request) (*http.Response, error) {
		calls++
		close(started)
		<-request.Context().Done()
		return nil, request.Context().Err()
	})
	task, created, err := service.CreateCanvasImageTask(service.CanvasImageTaskCreateInput{UserID: user.ID, ClientTaskID: "stop-worker-client", RequestHash: "stop-worker-hash", Source: "canvas", Model: "image-model", ChannelID: channel.ID, Prompt: "image prompt", Endpoint: "/images/generations", ContentType: "application/json", Payload: []byte(`{"model":"image-model","prompt":"image prompt"}`), Credits: 2})
	if err != nil || !created {
		t.Fatalf("create: created=%v err=%v", created, err)
	}
	now := time.Now().UTC()
	claimed, ok, err := repository.ClaimNextCanvasImageTask("stop-worker", now, now.Add(time.Minute))
	if err != nil || !ok {
		t.Fatalf("claim: ok=%v err=%v", ok, err)
	}
	done := make(chan struct{})
	go func() {
		runPersistedCanvasImageTask(claimed, claimed.LeaseOwner)
		close(done)
	}()
	<-started
	stopped, err := service.StopCanvasTask(user.ID, "image", task.ID, false, "canvas")
	if err != nil || !stopped {
		t.Fatalf("stop: stopped=%v err=%v", stopped, err)
	}
	<-done
	var saved model.CanvasImageTask
	if err := db.First(&saved, "id = ?", task.ID).Error; err != nil || saved.Status != "cancelled" || saved.BillingState != "refunded" || calls != 1 {
		t.Fatalf("saved=%#v calls=%d err=%v", saved, calls, err)
	}
	var balance model.User
	var consumeLogs, refundLogs int64
	_ = db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIConsume).Count(&consumeLogs).Error
	_ = db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", user.ID, model.CreditLogTypeAIRefund).Count(&refundLogs).Error
	if err := db.First(&balance, "id = ?", user.ID).Error; err != nil || balance.Credits != 10 {
		t.Fatalf("balance=%v want=10 consume=%d refund=%d err=%v", balance.Credits, consumeLogs, refundLogs, err)
	}
}

func TestPersistedCanvasImageWorkerCompletesClaimedTask(t *testing.T) {
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:", AILogDir: t.TempDir()}
	blockProtocolNetwork(t)
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "image-worker-user", Username: "image-worker-user", Role: model.UserRoleAdmin, Status: model.UserStatusActive, Credits: 100}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	channel := model.ModelChannel{ID: "image-worker-channel", Name: "fixture", Protocol: "openai", BaseURL: "https://upstream.invalid", APIKey: "remote-key", Models: []string{"image-model"}, Enabled: true, Weight: 1}
	if _, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{channel}}}, "fixture"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	protocolMockHTTP(t, func(request *http.Request) (*http.Response, error) {
		calls++
		body, _ := io.ReadAll(request.Body)
		if request.URL.String() != channel.BaseURL+"/v1/images/generations" || !strings.Contains(string(body), "image prompt") {
			t.Fatalf("unexpected persisted request: %s %s", request.URL, body)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"data":[{"url":"https://media.invalid/image.png"}]}`))}, nil
	})
	now := time.Now().UTC()
	task := model.CanvasImageTask{ID: "persisted-image-task", ClientTaskID: "persisted-image-client", UserID: user.ID, RequestHash: "persisted-image-hash", Model: "image-model", ChannelID: channel.ID, Prompt: "image prompt", Endpoint: "/images/generations", ContentType: "application/json", Payload: []byte(`{"model":"image-model","prompt":"image prompt"}`), Status: "queued", CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := repository.ClaimNextCanvasImageTask("worker-test", now, now.Add(time.Minute))
	if err != nil || !ok {
		t.Fatalf("claim: ok=%v err=%v", ok, err)
	}
	runPersistedCanvasImageTask(claimed, "worker-test")
	var saved model.CanvasImageTask
	if err := db.First(&saved, "id = ?", task.ID).Error; err != nil || saved.Status != "completed" || saved.ImageURL != "https://media.invalid/image.png" || saved.LeaseOwner != "" || calls != 1 {
		t.Fatalf("worker result: %#v calls=%d err=%v", saved, calls, err)
	}
}
