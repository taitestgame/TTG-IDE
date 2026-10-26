package agent

import (
	"context"
	"fmt"

	"ttgide/internal/capabilities"
)

// Executor chịu trách nhiệm điều phối việc chạy từng bước hành động và gọi các công cụ thông qua Capability Manager
type Executor struct {
	capManager *capabilities.Manager
}

// NewExecutor khởi tạo một bộ thực thi mới
func NewExecutor(capManager *capabilities.Manager) *Executor {
	return &Executor{capManager: capManager}
}

// ExecuteStep thực thi một bước hành động cụ thể trong kế hoạch
func (e *Executor) ExecuteStep(ctx context.Context, step *PlanStep) error {
	step.Status = StatusExecuting
	if step.Tool == "" {
		step.Status = StatusSuccess
		return nil
	}

	args, ok := step.Input.(map[string]any)
	if !ok {
		args = make(map[string]any)
	}

	result, err := e.capManager.Execute(ctx, step.Tool, args)
	if err != nil {
		step.Status = StatusFailed
		step.Error = err.Error()
		return err
	}

	step.Status = StatusSuccess
	step.Result = result
	return nil
}

// ExecuteTool gọi trực tiếp một công cụ theo tên
func (e *Executor) ExecuteTool(ctx context.Context, name string, args map[string]any) (string, error) {
	if e.capManager == nil {
		return "", fmt.Errorf("bộ quản lý công cụ (capability manager) chưa được khởi tạo")
	}
	return e.capManager.Execute(ctx, name, args)
}
