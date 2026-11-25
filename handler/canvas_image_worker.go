package handler

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
	"github.com/jiangtejie/infinite-canvas-pro/service"
)

const canvasImageHeartbeatInterval = 15 * time.Second

func StartCanvasImageWorker() {
	service.StartCanvasImageTaskWorker(func(task model.CanvasImageTask, owner string) {
		runCanvasImageTaskSafely(task, owner, runPersistedCanvasImageTask)
	})
}

// runCanvasImageTaskSafely 兜住执行中的 panic：任务失败退款，而不是让整个进程崩溃后反复重领。
func runCanvasImageTaskSafely(task model.CanvasImageTask, owner string, run func(model.CanvasImageTask, string)) {
	defer func() {
		recovered := recover()
		if recovered == nil {
			return
		}
		log.Printf("canvas image task panic: task=%s err=%v", task.ID, recovered)
		task.Status, task.Error, task.ErrorDetail, task.CompletedAt = "failed", "图片任务执行异常，已退回算力点，请重新生成", fmt.Sprint(recovered), taskTime()
		if ok, err := repository.CompleteCanvasImageTask(task, owner); err != nil || !ok {
			log.Printf("finish panicked canvas image task failed: task=%s ok=%v err=%v", task.ID, ok, err)
		}
	}()
	run(task, owner)
}

func runPersistedCanvasImageTask(task model.CanvasImageTask, owner string) {
	finish := func(status, message, detail string) {
		task.Status = status
		task.Error = message
		task.ErrorDetail = detail
		task.CompletedAt = taskTime()
		if ok, err := repository.CompleteCanvasImageTask(task, owner); err != nil || !ok {
			log.Printf("finish canvas image task failed: task=%s status=%s ok=%v err=%v", task.ID, status, ok, err)
		}
	}
	if len(task.Payload) == 0 {
		finish("failed", "图片任务请求已丢失，请重新生成", "数据库中没有可执行的请求内容")
		return
	}
	storedUser, found, err := repository.GetUserByID(task.UserID)
	if err != nil || !found {
		finish("failed", "图片任务用户不存在", errString(err))
		return
	}
	ctx, cleanup, err := service.CanvasTaskContext("image", task.UserID, task.ID)
	if err != nil {
		return
	}
	defer cleanup()
	task.Progress = 10
	task.StartedAt = taskTime()
	if ok, err := repository.UpdateCanvasImageTaskRuntime(task, owner); err != nil || !ok {
		return
	}
	runCtx, cancelRun := context.WithCancel(ctx)
	defer cancelRun()
	heartbeatDone := make(chan struct{})
	heartbeatCtx, stopHeartbeat := context.WithCancel(runCtx)
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(canvasImageHeartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatCtx.Done():
				return
			case <-ticker.C:
				ok, err := repository.RenewCanvasImageTaskLease(task.ID, task.UserID, owner, time.Now().UTC().Add(service.CanvasImageTaskLease))
				if err != nil || !ok {
					log.Printf("renew canvas image task lease failed: task=%s ok=%v err=%v", task.ID, ok, err)
					cancelRun()
					return
				}
			}
		}
	}()
	defer func() {
		stopHeartbeat()
		<-heartbeatDone
	}()
	ctx = runCtx
	ctx = context.WithValue(ctx, midjourneyTaskIDCallbackKey{}, func(taskID string) {
		if strings.TrimSpace(taskID) == "" || task.UpstreamTaskID == taskID {
			return
		}
		task.UpstreamTaskID = taskID
		if ok, err := repository.UpdateCanvasImageTaskRuntime(task, owner); err != nil || !ok {
			log.Printf("save canvas image upstream ID failed: task=%s ok=%v err=%v", task.ID, ok, err)
		}
	})
	if ok, err := repository.MarkCanvasImageTaskDispatched(task.ID, task.UserID, owner); err != nil || !ok {
		return
	}
	payload, status, responseContentType, err := executeCanvasAIRequest(ctx, model.PublicUser(storedUser), task.Endpoint, task.Payload, task.ContentType, task.ChannelID, task.UserChannelID, task.Credits, func(progress int) {
		if progress <= task.Progress {
			return
		}
		task.Progress = min(progress, 99)
		if ok, err := repository.UpdateCanvasImageTaskRuntime(task, owner); err != nil || !ok {
			log.Printf("save canvas image progress failed: task=%s ok=%v err=%v", task.ID, ok, err)
		}
	})
	if ctx.Err() != nil {
		return
	}
	if err != nil {
		finish("failed", err.Error(), err.Error())
		return
	}
	if status >= http.StatusBadRequest {
		finish("failed", readUpstreamAIErrorMessage(payload, status), string(payload))
		return
	}
	if message := readWrappedTaskError(payload); message != "" {
		finish("failed", message, string(payload))
		return
	}
	translationInput, _ := service.ReadParameterTranslationInput(task.Payload)
	collectAll := translationInput != nil || allAIProtocolImageResults(task.Model)
	imageURLs, mimeType, size, err := imageURLsFromAIResponse(payload, responseContentType, collectAll, task.Endpoint == "/chat/completions")
	if err != nil {
		finish("failed", err.Error(), string(payload))
		return
	}
	task.Status = "completed"
	task.Progress = 100
	task.ResponseBody = string(payload)
	task.ImageURL = imageURLs[0]
	if collectAll {
		task.ImageURLs = imageURLs
	}
	task.MimeType = mimeType
	task.Bytes = size
	task.Width = 0
	task.Height = 0
	if ok, err := repository.CompleteCanvasImageTask(task, owner); err != nil || !ok {
		log.Printf("finish canvas image task failed: task=%s status=completed ok=%v err=%v", task.ID, ok, err)
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
