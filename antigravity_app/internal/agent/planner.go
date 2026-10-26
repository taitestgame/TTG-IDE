package agent

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Planner chịu trách nhiệm phân tích và chia nhỏ mục tiêu phức tạp thành các bước hành động cụ thể
type Planner struct{}

// NewPlanner khởi tạo một bộ lập kế hoạch mới
func NewPlanner() *Planner {
	return &Planner{}
}

// GeneratePlan tạo ra một Kế hoạch (Plan) dựa trên mục tiêu của người dùng
func (p *Planner) GeneratePlan(ctx context.Context, goal string, contextData string) (*Plan, error) {
	planID := fmt.Sprintf("plan_%d", time.Now().UnixMilli())
	steps := ExtractStepsFromText(goal)
	return &Plan{
		ID:          planID,
		Goal:        goal,
		Steps:       steps,
		CurrentStep: 0,
		CreatedAt:   time.Now(),
	}, nil
}

// ExtractStepsFromText trích xuất các bước kế hoạch từ văn bản markdown (checklists, numbered items, phase headings)
func ExtractStepsFromText(text string) []PlanStep {
	if text == "" {
		return nil
	}
	lines := strings.Split(text, "\n")
	var steps []PlanStep
	stepIdx := 1

	reChecklist := regexp.MustCompile(`^[-*•]\s*\[([ xX])\]\s*(.+)`)
	reNumbered := regexp.MustCompile(`^(\d+)[\.\)]\s+(.+)`)
	rePhaseHeading := regexp.MustCompile(`(?i)^(?:#{1,4}\s*)?(?:Phase|Step|Stage|Đợt|Bước)\s*(\d+)[^:\n]*:\s*(.+)`)

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		if m := reChecklist.FindStringSubmatch(line); len(m) > 2 {
			status := StatusIdle
			if strings.ToLower(m[1]) == "x" {
				status = StatusSuccess
			}
			steps = append(steps, PlanStep{
				ID:          stepIdx,
				Description: strings.TrimSpace(m[2]),
				Status:      status,
			})
			stepIdx++
			continue
		}

		if m := rePhaseHeading.FindStringSubmatch(line); len(m) > 2 {
			steps = append(steps, PlanStep{
				ID:          stepIdx,
				Description: strings.TrimSpace(m[2]),
				Status:      StatusIdle,
			})
			stepIdx++
			continue
		}

		if m := reNumbered.FindStringSubmatch(line); len(m) > 2 {
			desc := strings.TrimSpace(m[2])
			if len(desc) > 3 {
				steps = append(steps, PlanStep{
					ID:          stepIdx,
					Description: desc,
					Status:      StatusIdle,
				})
				stepIdx++
			}
			continue
		}
	}

	return steps
}

