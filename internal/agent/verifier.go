package agent

import (
	"context"
	"fmt"
	"strings"

	"ttgide/internal/capabilities"
)

// Verifier thực hiện việc chạy build và test để kiểm tra xem các sửa đổi của AI có chính xác và hợp lệ hay không
type Verifier struct {
	capManager *capabilities.Manager
}

// NewVerifier khởi tạo một bộ kiểm tra xác minh mới
func NewVerifier(capManager *capabilities.Manager) *Verifier {
	return &Verifier{capManager: capManager}
}

// VerificationResult chứa kết quả đánh giá kiểm thử
type VerificationResult struct {
	Passed bool   `json:"passed"`          // Đạt hay không đạt
	Output string `json:"output"`          // Chi tiết log đầu ra
	Error  string `json:"error,omitempty"` // Thông điệp lỗi nếu có
}

// Verify thực thi lệnh build hoặc kiểm thử trong dự án
func (v *Verifier) Verify(ctx context.Context, checkCommand string) VerificationResult {
	if checkCommand == "" {
		return VerificationResult{Passed: true, Output: "Không có lệnh kiểm tra nào được chỉ định, mặc định coi như đạt."}
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

	// Kiểm tra các từ khóa lỗi thường gặp trong output
	lowerOut := strings.ToLower(out)
	if strings.Contains(lowerOut, "error:") || strings.Contains(lowerOut, "fail") || strings.Contains(lowerOut, "panic:") {
		return VerificationResult{
			Passed: false,
			Output: out,
			Error:  fmt.Sprintf("Phát hiện lỗi trong kết quả kiểm thử:\n%s", out),
		}
	}

	return VerificationResult{
		Passed: true,
		Output: out,
	}
}
