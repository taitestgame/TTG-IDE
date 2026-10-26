package agenttools

import (
	"context"
	"fmt"

	"ttgide/internal/capabilities"
)

// RegisterAskQuestionTool dang ky cong cu ask_question cho AI Agent
// Tuong tac hoi y kien nguoi dung thong qua UI modal (giong Antigravity ask_question / Cline ask_followup_question)
func RegisterAskQuestionTool(m *capabilities.Manager, host AgentHost) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "ask_question",
			Description: "Ask an interactive question to the user through an IDE dialog modal to clarify requirements, select design options, or confirm important actions.",
			Category:    "agent",
			Parameters: map[string]any{
				"question":     "The question text to ask the user",
				"options":      "List of quick-select options for the user (optional)",
				"allow_custom": "Whether to allow custom text input (boolean, optional, default: true)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			if host == nil {
				return "", fmt.Errorf("AgentHost chua duoc khoi tao de gui cau hoi")
			}
			question, _ := args["question"].(string)
			var options []string

			// 1. Ho tro format chuan Antigravity questions array: { questions: [{ question: "...", options: [...] }] }
			if rawQuestions, ok := args["questions"].([]any); ok && len(rawQuestions) > 0 {
				if firstQ, ok := rawQuestions[0].(map[string]any); ok {
					if q, ok := firstQ["question"].(string); ok && q != "" {
						question = q
					}
					if rawOpts, ok := firstQ["options"].([]any); ok {
						for _, opt := range rawOpts {
							if str, ok := opt.(string); ok && str != "" {
								options = append(options, str)
							}
						}
					}
				}
			}

			// 2. Ho tro cac key dong nghia o root: options, choices, items, answers
			if len(options) == 0 {
				for _, key := range []string{"options", "choices", "items", "answers"} {
					if rawOpts, ok := args[key].([]any); ok {
						for _, opt := range rawOpts {
							if str, ok := opt.(string); ok && str != "" {
								options = append(options, str)
							}
						}
						if len(options) > 0 {
							break
						}
					}
				}
			}

			if question == "" {
				return "", fmt.Errorf("tham so 'question' khong duoc de trong")
			}

			allowCustom := true
			if ac, ok := args["allow_custom"].(bool); ok {
				allowCustom = ac
			}

			return host.AskQuestion(ctx, question, options, allowCustom)
		},
	})
}
