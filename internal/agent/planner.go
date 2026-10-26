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

// ExtractStepsFromText trích xuất các bước kế hoạch từ văn bản của AI hoặc yêu cầu của người dùng
func ExtractStepsFromText(text string) []PlanStep {
	if text == "" {
		return nil
	}
	lines := strings.Split(text, "\n")
	var steps []PlanStep
	stepIdx := 1

	// Nhận diện phân tách chuỗi mũi tên trên cùng 1 dòng: Đợt 1 -> Đợt 2 -> Đợt 3 hoặc Đợt 1 → Đợt 2 → Đợt 3
	reArrow := regexp.MustCompile(`\s*(?:→|->|-->)\s*`)
	rePhase := regexp.MustCompile(`(?i)^(?:#{1,4}\s*)?(?:[-*•]\s*)?(?:(?:Ưu tiên[^:]*:\s*)?(?:Đợt|Phase|Bước|Giai đoạn|Step)\s*(\d+(?:[/-]\d+)?)[^:–—\n]*[:–—-]\s*)(.+)`)
	rePhaseShort := regexp.MustCompile(`(?i)^(?:#{1,4}\s*)?(?:[-*•]\s*)?(Đợt\s*\d+|Bước\s*\d+|Phase\s*\d+|Giai đoạn\s*\d+)(.+)`)
	reChecklist := regexp.MustCompile(`^[-*•]\s*\[([ xX])\]\s*(.+)`)
	reNum := regexp.MustCompile(`^(\d+)[\.\)]\s+([A-ZÀ-Ỹa-zà-ỹ0-9_].+)`)

	hasPlanContext := strings.Contains(strings.ToLower(text), "kế hoạch") ||
		strings.Contains(strings.ToLower(text), "plan") ||
		strings.Contains(strings.ToLower(text), "đợt") ||
		strings.Contains(strings.ToLower(text), "bước") ||
		strings.Contains(strings.ToLower(text), "nâng cấp")

	rePrefix := regexp.MustCompile(`(?i)^(?:(?:Đợt|Phase|Bước|Giai đoạn|Step)\s*\d+[\s:–—\.\-]*|\d+[\.\)]\s*)`)

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		// Nếu dòng chứa chuỗi mũi tên phân chia các Đợt/Bước (ví dụ: Đợt 1 (...) → Đợt 2 (...) → Đợt 3)
		if (strings.Contains(line, "→") || strings.Contains(line, "->")) &&
			(strings.Contains(line, "Đợt") || strings.Contains(line, "Bước") || strings.Contains(line, "Phase") || strings.Contains(line, "Step")) {
			subParts := reArrow.Split(line, -1)
			if len(subParts) > 1 {
				for _, part := range subParts {
					cleanPart := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(part), "#-*• "))
					cleanPart = strings.TrimPrefix(cleanPart, "Ưu tiên cao nhất:")
					cleanPart = strings.TrimPrefix(cleanPart, "Ưu tiên:")
					cleanPart = strings.TrimSpace(rePrefix.ReplaceAllString(cleanPart, ""))
					if cleanPart != "" && len(cleanPart) > 2 {
						steps = append(steps, PlanStep{
							ID:          stepIdx,
							Description: cleanPart,
							Status:      StatusIdle,
						})
						stepIdx++
					}
				}
				continue
			}
		}

		if m := reChecklist.FindStringSubmatch(line); len(m) > 2 {
			status := StatusIdle
			if strings.ToLower(m[1]) == "x" {
				status = StatusSuccess
			}
			desc := strings.TrimSpace(rePrefix.ReplaceAllString(m[2], ""))
			steps = append(steps, PlanStep{
				ID:          stepIdx,
				Description: desc,
				Status:      status,
			})
			stepIdx++
			continue
		}

		if m := rePhase.FindStringSubmatch(line); len(m) > 2 {
			desc := strings.TrimSpace(m[2])
			desc = strings.TrimSpace(rePrefix.ReplaceAllString(desc, ""))
			steps = append(steps, PlanStep{
				ID:          stepIdx,
				Description: desc,
				Status:      StatusIdle,
			})
			stepIdx++
			continue
		}

		if m := rePhaseShort.FindStringSubmatch(line); len(m) > 2 && !strings.Contains(line, "?") && !strings.Contains(line, "bạn muốn") {
			desc := strings.TrimLeft(line, "#-*• ")
			desc = strings.TrimSpace(rePrefix.ReplaceAllString(desc, ""))
			steps = append(steps, PlanStep{
				ID:          stepIdx,
				Description: desc,
				Status:      StatusIdle,
			})
			stepIdx++
			continue
		}

		if hasPlanContext {
			if m := reNum.FindStringSubmatch(line); len(m) > 2 {
				desc := strings.TrimSpace(m[2])
				steps = append(steps, PlanStep{
					ID:          stepIdx,
					Description: desc,
					Status:      StatusIdle,
				})
				stepIdx++
				continue
			}
		}
	}

	return steps
}
