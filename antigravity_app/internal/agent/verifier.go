package agent

import (
	"context"
	"fmt"
	"strings"

	"ttgide/internal/capabilities"
)

// Verifier executes verification commands (build/test) to validate code changes
type Verifier struct {
	capManager *capabilities.Manager
}

// NewVerifier creates a new Verifier instance
func NewVerifier(capManager *capabilities.Manager) *Verifier {
	return &Verifier{capManager: capManager}
}

// VerificationResult holds the status and output of a verification check
type VerificationResult struct {
	Passed bool   `json:"passed"`
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}

// Verify runs a verification command in the project
func (v *Verifier) Verify(ctx context.Context, checkCommand string) VerificationResult {
	if checkCommand == "" {
		return VerificationResult{Passed: true, Output: "No check command specified."}
	}

	out, err := v.capManager.Execute(ctx, "run_command", map[string]any{
		"command": checkCommand,
		"timeout": float64(120),
	})

	if err != nil {
		return VerificationResult{
			Passed: false,
			Output: out,
			Error:  err.Error(),
		}
	}

	lowerOut := strings.ToLower(out)
	if strings.Contains(lowerOut, "error:") || strings.Contains(lowerOut, "failed") || strings.Contains(lowerOut, "panic:") {
		return VerificationResult{
			Passed: false,
			Output: out,
			Error:  fmt.Sprintf("Verification failure:\n%s", out),
		}
	}

	return VerificationResult{
		Passed: true,
		Output: out,
	}
}
