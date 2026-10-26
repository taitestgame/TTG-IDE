package modelrouter

import (
	"context"
	"fmt"
)

// ModelTier định nghĩa phân khúc/vai trò của từng nhóm AI Model
type ModelTier string

const (
	TierFast      ModelTier = "fast"      // Model tốc độ cao: Dùng để phân tích nhanh, tóm tắt, chọn tool
	TierCoding    ModelTier = "coding"    // Model chuyên lập trình: Dùng để sinh code, refactor code
	TierReasoning ModelTier = "reasoning" // Model suy luận sâu: Dùng để thiết kế kiến trúc, lập kế hoạch phức tạp
)

// ModelConfig chứa thông tin kết nối API cho từng phân khúc model
type ModelConfig struct {
	Provider string `json:"provider"` // Nhà cung cấp: "openai", "anthropic", "gemini", "ollama"
	Model    string `json:"model"`    // Tên model: ví dụ "gpt-4o", "claude-3-7-sonnet", "deepseek-coder"
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"`
}

// Router chịu trách nhiệm định tuyến yêu cầu tới AI Model phù hợp nhất
type Router struct {
	FastModel      ModelConfig
	CodingModel    ModelConfig
	ReasoningModel ModelConfig
}

// NewRouter khởi tạo Model Router với các giá trị mặc định
func NewRouter() *Router {
	return &Router{
		FastModel: ModelConfig{
			Provider: "openai",
			Model:    "gpt-4o-mini",
		},
		CodingModel: ModelConfig{
			Provider: "openai",
			Model:    "gpt-4o",
		},
		ReasoningModel: ModelConfig{
			Provider: "openai",
			Model:    "o1",
		},
	}
}

// GetConfigForTier lấy cấu hình tương ứng với phân khúc yêu cầu
func (r *Router) GetConfigForTier(tier ModelTier) (ModelConfig, error) {
	switch tier {
	case TierFast:
		return r.FastModel, nil
	case TierCoding:
		return r.CodingModel, nil
	case TierReasoning:
		return r.ReasoningModel, nil
	default:
		return r.CodingModel, fmt.Errorf("không nhận diện được phân khúc model '%s', mặc định chuyển về coding", tier)
	}
}

// Complete gửi yêu cầu hoàn thành văn bản tới model tương ứng
func (r *Router) Complete(ctx context.Context, tier ModelTier, systemPrompt, userPrompt string) (string, error) {
	cfg, _ := r.GetConfigForTier(tier)
	_ = cfg
	// Trong thực tế, hàm này sẽ gọi HTTP client tới API của nhà cung cấp (OpenAI, Claude, Ollama,...)
	return fmt.Sprintf("[TTG IDE AI Model: %s] Đã xử lý yêu cầu thành công.", cfg.Model), nil
}
