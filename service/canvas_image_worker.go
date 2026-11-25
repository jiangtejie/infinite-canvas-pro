package service

import (
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

const (
	canvasImageWorkerConcurrency = 4
	canvasImageTaskLease         = 60 * time.Second
	canvasImageWorkerInterval    = 2 * time.Second
)

var canvasImageWorker = struct {
	sync.Mutex
	started bool
	wake    chan struct{}
	owner   string
	run     func(model.CanvasImageTask, string)
}{
	wake:  make(chan struct{}, 1),
	owner: uuid.NewString(),
}

func StartCanvasImageTaskWorker(run func(model.CanvasImageTask, string)) {
	if run == nil {
		return
	}
	canvasImageWorker.Lock()
	if canvasImageWorker.started {
		canvasImageWorker.Unlock()
		return
	}
	canvasImageWorker.started = true
	canvasImageWorker.run = run
	canvasImageWorker.Unlock()
	go runCanvasImageTaskWorker()
	WakeCanvasImageTaskWorker()
}

func WakeCanvasImageTaskWorker() {
	select {
	case canvasImageWorker.wake <- struct{}{}:
	default:
	}
}

func runCanvasImageTaskWorker() {
	semaphore := make(chan struct{}, canvasImageWorkerConcurrency)
	ticker := time.NewTicker(canvasImageWorkerInterval)
	defer ticker.Stop()
	for {
		if _, err := repository.RecoverExpiredCanvasImageTasks(time.Now().UTC()); err != nil {
			log.Printf("recover canvas image tasks failed: %v", err)
		}
		for {
			select {
			case semaphore <- struct{}{}:
			default:
				goto drained
			}
			now := time.Now().UTC()
			task, found, err := repository.ClaimNextCanvasImageTask(canvasImageWorker.owner+"-"+uuid.NewString(), now, now.Add(canvasImageTaskLease))
			if err != nil {
				log.Printf("claim canvas image task failed: %v", err)
				<-semaphore
				goto drained
			}
			if !found {
				<-semaphore
				goto drained
			}
			go func() {
				defer func() { <-semaphore }()
				canvasImageWorker.run(task, task.LeaseOwner)
			}()
		}
	drained:
		select {
		case <-canvasImageWorker.wake:
		case <-ticker.C:
		}
	}
}
