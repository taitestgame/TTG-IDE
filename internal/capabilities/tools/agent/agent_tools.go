package agenttools

import (
	"context"
	"ttgide/internal/capabilities"
)

// AgentHost giao dien cau noi giua Agent Harness va cac Tool dieu phoi agent
type AgentHost interface {
	RunSubAgent(ctx context.Context, parentSessionID, task, instructions string) (string, error)
	RememberLesson(lesson string)
	AskQuestion(ctx context.Context, question string, options []string, allowCustom bool) (string, error)
}

// RegisterAgentTools dieu phoi dang ky toan bo 3 cong cu Agent he thong:
// 1. spawn_subagent.go  -> spawn_subagent (Chia viec cho Subagent doc lap)
// 2. remember_lesson.go -> remember_lesson (Luu bai hoc vao bo nho dai han)
// 3. ask_question.go    -> ask_question (Tuong tac hoi nguoi dung khi can lam ro)
func RegisterAgentTools(m *capabilities.Manager, host AgentHost) {
	RegisterSpawnSubagentTool(m, host)
	RegisterRememberLessonTool(m, host)
	RegisterAskQuestionTool(m, host)

	// Alias cho Cline
	m.RegisterAlias("ask_followup_question", "ask_question")
}
