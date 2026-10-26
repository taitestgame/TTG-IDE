import {
  AppMode,
  Plan,
  Checkpoint,
  Skill,
  ToolDefinition,
  MultiAIConfig,
  MultiAISession,
  AgentEvent,
} from '../types';

const isWails = typeof window !== 'undefined' && (window as any).go !== undefined;
const getApp = () => (window as any)?.go?.main?.App;

// Danh mục mẫu 23 Tool Calls tiêu chuẩn để hiển thị trong chế độ Browser Dev
const DEFAULT_TOOLS: ToolDefinition[] = [
  { name: 'read_file', domain: 'fs', description: 'Đọc nội dung tệp với đánh số dòng %4d', parameters: { path: 'string', start_line: 'number', end_line: 'number' } },
  { name: 'write_file', domain: 'fs', description: 'Tạo mới hoặc ghi đè an toàn nội dung tệp', parameters: { path: 'string', content: 'string' } },
  { name: 'edit_file', domain: 'fs', description: 'Sửa file theo cơ chế Search/Replace chịu lỗi khoảng trắng', parameters: { path: 'string', target: 'string', replacement: 'string' } },
  { name: 'list_dir', domain: 'fs', description: 'Khám phá thư mục phân cấp kèm kích thước tệp', parameters: { path: 'string', depth: 'number' } },
  { name: 'list_files', domain: 'fs', description: 'Liệt kê danh sách tất cả các tệp trong workspace', parameters: {} },
  { name: 'delete_file', domain: 'fs', description: 'Xóa tệp tin hoặc thư mục', parameters: { path: 'string' }, requiresApproval: true },
  { name: 'move_file', domain: 'fs', description: 'Di chuyển hoặc đổi tên tệp', parameters: { source: 'string', destination: 'string' } },
  { name: 'file_ops', domain: 'fs', description: 'Thực thi hàng loạt thao tác file theo thứ tự nguyên tử', parameters: { operations: 'array' } },
  { name: 'run_command', domain: 'terminal', description: 'Thực thi lệnh shell phản ứng (PowerShell/CMD)', parameters: { command: 'string', wait_ms: 'number' } },
  { name: 'manage_task', domain: 'terminal', description: 'Quản lý tiến trình chạy ngầm (list, status, logs, kill)', parameters: { action: 'string', task_id: 'string' } },
  { name: 'git_action', domain: 'git', description: 'Thực hiện thao tác Git tích hợp (status, diff, commit, checkout)', parameters: { action: 'string', message: 'string' } },
  { name: 'git_status', domain: 'git', description: 'Kiểm tra trạng thái thay đổi mã nguồn Git', parameters: {} },
  { name: 'git_diff', domain: 'git', description: 'Xem chi tiết khác biệt diff của các tệp', parameters: { path: 'string' } },
  { name: 'git_commit', domain: 'git', description: 'Tạo Git commit an toàn với thông điệp', parameters: { message: 'string' } },
  { name: 'grep_search', domain: 'search', description: 'Tìm kiếm Regex siêu tốc toàn bộ thư mục (ripgrep-like)', parameters: { query: 'string', path: 'string' } },
  { name: 'find_files', domain: 'search', description: 'Tìm kiếm tệp theo mẫu glob hoặc tên tệp', parameters: { pattern: 'string' } },
  { name: 'extract_symbols', domain: 'search', description: 'Phân tích AST trích xuất hàm, struct, interface', parameters: { path: 'string' } },
  { name: 'search_code', domain: 'search', description: 'Tìm kiếm chuỗi chính xác trong mã nguồn', parameters: { query: 'string' } },
  { name: 'fetch_web_request', domain: 'web', description: 'Tải nhanh nội dung URL qua HTTP Request tĩnh', parameters: { url: 'string' } },
  { name: 'fetch_web_browser', domain: 'web', description: 'Duyệt web động qua Headless Browser (JS render)', parameters: { url: 'string' } },
  { name: 'ask_question', domain: 'agent', description: 'Hỏi ý kiến người dùng khi gặp quyết định quan trọng (Human-in-the-Loop)', parameters: { question: 'string', options: 'array' } },
  { name: 'spawn_subagent', domain: 'agent', description: 'Sinh subagent độc lập để giải quyết bài toán chuyên biệt', parameters: { task: 'string', model: 'string' } },
  { name: 'remember_lesson', domain: 'agent', description: 'Ghi nhớ bài học vào bộ nhớ dự án để tránh tái diễn lỗi', parameters: { lesson: 'string' } },
];

export const WailsService = {
  getMode: async (): Promise<AppMode> => {
    if (isWails && getApp()?.GetMode) {
      return getApp().GetMode();
    }
    return (localStorage.getItem('ttgide_mode') as AppMode) || 'vibe';
  },

  setMode: async (mode: AppMode): Promise<void> => {
    localStorage.setItem('ttgide_mode', mode);
    if (isWails && getApp()?.SetMode) {
      return getApp().SetMode(mode);
    }
  },

  getPermissionMode: async (): Promise<string> => {
    const saved = localStorage.getItem('ttgide_permission_mode') || 'full';
    if (isWails && (getApp() as any)?.GetPermissionMode) {
      try {
        return await (getApp() as any).GetPermissionMode();
      } catch {
        return saved;
      }
    }
    return saved;
  },

  setPermissionMode: async (mode: string): Promise<void> => {
    localStorage.setItem('ttgide_permission_mode', mode);
    if (isWails && (getApp() as any)?.SetPermissionMode) {
      try {
        return await (getApp() as any).SetPermissionMode(mode);
      } catch {}
    }
  },

  getWorkspace: async (): Promise<string> => {
    if (isWails && getApp()?.GetWorkspace) {
      return getApp().GetWorkspace();
    }
    return 'c:/code/python/Anchuyennganh';
  },

  setWorkspace: async (path: string): Promise<void> => {
    if (isWails && getApp()?.SetWorkspace) {
      return getApp().SetWorkspace(path);
    }
  },

  listFiles: async (): Promise<string> => {
    if (isWails && getApp()?.ListWorkspaceFiles) {
      return getApp().ListWorkspaceFiles();
    }
    return [
      'main.go',
      'app.go',
      'wails.json',
      'README.md',
      'docs/ttgide_tool_calls_active.md',
      'docs/opencode_free_api_guide.md',
      'internal/agent/harness.go',
      'internal/agent/multi_ai.go',
      'internal/agent/executor.go',
      'internal/agent/safety_gate.go',
      'internal/capabilities/manager.go',
      'internal/capabilities/tools/fs/fs_tools.go',
      'internal/capabilities/tools/terminal/run_command.go',
      'internal/checkpoint/manager.go',
      'internal/context/engine.go',
      'frontend/src/App.tsx',
    ].join('\n');
  },

  readFile: async (path: string): Promise<string> => {
    if (isWails && getApp()?.ReadFile) {
      return getApp().ReadFile(path);
    }
    return `// File: ${path}\n// TTG IDE Next-Gen Vibe & Cyber IDE Runtime\n\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("TTG IDE Cyber Engine Online")\n}\n`;
  },

  saveFile: async (path: string, content: string): Promise<string> => {
    if (isWails && getApp()?.SaveFile) {
      return getApp().SaveFile(path, content);
    }
    return `Đã lưu thành công: ${path}`;
  },

  deleteFile: async (path: string): Promise<string> => {
    if (isWails && getApp()?.DeleteFile) {
      return getApp().DeleteFile(path);
    }
    return `Đã xóa file: ${path}`;
  },

  createFolder: async (path: string): Promise<void> => {
    if (isWails && getApp()?.CreateFolder) {
      return getApp().CreateFolder(path);
    }
  },

  renameFile: async (oldPath: string, newPath: string): Promise<void> => {
    if (isWails && (getApp() as any)?.RenameFile) {
      return (getApp() as any).RenameFile(oldPath, newPath);
    }
  },

  revealInExplorer: async (path: string): Promise<void> => {
    if (isWails && (getApp() as any)?.RevealInExplorer) {
      return (getApp() as any).RevealInExplorer(path);
    }
  },

  grepSearch: async (query: string, includes?: string): Promise<string> => {
    if (isWails && getApp()?.GrepSearch) {
      return getApp().GrepSearch(query, includes || '');
    }
    return '';
  },

  gitStatus: async (): Promise<string> => {
    if (isWails && getApp()?.GitStatus) {
      return getApp().GitStatus();
    }
    return '';
  },

  gitCommit: async (message: string): Promise<string> => {
    if (isWails && getApp()?.GitCommit) {
      return getApp().GitCommit(message);
    }
    return '';
  },

  runCommand: async (command: string): Promise<string> => {
    if (isWails && getApp()?.RunTerminalCommand) {
      return getApp().RunTerminalCommand(command);
    }
    return `[Mock Terminal Output]: Lệnh "${command}" hoàn thành với mã thoát 0.`;
  },

  triggerAgent: async (
    sessionId: string,
    prompt: string,
    verifyCmd: string,
    files: string[]
  ): Promise<Plan> => {
    if (isWails && getApp()?.TriggerAgent) {
      return getApp().TriggerAgent(sessionId, prompt, verifyCmd, files);
    }

    return {
      id: `plan_${Date.now()}`,
      goal: prompt,
      steps: [
        {
          id: 1,
          description: 'Quét cấu trúc codebase & nạp memory dự án',
          status: 'success',
          tool: 'list_files',
          toolAction: 'Scanning project files',
          toolSummary: 'Project scanning',
          result: 'Đã tìm thấy 24 tệp mã nguồn và kiến trúc TTG IDE',
        },
        {
          id: 2,
          description: `Hiện thực hóa yêu cầu: "${prompt.slice(0, 50)}..."`,
          status: 'success',
          tool: 'write_file',
          toolAction: 'Updating source files',
          toolSummary: 'File modification',
          result: 'Đã áp dụng các chỉnh sửa mã nguồn chuẩn xác',
        },
        {
          id: 3,
          description: 'Chạy xác minh kiểm thử tự động (Verification)',
          status: 'success',
          tool: 'run_command',
          toolAction: 'Verifying code changes',
          toolSummary: 'Automated verification',
          result: 'Chạy kiểm thử thành công, 0 lỗi phát hiện',
        },
      ],
      currentStep: 3,
      createdAt: new Date().toISOString(),
    };
  },

  listCheckpoints: async (): Promise<Checkpoint[]> => {
    if (isWails && getApp()?.ListCheckpoints) {
      return getApp().ListCheckpoints();
    }
    return [
      {
        id: 'cp_genesis',
        sessionId: 'sess_init',
        description: 'Điểm khôi phục trước khi kiến trúc lại giao diện',
        files: ['app.go', 'main.go'],
        createdAt: new Date().toISOString(),
      },
    ];
  },

  rollback: async (checkpointId: string): Promise<void> => {
    if (isWails && getApp()?.Rollback) {
      return getApp().Rollback(checkpointId);
    }
  },

  getRegisteredTools: async (): Promise<ToolDefinition[]> => {
    if (isWails && getApp()?.GetRegisteredTools) {
      return getApp().GetRegisteredTools();
    }
    return DEFAULT_TOOLS;
  },

  getSkills: async (): Promise<Skill[]> => {
    if (isWails && getApp()?.GetSkills) {
      return getApp().GetSkills();
    }
    return [
      { name: 'coding', description: 'Quy chuẩn lập trình tối ưu và sạch sẽ', content: '# Coding Standards', path: 'skills/coding/SKILL.md' },
      { name: 'debugging', description: 'Chiến thuật cô lập và gỡ lỗi tự động', content: '# Debugging Guide', path: 'skills/debugging/SKILL.md' },
      { name: 'go', description: 'Kỹ năng Go hiệu năng cao không dùng CGO', content: '# Go Mastery', path: 'skills/go/SKILL.md' },
      { name: 'react', description: 'Xây dựng giao diện React mượt mà, dark theme', content: '# React Patterns', path: 'skills/react/SKILL.md' },
    ];
  },

  answerQuestion: (answer: string): void => {
    if (isWails && getApp()?.AnswerAgentQuestion) {
      getApp().AnswerAgentQuestion(answer);
    }
  },

  steerAgent: (sessionId: string, text: string): void => {
    if (isWails && getApp()?.SteerAgent) {
      getApp().SteerAgent(sessionId, text);
    }
  },

  triggerMultiAIArena: async (
    sessionId: string,
    prompt: string,
    verifyCmd: string,
    models: MultiAIConfig[]
  ): Promise<MultiAISession> => {
    if (isWails && getApp()?.TriggerMultiAIAgent) {
      return getApp().TriggerMultiAIAgent(sessionId, prompt, verifyCmd, models);
    }
    return {
      sessionId,
      prompt,
      verifyCmd,
      createdAt: new Date().toISOString(),
      results: models.map((m, idx) => ({
        modelId: m.id,
        modelName: m.name,
        sandboxDir: `.ttgide/sandboxes/${m.id}`,
        answer: `Lời giải tối ưu từ mô hình ${m.name}. Đã phân tích kiến trúc và tạo bản vá trong sandbox.`,
        durationMs: 1200 + idx * 450,
        status: 'success',
        filesEdited: ['app.go', 'internal/agent/harness.go'],
      })),
    };
  },

  selectMultiAISolution: async (sessionId: string, selectedModelId: string): Promise<void> => {
    if (isWails && getApp()?.SelectMultiAISolution) {
      return getApp().SelectMultiAISolution(sessionId, selectedModelId);
    }
  },

  openProjectDialog: async (): Promise<string> => {
    if (isWails && getApp()?.OpenProjectDialog) {
      return getApp().OpenProjectDialog();
    }
    // Browser dev mode default workspace
    return 'c:/code/python/Anchuyennganh';
  },

  getAIModels: async (): Promise<MultiAIConfig[]> => {
    if (isWails && getApp()?.GetAIModels) {
      return getApp().GetAIModels();
    }
    const cached = localStorage.getItem('ttgide_models');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return [
      {
        id: 'deepseek-v4.1-flash-free',
        name: 'DeepSeek V4.1 Flash (Free Zen)',
        baseUrl: 'http://127.0.0.1:5050/v1',
        apiKey: 'dummy',
        model: 'deepseek-v4.1-flash-free',
      },
      {
        id: 'glm-5.3-flash-free',
        name: 'GLM-5.3 Flash (Free Zen)',
        baseUrl: 'http://127.0.0.1:5050/v1',
        apiKey: 'dummy',
        model: 'glm-5.3-flash-free',
      },
      {
        id: 'gemini-2.5-flash-free',
        name: 'Gemini 2.5 Flash (Free Zen)',
        baseUrl: 'http://127.0.0.1:5050/v1',
        apiKey: 'dummy',
        model: 'gemini-2.5-flash-free',
      },
      {
        id: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet (Anthropic)',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: '',
        model: 'claude-3-7-sonnet',
      },
    ];
  },

  addAIModel: async (cfg: MultiAIConfig): Promise<MultiAIConfig[]> => {
    let updated: MultiAIConfig[] = [];
    if (isWails && getApp()?.AddAIModel) {
      updated = await getApp().AddAIModel(cfg);
    } else {
      const current = await WailsService.getAIModels();
      updated = [...current.filter((m) => m.id !== cfg.id), cfg];
    }
    localStorage.setItem('ttgide_models', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ttgide_models_updated', { detail: updated }));
    return updated;
  },

  removeAIModel: async (id: string): Promise<MultiAIConfig[]> => {
    let updated: MultiAIConfig[] = [];
    if (isWails && getApp()?.RemoveAIModel) {
      updated = await getApp().RemoveAIModel(id);
    } else {
      const current = await WailsService.getAIModels();
      updated = current.filter((m) => m.id !== id);
    }
    localStorage.setItem('ttgide_models', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ttgide_models_updated', { detail: updated }));
    return updated;
  },

  saveAIModels: async (models: MultiAIConfig[]): Promise<MultiAIConfig[]> => {
    let updated: MultiAIConfig[] = [];
    if (isWails && getApp()?.SaveAIModels) {
      updated = await getApp().SaveAIModels(models);
    } else {
      updated = models;
    }
    localStorage.setItem('ttgide_models', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ttgide_models_updated', { detail: updated }));
    return updated;
  },

  getAIProviders: async () => {
    try {
      const saved = await WailsService.getSetting('custom_providers');
      if (saved && saved.trim()) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    const cached = localStorage.getItem('ttgide_providers');
    if (cached && cached.trim()) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [
      {
        id: 'local-bridge-5050',
        name: 'OpenCode Free Bridge (:5050)',
        baseUrl: 'http://127.0.0.1:5050/v1',
        apiKey: 'free',
        description: 'Free Bridge tích hợp sẵn trong TTG IDE (Local port 5050)',
        isBuiltin: true,
      },
      {
        id: 'ollama-local',
        name: 'Ollama Local (:11434)',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'ollama',
        description: 'Mô hình AI chạy offline trên máy qua Ollama',
        isBuiltin: true,
      },
      {
        id: 'deepseek-api',
        name: 'DeepSeek API',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        description: 'DeepSeek V3 / R1 chính thức',
        isBuiltin: true,
      },
      {
        id: 'openai-api',
        name: 'OpenAI API',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        description: 'GPT-4o, GPT-4o-mini, o1, o3-mini',
        isBuiltin: true,
      },
      {
        id: 'openrouter-api',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        description: 'Cổng tổng hợp đa mô hình AI toàn cầu',
        isBuiltin: true,
      },
      {
        id: 'groq-api',
        name: 'Groq Cloud',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: '',
        description: 'Llama 3.3, Mixtral tốc độ 500+ tokens/s',
        isBuiltin: true,
      },
    ];
  },

  saveAIProviders: async (providers: any[]): Promise<void> => {
    const jsonStr = JSON.stringify(providers);
    localStorage.setItem('ttgide_providers', jsonStr);
    try {
      await WailsService.saveSetting('custom_providers', jsonStr);
    } catch (e) {}
  },

  callAIModel: async (cfg: MultiAIConfig, systemInstruction: string, userPrompt: string): Promise<string> => {
    if (isWails && getApp()?.CallAIModel) {
      return getApp().CallAIModel(cfg, systemInstruction, userPrompt);
    }
    // Direct browser fetch fallback when testing in web browser
    const baseURL = cfg.baseUrl || 'http://127.0.0.1:5050/v1';
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: userPrompt });

    const resp = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`API HTTP ${resp.status}: ${txt}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  },

  fetchAvailableModels: async (baseURL?: string, apiKey?: string): Promise<string[]> => {
    if (isWails && getApp()?.FetchAvailableModels) {
      return getApp().FetchAvailableModels(baseURL || '', apiKey || '');
    }
    const target = baseURL || 'http://127.0.0.1:5050/v1';
    try {
      const resp = await fetch(`${target.replace(/\/+$/, '')}/models`);
      if (resp.ok) {
        const data = await resp.json();
        return (data.data || []).map((m: any) => m.id);
      }
    } catch (e) {
      console.warn('Cannot fetch live models directly:', e);
    }
    return [
      'deepseek-v4.1-flash-free',
      'glm-5.3-flash-free',
      'nemotron-3.5-lightning-free',
      'big-pickle',
      'beam-free',
      'longcat-2.5-preview-free',
      'mimo-v2.6-flash-free',
      'nemotron-3.5-super-vl-free',
      'nemotron-3-ultra-free',
      'minimax-m3.1-flash-free',
    ];
  },

  saveMultiAIRun: async (
    id: string,
    prompt: string,
    strategy: string,
    nodesJSON: string,
    resultsJSON: string,
    synthesis: string
  ): Promise<void> => {
    if (isWails && getApp()?.SaveMultiAIRun) {
      return getApp().SaveMultiAIRun(id, prompt, strategy, nodesJSON, resultsJSON, synthesis);
    }
    const existing = JSON.parse(localStorage.getItem('ttgide_multi_ai_runs') || '[]');
    existing.unshift({ id, prompt, strategy, nodesJSON, resultsJSON, synthesis, createdAt: new Date().toISOString() });
    localStorage.setItem('ttgide_multi_ai_runs', JSON.stringify(existing.slice(0, 30)));
  },

  listMultiAIRuns: async (): Promise<any[]> => {
    if (isWails && getApp()?.ListMultiAIRuns) {
      return getApp().ListMultiAIRuns();
    }
    return JSON.parse(localStorage.getItem('ttgide_multi_ai_runs') || '[]');
  },

  saveSession: async (id: string, title: string): Promise<void> => {
    if (isWails && getApp()?.SaveSession) {
      return getApp().SaveSession(id, title);
    }
    const list = JSON.parse(localStorage.getItem('ttgide_sessions') || '[]');
    const filtered = list.filter((s: any) => s.id !== id);
    filtered.unshift({ id, title, workspace: 'workspace', createdAt: new Date().toISOString() });
    localStorage.setItem('ttgide_sessions', JSON.stringify(filtered));
  },

  listSessions: async (): Promise<any[]> => {
    if (isWails && getApp()?.ListSessions) {
      return getApp().ListSessions();
    }
    return JSON.parse(localStorage.getItem('ttgide_sessions') || '[]');
  },

  deleteSession: async (id: string): Promise<void> => {
    if (isWails && getApp()?.DeleteSession) {
      return getApp().DeleteSession(id);
    }
    const list = JSON.parse(localStorage.getItem('ttgide_sessions') || '[]');
    localStorage.setItem('ttgide_sessions', JSON.stringify(list.filter((s: any) => s.id !== id)));
  },

  saveMessage: async (
    id: string,
    sessionId: string,
    sender: string,
    content: string,
    toolCallsJSON: string
  ): Promise<void> => {
    if (isWails && getApp()?.SaveMessage) {
      return getApp().SaveMessage(id, sessionId, sender, content, toolCallsJSON);
    }
  },

  getMessages: async (sessionId: string): Promise<any[]> => {
    if (isWails && getApp()?.GetMessages) {
      return getApp().GetMessages(sessionId);
    }
    return [];
  },

  deleteMessagesFrom: async (sessionId: string, messageId: string): Promise<void> => {
    if (isWails && getApp()?.DeleteMessagesFrom) {
      return getApp().DeleteMessagesFrom(sessionId, messageId);
    }
  },

  cancelAgent: async (sessionId: string): Promise<void> => {
    if (isWails && getApp()?.CancelAgent) {
      return getApp().CancelAgent(sessionId);
    }
  },

  getActiveTasks: async (): Promise<string[]> => {
    if (isWails && getApp()?.GetActiveTasks) {
      return getApp().GetActiveTasks();
    }
    return [];
  },

  killTask: async (taskId: string): Promise<string> => {
    localStorage.setItem(`killed_task_${taskId}`, 'true');
    window.dispatchEvent(new CustomEvent('ttgide:task_killed', { detail: { taskId } }));
    if (isWails && getApp()?.KillTask) {
      return getApp().KillTask(taskId);
    }
    return `Đã dừng tiến trình ${taskId}`;
  },

  killAllBackgroundTasks: async (): Promise<string> => {
    window.dispatchEvent(new CustomEvent('ttgide:kill_all_tasks'));
    if (isWails && getApp()?.KillAllBackgroundTasks) {
      return getApp().KillAllBackgroundTasks();
    }
    return 'Đã dừng tất cả tiến trình chạy ngầm.';
  },

  saveSetting: async (key: string, value: string): Promise<void> => {
    if (isWails && getApp()?.SaveSetting) {
      return getApp().SaveSetting(key, value);
    }
    localStorage.setItem(`setting_${key}`, value);
  },

  getSetting: async (key: string): Promise<string> => {
    if (isWails && getApp()?.GetSetting) {
      return getApp().GetSetting(key);
    }
    return localStorage.getItem(`setting_${key}`) || '';
  },

  configureHarness: async (model: string, baseURL: string, apiKey: string): Promise<void> => {
    if (isWails && getApp()?.ConfigureHarness) {
      return getApp().ConfigureHarness(model, baseURL, apiKey);
    }
  },

  setAgentModel: async (modelId: string): Promise<void> => {
    if (isWails && getApp()?.SetAgentModel) {
      return getApp().SetAgentModel(modelId);
    }
  },

  getMCPServers: async (): Promise<any[]> => {
    if (isWails && getApp()?.GetMCPServers) {
      return getApp().GetMCPServers();
    }
    return JSON.parse(localStorage.getItem('antigravity_mcp_servers') || '[]');
  },

  saveMCPServer: async (name: string, command: string, args: string[], env: Record<string, string>): Promise<void> => {
    if (isWails && getApp()?.SaveMCPServer) {
      return getApp().SaveMCPServer(name, command, args, env);
    }
    const current = JSON.parse(localStorage.getItem('antigravity_mcp_servers') || '[]');
    const filtered = current.filter((s: any) => s.name !== name);
    filtered.push({ name, command, args, env, status: 'configured' });
    localStorage.setItem('antigravity_mcp_servers', JSON.stringify(filtered));
  },

  deleteMCPServer: async (name: string): Promise<void> => {
    if (isWails && getApp()?.DeleteMCPServer) {
      return getApp().DeleteMCPServer(name);
    }
    const current = JSON.parse(localStorage.getItem('antigravity_mcp_servers') || '[]');
    localStorage.setItem('antigravity_mcp_servers', JSON.stringify(current.filter((s: any) => s.name !== name)));
  },

  onWorkspaceChanged: (callback: (newWorkspace: string) => void): (() => void) => {
    const runtime = (window as any).runtime;
    if (isWails && runtime?.EventsOn) {
      runtime.EventsOn('workspace:changed', callback);
      return () => runtime.EventsOff?.('workspace:changed');
    }
    return () => {};
  },

  onAgentEvent: (callback: (evt: AgentEvent) => void): (() => void) => {
    const runtime = (window as any).runtime;
    if (isWails && runtime?.EventsOn) {
      runtime.EventsOn('agent:event', callback);
      return () => runtime.EventsOff?.('agent:event');
    }
    return () => {};
  },
};

