package agent

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"ttgide/internal/capabilities"
	fsTool "ttgide/internal/capabilities/tools/fs"
	gitTool "ttgide/internal/capabilities/tools/git"
	searchTool "ttgide/internal/capabilities/tools/search"
	termTool "ttgide/internal/capabilities/tools/terminal"
	webTool "ttgide/internal/capabilities/tools/web"
	
	tfContext "ttgide/internal/context"
)

// MultiAIConfig cau hinh cho mot AI tham gia dau truong so sanh
type MultiAIConfig struct {
	ID           string `json:"id"`                     // Vi du: "deepseek-v4.1-flash-free"
	Name         string `json:"name"`                   // Vi du: "DeepSeek V4.1 Flash"
	BaseURL      string `json:"baseUrl"`                // Vi du: "http://127.0.0.1:5050/v1"
	APIKey       string `json:"apiKey"`                 // Vi du: "dummy"
	Model        string `json:"model"`                  // Vi du: "deepseek-v4.1-flash-free"
	ProviderID   string `json:"providerId,omitempty"`   // Vi du: "local-bridge-5050"
	ProviderName string `json:"providerName,omitempty"` // Vi du: "OpenCode Free Bridge"
}

// MultiAIResult ket qua thuc thi doc lap cua mot AI trong sandbox rieng
type MultiAIResult struct {
	ModelID     string      `json:"modelId"`
	ModelName   string      `json:"modelName"`
	SandboxDir  string      `json:"sandboxDir"`
	Answer      string      `json:"answer"`
	Plan        *Plan       `json:"plan,omitempty"`
	Diff        string      `json:"diff,omitempty"`
	DurationMs  int64       `json:"durationMs"`
	Status      AgentStatus `json:"status"` // success, failed
	Error       string      `json:"error,omitempty"`
	FilesEdited []string    `json:"filesEdited,omitempty"`
}

// MultiAISession phien so sanh da AI
type MultiAISession struct {
	SessionID  string          `json:"sessionId"`
	Prompt     string          `json:"prompt"`
	VerifyCmd  string          `json:"verifyCmd,omitempty"`
	CreatedAt  time.Time       `json:"createdAt"`
	Results    []MultiAIResult `json:"results"`
	SelectedID string          `json:"selectedId,omitempty"`
}

// MultiAIArena quan ly dau truong so sanh da AI voi Sandbox co lap tuyet doi
type MultiAIArena struct {
	workspaceRoot string
	contextEngine *tfContext.Engine
	cpProvider    CheckpointProvider
	onEvent       func(evt AgentEvent)
	activeSessions map[string]*MultiAISession
	mu            sync.RWMutex
}

// NewMultiAIArena khoi tao dau truong da AI
func NewMultiAIArena(
	workspaceRoot string,
	ctxEng *tfContext.Engine,
	cpProvider CheckpointProvider,
	onEvent func(evt AgentEvent),
) *MultiAIArena {
	return &MultiAIArena{
		workspaceRoot:  workspaceRoot,
		contextEngine:  ctxEng,
		cpProvider:     cpProvider,
		onEvent:        onEvent,
		activeSessions: make(map[string]*MultiAISession),
	}
}

// RunArena kich hoat chay dong thoi 2 den 4 AI tren cung 1 cau hoi trong cac sandbox rieng biet
func (a *MultiAIArena) RunArena(
	ctx context.Context,
	sessionID string,
	prompt string,
	verifyCmd string,
	models []MultiAIConfig,
) (*MultiAISession, error) {
	if len(models) < 1 {
		return nil, fmt.Errorf("can it nhat 1 model de chay (de xuat 2-4 model)")
	}

	arenaSession := &MultiAISession{
		SessionID: sessionID,
		Prompt:    prompt,
		VerifyCmd: verifyCmd,
		CreatedAt: time.Now(),
		Results:   make([]MultiAIResult, len(models)),
	}

	a.mu.Lock()
	a.activeSessions[sessionID] = arenaSession
	a.mu.Unlock()

	a.emit("multi_ai:start", sessionID, map[string]any{
		"modelCount": len(models),
		"models":     models,
		"prompt":     prompt,
	})

	var wg sync.WaitGroup
	sandboxesBase := filepath.Join(a.workspaceRoot, ".ttgide", "sandboxes")
	_ = os.MkdirAll(sandboxesBase, 0755)

	for i, m := range models {
		wg.Add(1)
		go func(idx int, cfg MultiAIConfig) {
			defer wg.Done()
			tStart := time.Now()

			// 1. Tao thu muc Sandbox rieng biet cho model nay
			sbName := fmt.Sprintf("sb_%s_%d", sanitizeID(cfg.ID), time.Now().UnixMilli()+int64(idx))
			sbDir := filepath.Join(sandboxesBase, sbName)
			_ = os.MkdirAll(sbDir, 0755)

			// 2. Clone snapshot ma nguon vao Sandbox
			if err := copyProjectFiles(a.workspaceRoot, sbDir); err != nil {
				arenaSession.Results[idx] = MultiAIResult{
					ModelID:    cfg.ID,
					ModelName:  cfg.Name,
					SandboxDir: sbDir,
					Status:     StatusFailed,
					Error:      fmt.Sprintf("Loi khoi tao sandbox: %v", err),
					DurationMs: time.Since(tStart).Milliseconds(),
				}
				return
			}

			// 3. Khoi tao Capability Manager co lap rieng cho Sandbox nay
			sbCapMgr := capabilities.NewManager()
			fsTool.RegisterFSTools(sbCapMgr, sbDir)
			termTool.RegisterTerminalTools(sbCapMgr, sbDir)
			gitTool.RegisterGitTools(sbCapMgr, sbDir)
			searchTool.RegisterSearchTools(sbCapMgr, sbDir)
			webTool.RegisterHTTPRequestTool(sbCapMgr)
			webTool.RegisterBrowserTool(sbCapMgr, sbDir)

			// 4. Khoi tao Checkpoint Manager rieng
			var sbCpMgr CheckpointProvider = nil

			// 5. Khoi tao Context Engine rieng
			sbCtxEng := tfContext.NewEngine(sbDir, a.contextEngine.GetMemoryManager())

			// 6. Khoi tao Harness rieng voi model nay
			hCfg := DefaultConfig()
			hCfg.Model = cfg.Model
			hCfg.BaseURL = cfg.BaseURL
			hCfg.APIKey = cfg.APIKey
			hCfg.MaxTurns = 8

			sbHarness := NewHarnessWithConfig(sbCtxEng, sbCapMgr, sbCpMgr, hCfg, func(evt AgentEvent) {
				// Stream tien do cua tung AI kem modelId
				a.emit(fmt.Sprintf("multi_ai:stream:%s", cfg.ID), sessionID, map[string]any{
					"modelId": cfg.ID,
					"event":   evt,
				})
			})

			// 7. Thuc thi Vibe Loop trong Sandbox
			subSessID := fmt.Sprintf("%s_%s", sessionID, cfg.ID)
			plan, err := sbHarness.RunVibeLoop(ctx, subSessID, prompt, verifyCmd, nil)

			duration := time.Since(tStart).Milliseconds()
			editedFiles, diffText := computeSandboxDiff(a.workspaceRoot, sbDir)

			status := StatusSuccess
			errMsg := ""
			answerText := fmt.Sprintf("AI %s da hoan thanh giai phap.", cfg.Name)
			if err != nil {
				status = StatusFailed
				errMsg = err.Error()
				answerText = fmt.Sprintf("AI %s gap loi: %v", cfg.Name, err)
			}

			res := MultiAIResult{
				ModelID:     cfg.ID,
				ModelName:   cfg.Name,
				SandboxDir:  sbDir,
				Answer:      answerText,
				Plan:        plan,
				Diff:        diffText,
				DurationMs:  duration,
				Status:      status,
				Error:       errMsg,
				FilesEdited: editedFiles,
			}

			arenaSession.Results[idx] = res
			a.emit("multi_ai:model_completed", sessionID, res)
		}(i, m)
	}

	wg.Wait()

	a.emit("multi_ai:all_completed", sessionID, arenaSession)
	return arenaSession, nil
}

// SelectSolution nguoi dung chon giai phap cua mot AI, he thong se merge code tu Sandbox vao project chinh
func (a *MultiAIArena) SelectSolution(sessionID string, selectedModelID string) error {
	a.mu.Lock()
	sess, exists := a.activeSessions[sessionID]
	a.mu.Unlock()

	if !exists {
		return fmt.Errorf("khong tim thay phien doi dau multi-ai: %s", sessionID)
	}

	var targetResult *MultiAIResult
	for i := range sess.Results {
		if sess.Results[i].ModelID == selectedModelID {
			targetResult = &sess.Results[i]
			break
		}
	}

	if targetResult == nil {
		return fmt.Errorf("khong tim thay ket qua cua model: %s", selectedModelID)
	}

	if targetResult.SandboxDir == "" {
		return fmt.Errorf("sandbox cua model %s khong hop le", selectedModelID)
	}

	// 1. Tao checkpoint an toan cho project chinh truoc khi merge
	if a.cpProvider != nil {
		_, _ = a.cpProvider.CreateCheckpoint(sessionID, fmt.Sprintf("Truoc khi merge giai phap cua AI: %s", selectedModelID), targetResult.FilesEdited)
	}

	// 2. Sao chep cac file da sua/tao moi tu Sandbox sang thu muc project chinh
	for _, relFile := range targetResult.FilesEdited {
		srcPath := filepath.Join(targetResult.SandboxDir, relFile)
		dstPath := filepath.Join(a.workspaceRoot, relFile)

		if err := copySingleFile(srcPath, dstPath); err != nil {
			return fmt.Errorf("loi khi merge file %s: %w", relFile, err)
		}
	}

	sess.SelectedID = selectedModelID
	a.emit("multi_ai:solution_applied", sessionID, map[string]any{
		"modelId":     selectedModelID,
		"filesMerged": targetResult.FilesEdited,
	})

	// 3. Don dep cac sandbox khong dung nua o background
	go a.cleanupSandboxes(sess)

	return nil
}

func (a *MultiAIArena) cleanupSandboxes(sess *MultiAISession) {
	for _, r := range sess.Results {
		if r.SandboxDir != "" {
			_ = os.RemoveAll(r.SandboxDir)
		}
	}
}

func (a *MultiAIArena) emit(evtType string, sessionID string, payload any) {
	if a.onEvent != nil {
		a.onEvent(AgentEvent{
			Type:      evtType,
			SessionID: sessionID,
			Payload:   payload,
		})
	}
}

// copyProjectFiles sao chep nhanh cac file du an vao Sandbox (loc bo thu muc rac)
func copyProjectFiles(srcRoot, dstRoot string) error {
	return filepath.WalkDir(srcRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() && isIgnoredInSandbox(name) {
			return filepath.SkipDir
		}

		rel, _ := filepath.Rel(srcRoot, p)
		if rel == "." {
			return nil
		}

		targetPath := filepath.Join(dstRoot, rel)
		if d.IsDir() {
			return os.MkdirAll(targetPath, 0755)
		}

		return copySingleFile(p, targetPath)
	})
}

func copySingleFile(src, dst string) error {
	_ = os.MkdirAll(filepath.Dir(dst), 0755)
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func isIgnoredInSandbox(name string) bool {
	ignored := map[string]bool{
		".git":         true,
		"node_modules": true,
		"vendor":       true,
		".ttgide":      true,
		".idea":        true,
		".vscode":      true,
		"dist":         true,
		"bin":          true,
		".gemini":      true,
		"venv":         true,
		"__pycache__":  true,
	}
	return ignored[name]
}

func sanitizeID(id string) string {
	s := strings.ReplaceAll(id, "/", "_")
	s = strings.ReplaceAll(s, ":", "_")
	s = strings.ReplaceAll(s, "-", "_")
	return s
}

// computeSandboxDiff so sanh su khac biet giua workspace goc va sandbox
func computeSandboxDiff(origRoot, sbDir string) ([]string, string) {
	var editedFiles []string
	var diffBuilder strings.Builder

	_ = filepath.WalkDir(sbDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(sbDir, p)
		origPath := filepath.Join(origRoot, rel)

		sbData, err := os.ReadFile(p)
		if err != nil {
			return nil
		}

		origData, err := os.ReadFile(origPath)
		if err != nil {
			// File moi tao trong sandbox
			editedFiles = append(editedFiles, rel)
			diffBuilder.WriteString(fmt.Sprintf("+++ [NEW FILE] %s (%d bytes)\n", rel, len(sbData)))
			return nil
		}

		// So sanh noi dung
		if string(sbData) != string(origData) {
			editedFiles = append(editedFiles, rel)
			diffBuilder.WriteString(fmt.Sprintf("~~~ [MODIFIED] %s (Truoc: %d bytes -> Sau: %d bytes)\n", rel, len(origData), len(sbData)))
		}
		return nil
	})

	return editedFiles, diffBuilder.String()
}
