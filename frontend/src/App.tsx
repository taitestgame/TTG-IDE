import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { StatusBar } from './components/layout/StatusBar';
import { VibeMode } from './components/modes/VibeMode';
import { IDEMode } from './components/modes/IDEMode';
import { MultiAIMode } from './components/modes/MultiAIMode';
import { CommandPalette } from './components/common/CommandPalette';
import { SettingsModal } from './components/common/SettingsModal';
import { AppMode, Plan, Checkpoint, ToolDefinition, Skill, AgentEvent, ToolCall, UnifiedMessage, TrajectoryItem } from './types';
import { WailsService } from './services/wailsBridge';
import { FolderOpen, ArrowDownCircle } from 'lucide-react';

import { PermissionMode } from './components/common/PermissionSelector';
import { PendingQuestionData, extractOptionsFromText, extractQuestionPrompt } from './components/agent/QuestionCard';
import { ConfirmUndoModal } from './components/common/ConfirmUndoModal';

export const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('vibe');
  const [workspace, setWorkspace] = useState('c:/code/python/Anchuyennganh');
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [activeHighlight, setActiveHighlight] = useState<{ filePath: string; startLine: number; endLine: number; id?: string } | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [permissionMode, setPermissionMode] = useState<PermissionMode>(() => {
    return (localStorage.getItem('ttgide_permission_mode') as PermissionMode) || 'full';
  });

  const handlePermissionChange = async (newMode: PermissionMode) => {
    setPermissionMode(newMode);
    localStorage.setItem('ttgide_permission_mode', newMode);
    try {
      await WailsService.setPermissionMode(newMode);
      const label =
        newMode === 'full'
          ? '⚡ Auto-Approve'
          : newMode === 'ask'
          ? '🛡️ Prompt for Approval'
          : '🧭 Plan Only';
      showToast(`Chế độ: ${label}`);
    } catch (e) {
      console.error('Lỗi lưu permissionMode:', e);
    }
  };

  // --- UNIFIED CHAT & SESSION STATE (Đồng bộ 100% giữa Vibe Workspace & IDE Mode) ---
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `sess_${Date.now()}`);
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  const [activeConversationTitle, setActiveConversationTitle] = useState<string>('Cuộc hội thoại hiện tại');
  const [chatMessages, setChatMessages] = useState<UnifiedMessage[]>([]);
  const [sessions, setSessions] = useState<{ id: string; title: string; createdAt?: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveThinking, setLiveThinking] = useState<string | null>(null);
  const [livePlan, setLivePlan] = useState<Plan | null>(null);
  const [liveToolCalls, setLiveToolCalls] = useState<ToolCall[]>([]);
  const [liveTrajectory, setLiveTrajectory] = useState<TrajectoryItem[]>([]);
  const [liveAnswer, setLiveAnswer] = useState<string | null>(null);
  const currentRunTrajectoryRef = useRef<TrajectoryItem[]>([]);
  const liveSecondsRef = useRef<number>(1);
  const turnStartSecRef = useRef<number>(1);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestionData | null>(null);

  const handleAnswerQuestion = (ans: string) => {
    WailsService.answerQuestion(ans);
    setPendingQuestion(null);
    if (!chatLoading) {
      // Khi Agent đã kết thúc lượt trước, người dùng bấm nút option sẽ tự động gửi như tin nhắn mới!
      handleSendMessage(ans);
      return;
    }
    const ansMsgId = `ans_${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      {
        id: ansMsgId,
        sender: 'user',
        text: ans,
      },
    ]);
    if (currentSessionId) {
      WailsService.saveMessage(ansMsgId, currentSessionId, 'user', ans, '{}').catch(() => {});
    }
  };

  const handleClearPlan = () => {
    setLivePlan(null);
    setChatMessages((prev) =>
      prev.map((m) => (m.plan ? { ...m, plan: undefined } : m))
    );
    showToast('Đã xóa kế hoạch.');
  };
  const [liveSeconds, setLiveSeconds] = useState<number>(0);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ttgide_selected_model') || 'nemotron-3.5-lightning-free';
  });

  const handleSelectModel = useCallback((modelId: string) => {
    if (!modelId) return;
    setSelectedModel(modelId);
    try {
      localStorage.setItem('ttgide_selected_model', modelId);
      WailsService.saveSetting('selected_model', modelId);
      WailsService.setAgentModel(modelId).catch(() => {});
    } catch (e) {
      console.warn('Lỗi lưu model đã chọn:', e);
    }
  }, []);

  // Đồng bộ model đã lưu vào backend ngay khi ứng dụng khởi chạy
  useEffect(() => {
    const saved = localStorage.getItem('ttgide_selected_model');
    if (saved) {
      WailsService.setAgentModel(saved).catch(() => {});
    } else {
      WailsService.getSetting('selected_model')
        .then((backendModel) => {
          if (backendModel) {
            setSelectedModel(backendModel);
            localStorage.setItem('ttgide_selected_model', backendModel);
            WailsService.setAgentModel(backendModel).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
  const [showDiffCard, setShowDiffCard] = useState(false);

  // Layout states for IDE panels
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showRightChat, setShowRightChat] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messageQueueRef = useRef<{ text: string; promptWithImages: string; images: string[]; files?: string[] }[]>([]);

  // Modals state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Hiển thị thông báo toast tạm thời
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Nạp danh sách file trong workspace và bảo lưu tệp đang chọn (không tự ý nhảy về README.md)
  const loadFiles = useCallback(async (preserveFile?: string) => {
    try {
      const fileListStr = await WailsService.listFiles();
      const parsed = fileListStr
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      setFiles(parsed);

      if (parsed.length > 0) {
        setActiveFile((prevActive) => {
          const candidate = preserveFile || prevActive;
          if (!candidate) return parsed[0] || '';

          const normCand = candidate.replace(/\\/g, '/');
          const matched = parsed.find((p) => {
            const normP = p.replace(/\\/g, '/');
            return normP === normCand || normCand.endsWith('/' + normP) || normP.endsWith('/' + normCand) || normP.split('/').pop() === normCand.split('/').pop();
          });
          const target = matched || candidate;
          WailsService.readFile(target).then((content) => setFileContent(content)).catch(() => {});
          return target;
        });
      }
    } catch (e) {
      console.error('Không thể nạp danh sách tệp:', e);
    }
  }, []);

  // Chuyển đổi workspace sang thư mục mới
  const switchWorkspace = useCallback(async (newPath: string) => {
    if (!newPath || !newPath.trim()) return;
    const cleanPath = newPath.trim();
    if (workspace && (cleanPath === workspace || cleanPath.replace(/[/\\]+$/, '') === workspace.replace(/[/\\]+$/, ''))) {
      return;
    }
    try {
      await WailsService.setWorkspace(cleanPath);
      setWorkspace(cleanPath);

      const fileListStr = await WailsService.listFiles();
      const parsed = fileListStr
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      setFiles(parsed);

      setActiveFile('');
      setFileContent('');

      const cps = await WailsService.listCheckpoints();
      setCheckpoints(cps);
    } catch (err) {
      console.error('Lỗi khi chuyển workspace:', err);
      showToast(`Lỗi khi mở thư mục: ${err}`);
    }
  }, [workspace]);

  // Mở hộp thoại chọn thư mục dự án
  const handleOpenProjectFolder = async () => {
    try {
      const selected = await WailsService.openProjectDialog();
      if (selected) {
        await switchWorkspace(selected);
        const folderName = selected.split(/[/\\]/).pop() || selected;
        showToast(`Đã mở dự án: ${folderName}`);
      }
    } catch (err) {
      console.error('Lỗi khi mở hộp thoại:', err);
    }
  };

  // Khởi tạo ứng dụng & nạp toàn bộ dữ liệu từ backend Go
  useEffect(() => {
    const initApp = async () => {
      try {
        const currentMode = await WailsService.getMode();
        if (currentMode) setMode(currentMode);

        const ws = await WailsService.getWorkspace();
        if (ws) setWorkspace(ws);

        await loadFiles();

        const cps = await WailsService.listCheckpoints();
        setCheckpoints(cps);

        const toolDefs = await WailsService.getRegisteredTools();
        setTools(toolDefs);

        const loadedSkills = await WailsService.getSkills();
        setSkills(loadedSkills);

        const pm = await WailsService.getPermissionMode();
        if (pm) setPermissionMode(pm as PermissionMode);
      } catch (e) {
        console.error('Lỗi khởi tạo TTG IDE App:', e);
      }
    };

    initApp();

    const unsubWs = WailsService.onWorkspaceChanged(async (newWs) => {
      if (!newWs) return;
      const clean = newWs.trim();
      setWorkspace(clean);
      try {
        const fileListStr = await WailsService.listFiles();
        const parsed = fileListStr
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        setFiles(parsed);
        const cps = await WailsService.listCheckpoints();
        setCheckpoints(cps);
        const folderName = clean.split(/[/\\]/).pop() || clean;
        showToast(`Đã mở thư mục: ${folderName}`);
      } catch (e) {
        console.error('Lỗi khi nạp lại workspace sau khi kéo thả:', e);
      }
    });

    // Lắng nghe sự kiện Wails OnFileDrop trực tiếp từ hệ thống
    const handleSystemDrop = async (x: number, y: number, paths: string[]) => {
      if (paths && paths.length > 0) {
        const target = paths[0];
        // 1. Nếu thả vào khu vực khung chat (AgentChatPanel hoặc VibeMode) -> Bắn sự kiện đính kèm vào chat
        const elem = document.elementFromPoint(x, y);
        if (elem?.closest?.('.chat-drop-zone, .agent-chat-panel, .vibe-chat-panel, form, textarea, [data-chat-panel]')) {
          window.dispatchEvent(new CustomEvent('ttgide-chat-drop', { detail: { path: target, paths } }));
          return;
        }

        // 2. Nếu là file code/văn bản/ảnh đơn lẻ -> Mở trong Editor thay vì đổi toàn bộ Workspace
        const ext = target.split('.').pop()?.toLowerCase() || '';
        const singleFileExts = ['py', 'js', 'ts', 'tsx', 'jsx', 'go', 'html', 'css', 'json', 'md', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
        if (singleFileExts.includes(ext)) {
          handleSelectFile(target);
          setMode('ide');
          showToast(`Đã mở tệp: ${target.split(/[/\\]/).pop()}`);
          return;
        }

        // 3. Nếu là thư mục dự án -> Chuyển workspace
        await switchWorkspace(target);
        const folderName = target.split(/[/\\]/).pop() || target;
        showToast(`Đã mở thư mục: ${folderName}`);
      }
    };

    const runtime = (window as any).runtime;
    if (runtime?.OnFileDrop) {
      runtime.OnFileDrop(handleSystemDrop, false);
    }
    const unsubOsDrop = runtime?.EventsOn?.('os:file-drop', (data: any) => {
      if (data?.paths) {
        handleSystemDrop(data.x || 0, data.y || 0, data.paths);
      }
    });

    const unsubAgent = WailsService.onAgentEvent((evt: AgentEvent) => {
      console.log('[Agent Event]:', evt);
    });

    // Toàn bộ phím tắt bàn phím toàn cục
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+P: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      // Ctrl+,: Settings
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings((prev) => !prev);
      }
      // Ctrl+1: IDE Mode
      else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        handleModeChange('ide');
      }
      // Ctrl+2: AI Workspace Mode
      else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        handleModeChange('vibe');
      }
      // Ctrl+3: Multi-AI Mode
      else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        handleModeChange('multi-ai');
      }
      // Ctrl+M: Cycle Modes (IDE -> AI -> Multi-AI -> IDE)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMode((prev) => (prev === 'vibe' ? 'ide' : prev === 'ide' ? 'multi-ai' : 'vibe'));
      }
      // Ctrl+O: Open Folder
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenProjectFolder();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubWs();
      unsubAgent();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadFiles, switchWorkspace]);

  // Kéo thả dự án trực tiếp vào cửa sổ App
  const handleDragOver = (e: React.DragEvent) => {
    // 1. Kéo tệp nội bộ IDE (sidebar vào chat hoặc editor) -> Tuyệt đối không bật workspace overlay
    if (e.dataTransfer?.types?.includes('application/x-ttgide-file')) {
      if (isDraggingOver) setIsDraggingOver(false);
      return;
    }
    // 2. Kéo vào vùng chat, form nhập liệu hoặc editor -> Không hiển thị workspace overlay
    if ((e.target as HTMLElement)?.closest?.('.chat-drop-zone, .agent-chat-panel, .vibe-chat-panel, form, textarea, input, .editor-container, [data-chat-panel]')) {
      if (isDraggingOver) setIsDraggingOver(false);
      return;
    }
    // 3. Chỉ kích hoạt nếu kéo từ hệ điều hành bên ngoài
    if (!e.dataTransfer?.types?.includes('Files')) {
      if (isDraggingOver) setIsDraggingOver(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    // Nếu drop vào khu vực chat hoặc là tệp nội bộ -> Bỏ qua cho drop handler con xử lý
    if (
      e.dataTransfer?.types?.includes('application/x-ttgide-file') ||
      (e.target as HTMLElement)?.closest?.('.chat-drop-zone, .agent-chat-panel, .vibe-chat-panel, form, textarea, input, .editor-container, [data-chat-panel]')
    ) {
      setIsDraggingOver(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const handleDroppedTarget = async (target: string) => {
      const ext = target.split('.').pop()?.toLowerCase() || '';
      const singleFileExts = ['py', 'js', 'ts', 'tsx', 'jsx', 'go', 'html', 'css', 'json', 'md', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
      if (singleFileExts.includes(ext)) {
        handleSelectFile(target);
        setMode('ide');
        showToast(`Đã mở tệp: ${target.split(/[/\\]/).pop()}`);
        return;
      }
      await switchWorkspace(target);
      const folderName = target.split(/[/\\]/).pop() || target;
      showToast(`Đã mở thư mục dự án: ${folderName}`);
    };

    try {
      // 1. Thử giải mã đường dẫn file/folder tuyệt đối qua Wails ResolveFilePaths
      const runtime = (window as any).runtime;
      if (runtime?.ResolveFilePaths && e.dataTransfer.files.length > 0) {
        const resolvedPaths = await runtime.ResolveFilePaths(e.dataTransfer.files);
        if (resolvedPaths && resolvedPaths.length > 0 && resolvedPaths[0]) {
          await handleDroppedTarget(resolvedPaths[0]);
          return;
        }
      }
    } catch (err) {
      console.warn('Wails ResolveFilePaths warning:', err);
    }

    // 2. Dự phòng qua file.path nếu trình duyệt hỗ trợ
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const firstFile = droppedFiles[0] as any;
      const droppedPath = firstFile.path;
      if (droppedPath) {
        await handleDroppedTarget(droppedPath);
      }
    }
  };

  const handleSelectFile = async (filePath: string) => {
    setActiveFile(filePath);
    if (!filePath) {
      setFileContent('');
      return;
    }
    try {
      const content = await WailsService.readFile(filePath);
      setFileContent(content);
    } catch (e) {
      setFileContent(`// Không thể đọc nội dung của tệp: ${filePath}`);
    }
  };

  const handleOpenFile = useCallback((filePath: string, lineOrRange?: any) => {
    if (!filePath || !filePath.trim()) return;
    const cleanPath = filePath.trim();

    // Loại trừ thư mục (không có phần mở rộng hoặc kết thúc bằng / hay \)
    const isFolder = !cleanPath.includes('.') || cleanPath.endsWith('/') || cleanPath.endsWith('\\');
    if (isFolder) {
      setMode('ide');
      return;
    }

    handleSelectFile(cleanPath);

    if (lineOrRange) {
      if (typeof lineOrRange === 'number') {
        setActiveHighlight({ filePath: cleanPath, startLine: lineOrRange, endLine: lineOrRange });
      } else if (typeof lineOrRange === 'object' && lineOrRange.startLine) {
        setActiveHighlight({ ...lineOrRange, filePath: cleanPath });
      }
    } else {
      setActiveHighlight(null);
    }

    setMode('ide');
  }, []);

  const handleAcceptChange = useCallback((filePath?: string) => {
    setActiveHighlight(null);
  }, []);

  const handleSaveFile = async (path: string, content: string) => {
    try {
      await WailsService.saveFile(path, content);
      setFileContent(content);
      await loadFiles(path);
      showToast(`Đã lưu tệp: ${path.split(/[/\\]/).pop()}`);
    } catch (e) {
      console.error('Lỗi khi lưu tệp:', e);
    }
  };

  const handleModeChange = async (newMode: AppMode) => {
    setMode(newMode);
    await WailsService.setMode(newMode);
  };

  const handleTriggerAgent = async (prompt: string, verifyCmd?: string, sessionId?: string, extraFiles?: string[]): Promise<Plan> => {
    const sid = sessionId || `session_${Date.now()}`;
    const isNewProject = /tạo\s+(?:project|dự\s*án|ứng\s*dụng|app|mới)/i.test(prompt);

    // Trích xuất toàn bộ các tệp được gắn thẻ @tên_file trong câu hỏi (ví dụ: @hello.py, @main.go)
    const mentionedFiles: string[] = [];
    const reMention = /@([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)/g;
    let m;
    while ((m = reMention.exec(prompt)) !== null) {
      if (!mentionedFiles.includes(m[1])) {
        mentionedFiles.push(m[1]);
      }
    }

    let filesToSend: string[] = [];
    if (extraFiles && extraFiles.length > 0) {
      for (const ef of extraFiles) {
        if (!filesToSend.includes(ef)) filesToSend.push(ef);
      }
    }
    if (!isNewProject) {
      if (mentionedFiles.length > 0) {
        for (const mf of mentionedFiles) {
          if (!filesToSend.includes(mf)) filesToSend.push(mf);
        }
      }
      const isUrlQuery = /https?:\/\/[^\s]+/i.test(prompt);
      const isGeneralQuery = /^(giải thích|tìm kiếm|tra cứu|hỏi|cho tôi biết|ai|này là gì)/i.test(prompt.trim());
      if (filesToSend.length === 0 && !isUrlQuery && !isGeneralQuery && activeFile) {
        if (/(file|tệp|code|hàm|lỗi|sửa|chạy|đoạn mã|trong này|ở đây)/i.test(prompt)) {
          filesToSend.push(activeFile);
        }
      }
    }

    const plan = await WailsService.triggerAgent(
      sid,
      prompt,
      verifyCmd || '',
      filesToSend
    );
    await loadFiles(activeFile);
    const cps = await WailsService.listCheckpoints();
    setCheckpoints(cps);
    return plan;
  };

  const handleNewFile = async () => {
    const name = window.prompt('Nhập tên tệp mới cần tạo (ví dụ: main.py hoặc helo.py):');
    if (name && name.trim()) {
      try {
        const clean = name.trim();
        await WailsService.saveFile(clean, '');
        await loadFiles(clean);
        await handleSelectFile(clean);
        showToast(`Đã tạo tệp: ${clean}`);
      } catch (e) {
        console.error('Lỗi tạo tệp:', e);
      }
    }
  };

  const handleRunTests = async () => {
    try {
      showToast('Đang chạy kiểm thử tự động (go test ./...)...');
      const out = await WailsService.runCommand('go test ./...');
      showToast(`Kiểm thử: ${out ? out.slice(0, 40) : 'Hoàn thành'}`);
    } catch (e) {
      console.error(e);
    }
  };

  // State cho hộp thoại Confirm Undo modal
  const [undoModalState, setUndoModalState] = useState<{
    isOpen: boolean;
    targetMsg?: UnifiedMessage;
    checkpointId?: string;
    modifiedFiles: string[];
    createdFiles: string[];
  }>({
    isOpen: false,
    modifiedFiles: [],
    createdFiles: [],
  });

  const openConfirmUndo = (msg?: UnifiedMessage, cpId?: string) => {
    // 1. Tìm checkpoint mục tiêu
    const targetCp = cpId
      ? checkpoints.find((c) => c.id === cpId)
      : checkpoints.find((c) => c.sessionId === currentSessionId) || checkpoints[0];

    let modFiles: string[] = targetCp?.modifiedFiles ? [...targetCp.modifiedFiles] : [];
    let creFiles: string[] = targetCp?.createdFiles ? [...targetCp.createdFiles] : [];

    // 2. Bổ sung từ modifiedFiles hiện hành nếu có
    if (modifiedFiles && modifiedFiles.length > 0) {
      for (const mf of modifiedFiles) {
        if (!modFiles.includes(mf) && !creFiles.includes(mf)) {
          modFiles.push(mf);
        }
      }
    }

    // 3. Nếu checkpoint chưa có danh sách, trích xuất từ msg.toolCalls
    if (modFiles.length === 0 && creFiles.length === 0) {
      const inspectCalls = msg?.toolCalls || (chatMessages.length > 0 ? chatMessages[chatMessages.length - 1]?.toolCalls : undefined);
      if (inspectCalls) {
        for (const tc of inspectCalls) {
          const p = tc.arguments?.path || tc.arguments?.TargetFile || tc.arguments?.targetFile;
          if (typeof p === 'string' && p.trim()) {
            const cleanP = p.trim();
            if (tc.name === 'write_file' || tc.name === 'create_file') {
              if (!creFiles.includes(cleanP) && !modFiles.includes(cleanP)) creFiles.push(cleanP);
            } else if (['edit_file', 'modify_file', 'replace_file_content', 'multi_replace_file_content'].includes(tc.name)) {
              if (!modFiles.includes(cleanP)) modFiles.push(cleanP);
            }
          }
        }
      }
    }

    // 3. Dự phòng qua targetCp.files
    if (modFiles.length === 0 && creFiles.length === 0 && targetCp?.files) {
      modFiles = [...targetCp.files];
    }

    setUndoModalState({
      isOpen: true,
      targetMsg: msg,
      checkpointId: targetCp?.id || cpId,
      modifiedFiles: modFiles,
      createdFiles: creFiles,
    });
  };

  const handleConfirmUndoAction = async () => {
    const { targetMsg, checkpointId } = undoModalState;
    setUndoModalState((prev) => ({ ...prev, isOpen: false }));

    if (chatLoading && runningSessionId === currentSessionId) {
      handleCancelChat();
    }

    // 1. Rollback file bằng Checkpoint Manager
    const targetCpId = checkpointId || (checkpoints.length > 0 ? checkpoints[0].id : '');
    if (targetCpId) {
      try {
        await WailsService.rollback(targetCpId);
        const updatedCps = await WailsService.listCheckpoints();
        setCheckpoints(updatedCps);
      } catch (err) {
        console.error('Lỗi khi rollback files:', err);
      }
    }

    // 2. Hoàn tác tin nhắn
    let promptToRestore = '';
    if (targetMsg) {
      const targetId = targetMsg.id;
      const idx = chatMessages.findIndex((m) => m.id === targetId);
      if (idx >= 0) {
        if (targetMsg.sender === 'user') {
          promptToRestore = targetMsg.text;
          setChatMessages((prev) => prev.slice(0, idx));
          await WailsService.deleteMessagesFrom(currentSessionId, targetId).catch(() => {});
        } else {
          // Là agent message: xóa cả lượt agent và user prompt tương ứng
          const userIdx = idx > 0 && chatMessages[idx - 1]?.sender === 'user' ? idx - 1 : idx;
          promptToRestore = chatMessages[userIdx]?.text || '';
          setChatMessages((prev) => prev.slice(0, userIdx));
          await WailsService.deleteMessagesFrom(currentSessionId, chatMessages[userIdx].id).catch(() => {});
        }
      }
    } else if (chatMessages.length > 0) {
      // Rollback lượt cuối cùng
      const lastMsg = chatMessages[chatMessages.length - 1];
      const prevMsg = chatMessages.length > 1 ? chatMessages[chatMessages.length - 2] : null;
      if (lastMsg.sender === 'agent' && prevMsg?.sender === 'user') {
        promptToRestore = prevMsg.text;
        setChatMessages((prev) => prev.slice(0, -2));
        await WailsService.deleteMessagesFrom(currentSessionId, prevMsg.id).catch(() => {});
      } else {
        promptToRestore = lastMsg.text;
        setChatMessages((prev) => prev.slice(0, -1));
        await WailsService.deleteMessagesFrom(currentSessionId, lastMsg.id).catch(() => {});
      }
    }

    // 3. Phục hồi prompt vào ô nhập
    if (promptToRestore) {
      window.dispatchEvent(new CustomEvent('ttgide-restore-prompt', { detail: { text: promptToRestore } }));
    }

    // 4. Nạp lại file
    await loadFiles();
    if (activeFile) {
      await handleSelectFile(activeFile);
    }
    showToast('Đã hoàn tác tin nhắn và khôi phục toàn bộ mã nguồn.');
  };

  const handleRollback = (id?: string) => {
    openConfirmUndo(undefined, id);
  };

  const handleRollbackFilesOnly = async (cpId?: string) => {
    const targetCp = cpId
      ? checkpoints.find((c) => c.id === cpId)
      : checkpoints.find((c) => c.sessionId === currentSessionId) || (checkpoints.length > 0 ? checkpoints[0] : null);

    const targetCpId = targetCp?.id || (checkpoints.length > 0 ? checkpoints[0].id : '');
    if (targetCpId) {
      try {
        await WailsService.rollback(targetCpId);
        const updatedCps = await WailsService.listCheckpoints();
        setCheckpoints(updatedCps);
      } catch (err) {
        console.error('Lỗi khi rollback files:', err);
      }
    }

    await loadFiles();
    if (activeFile) {
      await handleSelectFile(activeFile);
    }
    showToast('Đã khôi phục toàn bộ file về trạng thái trước đó.');
  };

  // 1-Click Apply solution from Multi-AI directly into Monaco Editor
  const handleApplySolutionFromMultiAI = async (solutionText: string) => {
    setFileContent(solutionText);
    if (activeFile) {
      try {
        await WailsService.saveFile(activeFile, solutionText);
        showToast(`Đã lưu và áp dụng giải pháp Multi-AI vào: ${activeFile}`);
      } catch (err) {
        console.error('Lỗi khi lưu giải pháp:', err);
      }
    }
    // Switch directly to IDE Mode so the developer immediately reviews the code in Monaco
    handleModeChange('ide');
  };

  // Nạp danh sách các session từ SQLite
  const loadSessions = useCallback(async () => {
    try {
      const list = await WailsService.listSessions();
      setSessions(list || []);
    } catch (e) {
      console.warn('Lỗi nạp sessions:', e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    WailsService.setPermissionMode(permissionMode);
  }, [loadSessions]);

  useEffect(() => {
    if (!chatLoading) {
      setLiveSeconds(1);
      liveSecondsRef.current = 1;
      return;
    }
    const timer = setInterval(() => {
      setLiveSeconds((s) => {
        const next = s + 1;
        liveSecondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [chatLoading]);

  const handleSelectSession = async (sess: { id: string; title: string }) => {
    setCurrentSessionId(sess.id);
    setActiveConversationTitle(sess.title);
    try {
      const msgs = await WailsService.getMessages(sess.id);
      if (msgs && msgs.length > 0) {
        setChatMessages(
          msgs.map((m: any) => {
            let extraData: any = {};
            const rawJson = m.toolCallsJson || m.toolCallsJSON || m.tool_calls_json;
            if (rawJson) {
              try {
                extraData = JSON.parse(rawJson);
              } catch {}
            }
            const restoredTools = extraData.toolCalls || (Array.isArray(extraData) ? extraData : undefined);
            return {
              id: m.id || String(Date.now()),
              sender: m.sender === 'user' ? 'user' : 'agent',
              text: m.content,
              images: extraData.images || undefined,
              files: extraData.files || undefined,
              toolCalls: restoredTools,
              thinking: extraData.thinking,
              plan: extraData.plan,
              trajectory: extraData.trajectory || undefined,
              workedTime: extraData.workedTime,
              statusNote: extraData.statusNote,
              timestamp: m.timestamp || m.Timestamp,
            };
          })
        );
      } else {
        setChatMessages([]);
      }
    } catch {
      setChatMessages([]);
    }
  };

  const handleNewConversation = () => {
    const newId = `sess_${Date.now()}`;
    setCurrentSessionId(newId);
    setActiveConversationTitle('Cuộc hội thoại mới');
    setLivePlan(null);
    setChatMessages([]);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await WailsService.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      handleNewConversation();
    }
  };

  const handleCancelChat = () => {
    messageQueueRef.current = [];
    const cancelledSession = runningSessionId;
    if (cancelledSession) {
      WailsService.cancelAgent(cancelledSession);
    }
    WailsService.cancelAgent('active_session');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Giữ nguyên vẹn toàn bộ những gì AI đã in ra (trajectory, tools, thinking, plan) trước khi bấm dừng
    const preservedTools = liveToolCalls.length > 0 ? [...liveToolCalls] : undefined;
    const preservedThinking = liveThinking || undefined;
    const preservedPlan = livePlan || undefined;
    const preservedTrajectory = currentRunTrajectoryRef.current.length > 0 ? [...currentRunTrajectoryRef.current] : undefined;

    setRunningSessionId(null);
    setChatLoading(false);
    setLiveStatus(null);
    setLiveThinking(null);
    setLivePlan(null);
    setLiveToolCalls([]);
    setLiveTrajectory([]);
    currentRunTrajectoryRef.current = [];
    setPendingQuestion(null);

    if (cancelledSession && currentSessionIdRef.current === cancelledSession) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `stop_${Date.now()}`,
          sender: 'agent',
          text: 'Đã dừng tạo phản hồi theo yêu cầu của bạn',
          toolCalls: preservedTools,
          thinking: preservedThinking,
          trajectory: preservedTrajectory,
          plan: preservedPlan,
        },
      ]);
    }
  };

  const executeChatTurn = async (targetSessionId: string, text: string, promptWithImages: string, currentImages: string[], currentFiles: string[] = []) => {
    // Không tự động đổi permissionMode - giữ nguyên vẹn chế độ người dùng đã lựa chọn
    setRunningSessionId(targetSessionId);
    setChatLoading(true);
    setLiveStatus('Working...');
    setLiveToolCalls([]);
    setLiveThinking('');
    setLiveTrajectory([]);
    setLiveAnswer(null);
    currentRunTrajectoryRef.current = [];
    turnStartSecRef.current = 1;
    setLiveSeconds(1);
    liveSecondsRef.current = 1;
    const liveTimer = setInterval(() => {
      setLiveSeconds((prev) => {
        const next = prev + 1;
        liveSecondsRef.current = next;
        if (next % 2 === 0) {
          loadFiles();
        }
        return next;
      });
    }, 1000);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    const startTime = Date.now();

    const currentRunTools: ToolCall[] = [];
    let currentRunThinking = '';
    const unsubAgent = WailsService.onAgentEvent((evt: any) => {
      if (!evt) return;
      const evtSession = evt.sessionId || evt.sessionID;
      // Chỉ nhận sự kiện thuộc đúng session đang chạy hoặc active_session
      if (evtSession && evtSession !== targetSessionId && evtSession !== 'active_session') return;

      if (evt.type === 'ask_question') {
        const payload = evt.payload as any;
        if (payload && payload.question) {
          setPendingQuestion({
            question: payload.question,
            options: Array.isArray(payload.options) ? payload.options : [],
            allowCustom: payload.allowCustom ?? true,
          });
          setLiveStatus(`Chờ bạn lựa chọn: ${payload.question.slice(0, 45)}...`);
        }
      } else if (evt.type === 'tool_start') {
        const tc = evt.payload as ToolCall;
        if (tc) {
          const detail = tc.arguments?.path ? ` (${tc.arguments.path})` : tc.arguments?.command ? ` (${tc.arguments.command})` : '';
          setLiveStatus(`Đang thực thi: ${tc.name}${detail}...`);
          currentRunTools.push(tc);
          setLiveToolCalls([...currentRunTools]);

          const traj = currentRunTrajectoryRef.current;
          const last = traj[traj.length - 1];
          if (last && last.type === 'thought' && (!last.seconds || last.seconds <= 1)) {
            last.seconds = Math.max(1, liveSecondsRef.current - turnStartSecRef.current);
          }
          traj.push({
            type: 'tool',
            toolCall: tc,
          });
          setLiveTrajectory([...traj]);

          const fPath = tc.arguments?.path || tc.arguments?.TargetFile || tc.arguments?.targetFile || tc.arguments?.filePath || tc.arguments?.AbsolutePath || '';
          if (fPath) {
            setActiveFile(fPath);
            const immediateContent = tc.arguments?.content || tc.arguments?.CodeContent || tc.arguments?.replacement || tc.arguments?.ReplacementContent || '';
            if (immediateContent && typeof immediateContent === 'string') {
              setFileContent(immediateContent);
            } else if (['view_file', 'read_file', 'FileRead'].includes(tc.name)) {
              WailsService.readFile(fPath).then((c) => setFileContent(c)).catch(() => {});
            }
            loadFiles(fPath);
          }
        }
      } else if (evt.type === 'tool_end') {
        const tc = evt.payload as ToolCall;
        if (tc) {
          const idx = currentRunTools.findIndex((t) => t.id === tc.id);
          if (idx >= 0) {
            currentRunTools[idx] = tc;
          } else {
            currentRunTools.push(tc);
          }
          setLiveToolCalls([...currentRunTools]);
          setLiveStatus(`Đã hoàn thành: ${tc.name}`);

          const traj = currentRunTrajectoryRef.current;
          const tIdx = traj.findIndex((item) => item.type === 'tool' && item.toolCall.id === tc.id);
          if (tIdx >= 0) {
            traj[tIdx] = { type: 'tool', toolCall: tc };
          } else {
            traj.push({ type: 'tool', toolCall: tc });
          }
          setLiveTrajectory([...traj]);

          if (['write_file', 'edit_file', 'modify_file', 'create_file', 'replace_file_content', 'multi_replace_file_content', 'write_to_file', 'replace_in_file', 'FileWrite', 'FileEdit'].includes(tc.name)) {
            const fPath = tc.arguments?.path || tc.arguments?.targetFile || tc.arguments?.TargetFile || tc.arguments?.AbsolutePath || tc.arguments?.filePath || '';
            if (fPath) {
              setModifiedFiles((prev) => Array.from(new Set([...prev, fPath])));
              setShowDiffCard(true);
              setActiveFile(fPath);
              WailsService.readFile(fPath).then((c) => setFileContent(c)).catch(() => {});
              loadFiles(fPath);
            }
          } else if (['run_command', 'execute_command', 'Bash'].includes(tc.name)) {
            loadFiles(activeFile);
          }
        }
      } else if (evt.type === 'thought_stream') {
        const payload = evt.payload as any;
        const fullTh = (payload?.full || payload?.text || '').trim();
        const sec = typeof payload?.seconds === 'number' && payload.seconds > 0 ? payload.seconds : 1;
        if (fullTh) {
          currentRunThinking = fullTh;
          setLiveThinking(fullTh);
          const lines = fullTh.split('\n').filter(Boolean);
          const lastLine = lines[lines.length - 1] || fullTh;
          setLiveStatus(`Suy luận (${sec}s): ${lastLine.slice(0, 45)}...`);

          const traj = currentRunTrajectoryRef.current;
          const last = traj[traj.length - 1];
          if (last && last.type === 'thought') {
            last.text = fullTh;
            last.seconds = sec;
          } else {
            traj.push({
              type: 'thought',
              id: `thought_${Date.now()}`,
              text: fullTh,
              seconds: sec,
            });
          }
          setLiveTrajectory([...traj]);
        }
      } else if (evt.type === 'content_stream') {
        const payload = evt.payload as any;
        const fullContent = (payload?.full || payload?.content || '');
        if (fullContent) {
          setLiveAnswer(fullContent);
        }
      } else if (evt.type === 'thought') {
        let cleanTh = '';
        let thoughtSec = 1;
        if (typeof evt.payload === 'string') {
          cleanTh = evt.payload.trim();
        } else if (evt.payload && typeof evt.payload === 'object') {
          cleanTh = (evt.payload.text || '').trim();
          if (typeof evt.payload.seconds === 'number' && evt.payload.seconds > 0) {
            thoughtSec = evt.payload.seconds;
          }
        }
        if (cleanTh.length > 0) {
          currentRunThinking = cleanTh;
          setLiveThinking(cleanTh);
          const lines = cleanTh.split('\n').filter(Boolean);
          const lastLine = lines[lines.length - 1] || cleanTh;
          setLiveStatus(`Suy luận (${thoughtSec}s): ${lastLine.slice(0, 45)}...`);

          const traj = currentRunTrajectoryRef.current;
          const last = traj[traj.length - 1];
          if (last && last.type === 'thought') {
            last.text = cleanTh;
            last.seconds = thoughtSec;
          } else {
            traj.push({
              type: 'thought',
              id: `thought_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              text: cleanTh,
              seconds: thoughtSec,
            });
          }
          setLiveTrajectory([...traj]);
        }
      } else if (evt.type === 'plan') {
        if (evt.payload) {
          setLivePlan(evt.payload as Plan);
        }
      }
    });

    try {
      await WailsService.setAgentModel(selectedModel);
      const plan = await handleTriggerAgent(promptWithImages, '', targetSessionId, currentFiles);
      setLivePlan(plan);
      if (activeFile) {
        WailsService.readFile(activeFile).then((c) => setFileContent(c)).catch(() => {});
      }
      if (abortCtrl.signal.aborted || currentSessionIdRef.current !== targetSessionId) {
        return;
      }

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const botMsgId = `bot_${Date.now()}`;

      const finalTools = (plan.toolCalls && plan.toolCalls.length > 0)
        ? plan.toolCalls
        : currentRunTools;

      let answerText = plan.answer || '';
      if (answerText.startsWith('Lỗi gọi Model AI:') || answerText.startsWith('⚠️ Lỗi')) {
        throw new Error(answerText);
      }
      if (!answerText && finalTools.length > 0) {
        answerText = `Đã thực thi thành công ${finalTools.length} công cụ: ${finalTools.map((t) => t.name).join(', ')}.`;
      }
      if (!answerText) {
        answerText = 'Đã hoàn thành xử lý yêu cầu.';
      }

      const resolvedThinking = (plan.thinking && plan.thinking.trim().length > 0) ? plan.thinking : (currentRunThinking || undefined);

      const traj = currentRunTrajectoryRef.current;
      const last = traj[traj.length - 1];
      if (last && last.type === 'thought' && (!last.seconds || last.seconds <= 1)) {
        last.seconds = Math.max(1, liveSecondsRef.current - turnStartSecRef.current);
      }

      const botMsg: UnifiedMessage = {
        id: botMsgId,
        sender: 'agent',
        text: answerText,
        thinking: resolvedThinking,
        toolCalls: finalTools.length > 0 ? finalTools : undefined,
        trajectory: traj.length > 0 ? [...traj] : undefined,
        plan: plan,
        workedTime: `Phản hồi từ ${selectedModel} (${durationSec}s)`,
        timestamp: new Date().toISOString(),
      };

      // Chỉ thêm vào danh sách tin nhắn trên màn hình nếu người dùng vẫn đang ở session này
      if (currentSessionIdRef.current === targetSessionId) {
        setLiveAnswer(null);
        setChatMessages((prev) => [...prev, botMsg]);
      }

      const toolCallsJson = JSON.stringify({
        toolCalls: finalTools,
        thinking: resolvedThinking,
        plan: plan,
        workedTime: botMsg.workedTime,
        trajectory: botMsg.trajectory,
      });
      // Luôn lưu vào SQLite theo đúng targetSessionId
      await WailsService.saveMessage(botMsgId, targetSessionId, 'agent', answerText, toolCallsJson);
    } catch (err: any) {
      if (abortCtrl.signal.aborted) return;
      setLiveAnswer(null);
      const errMsg: UnifiedMessage = {
        id: `err_${Date.now()}`,
        sender: 'agent',
        text: `⚠️ Lỗi kết nối AI hoặc thực thi Agent Harness: ${err?.message || err}\n\nVui lòng đảm bảo API Bridge hoặc nhà cung cấp AI đang hoạt động bình thường.`,
        timestamp: new Date().toISOString(),
      };
      if (currentSessionIdRef.current === targetSessionId) {
        setChatMessages((prev) => [...prev, errMsg]);
      }
      await WailsService.saveMessage(errMsg.id, targetSessionId, 'error', errMsg.text, '{}');
    } finally {
      clearInterval(liveTimer);
      unsubAgent();
      abortControllerRef.current = null;
      setLiveTrajectory([]);
      setLiveAnswer(null);
      currentRunTrajectoryRef.current = [];

      if (messageQueueRef.current.length > 0) {
        const nextItem = messageQueueRef.current.shift();
        if (nextItem) {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.statusNote?.includes('Đã chèn vào phiên')
                ? { ...m, statusNote: '⚡ Đang thực thi yêu cầu đã chèn...' }
                : m
            )
          );
          setTimeout(() => {
            executeChatTurn(targetSessionId, nextItem.text, nextItem.promptWithImages, nextItem.images, nextItem.files || []);
          }, 50);
          return;
        }
      }

      setRunningSessionId(null);
      setLiveStatus(null);
      setLiveThinking(null);
      setLiveToolCalls([]);
      setPendingQuestion(null);
      setChatLoading(false);
      loadFiles(activeFile);
    }
  };

  const handleSendMessage = async (text: string, images: string[] = [], files: string[] = []) => {
    // Nếu có session khác đang chạy, thông báo rõ ràng cho người dùng thay vì chèn nhầm
    if (chatLoading && runningSessionId && runningSessionId !== currentSessionId) {
      showToast('⚠️ Phiên khác đang chạy. Vui lòng dừng hoặc chờ phiên hiện tại hoàn thành.');
      return;
    }

    let promptWithImages = text;
    if (images.length > 0) {
      const imgPayloads = images.map((b64) => `[IMAGE_BASE64:${b64}]`).join('\n');
      promptWithImages = `${promptWithImages}\n\n${imgPayloads}`;
    }

    if (files.length > 0) {
      const fileBlocks: string[] = [];
      for (const f of files) {
        try {
          const content = await WailsService.readFile(f);
          fileBlocks.push(`[Nội dung tệp: ${f}]\n\`\`\`\n${content}\n\`\`\``);
        } catch {
          fileBlocks.push(`[Tệp đính kèm: ${f}]`);
        }
      }
      if (fileBlocks.length > 0) {
        promptWithImages = `${promptWithImages}\n\n${fileBlocks.join('\n\n')}`;
      }
    }

    const thisSessionId = currentSessionId;

    if (chatLoading && runningSessionId === thisSessionId) {
      // 1. Nếu đang có câu hỏi pendingQuestion từ AI Agent (ask_question), câu trả lời sẽ giải phóng câu hỏi đó ngay
      if (pendingQuestion) {
        handleAnswerQuestion(text);
        return;
      }

      // 2. Chèn trực tiếp thành một tin nhắn hiển thị rõ ràng ngay tại vị trí hiện tại của cuộc trò chuyện
      const steerMsgId = `steer_${Date.now()}`;
      const steerMsg: UnifiedMessage = {
        id: steerMsgId,
        sender: 'user',
        text,
        images,
        files: files.length > 0 ? files : undefined,
        timestamp: new Date().toISOString(),
        statusNote: '⚡ Đã chèn vào tiến trình đang chạy',
      };
      setChatMessages((prev) => [...prev, steerMsg]);
      WailsService.saveMessage(steerMsgId, thisSessionId, 'user', text, JSON.stringify({ files, images })).catch(() => {});
      WailsService.steerAgent(thisSessionId, promptWithImages || text);
      showToast('⚡ Đã gửi chỉ dẫn bổ sung vào phiên đang chạy!');
      return;
    }

    const userMsgId = `usr_${Date.now()}`;
    const userMsg: UnifiedMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      images,
      files: files.length > 0 ? files : undefined,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMsg]);

    try {
      await WailsService.saveSession(thisSessionId, text.slice(0, 36));
      await WailsService.saveMessage(userMsgId, thisSessionId, 'user', text, JSON.stringify({ files, images }));
      setActiveConversationTitle(text.slice(0, 36));
      loadSessions();
    } catch (err) {
      console.warn('Lỗi lưu SQLite:', err);
    }

    executeChatTurn(thisSessionId, text, promptWithImages, images, files);
  };

  const handleUndoMessage = (msg: UnifiedMessage) => {
    openConfirmUndo(msg);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#121214',
        position: 'relative',
      }}
    >
      {/* 1. Header Control Deck (3-Way Mode Switcher & System Status) */}
      <TitleBar
        mode={mode}
        onModeChange={handleModeChange}
        workspace={workspace}
        activeFile={activeFile}
        checkpointCount={checkpoints.length}
        onQuickRollback={() => handleRollback()}
        onOpenFolder={handleOpenProjectFolder}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        onOpenSettings={() => setShowSettings(true)}
        onNewFile={handleNewFile}
        onSaveFile={() => activeFile && handleSaveFile(activeFile, fileContent)}
        onRunTests={handleRunTests}
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={() => setShowLeftSidebar((p) => !p)}
        showTerminal={showTerminal}
        onToggleTerminal={() => setShowTerminal((p) => !p)}
        showRightChat={showRightChat}
        onToggleRightChat={() => setShowRightChat((p) => !p)}
        onResetLayout={() => {
          setShowLeftSidebar(true);
          setShowTerminal(true);
          setShowRightChat(true);
        }}
      />

      {/* 2. Main Stage: Chuyển đổi mượt mà giữa IDE Workspace, AI Workspace và Multi-AI Workspace (Đồng bộ 100% Session & Active File) */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: '100%', display: mode === 'vibe' ? 'flex' : 'none', flexDirection: 'column' }}>
          <VibeMode
            workspace={workspace}
            activeFile={activeFile}
            files={files}
            onSelectFile={(f) => handleOpenFile(f)}
            onOpenFile={handleOpenFile}
            onAcceptChange={handleAcceptChange}
            onOpenFolder={handleOpenProjectFolder}
            onOpenSettings={() => setShowSettings(true)}
            onRollback={() => handleRollbackFilesOnly()}
            onAnswerQuestion={handleAnswerQuestion}
            pendingQuestion={pendingQuestion}
            currentSessionId={currentSessionId}
            runningSessionId={runningSessionId}
            activeConversationTitle={activeConversationTitle}
            conversationMessages={chatMessages}
            sessions={sessions}
            loading={chatLoading && currentSessionId === runningSessionId}
            liveStatus={currentSessionId === runningSessionId ? liveStatus : null}
            liveThinking={currentSessionId === runningSessionId ? liveThinking : null}
            livePlan={currentSessionId === runningSessionId ? livePlan : null}
            liveToolCalls={currentSessionId === runningSessionId ? liveToolCalls : []}
            liveTrajectory={currentSessionId === runningSessionId ? liveTrajectory : []}
            liveAnswer={currentSessionId === runningSessionId ? liveAnswer : null}
            liveSeconds={currentSessionId === runningSessionId ? liveSeconds : 1}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            onSendMessage={handleSendMessage}
            onCancelChat={handleCancelChat}
            onSelectSession={handleSelectSession}
            onNewConversation={handleNewConversation}
            onDeleteSession={handleDeleteSession}
            modifiedFiles={modifiedFiles}
            showDiffCard={showDiffCard}
            onCloseDiffCard={() => setShowDiffCard(false)}
            permissionMode={permissionMode}
            onSelectPermissionMode={handlePermissionChange}
            onUndoMessage={handleUndoMessage}
            onClearPlan={handleClearPlan}
          />
        </div>
        <div style={{ height: '100%', width: '100%', display: mode === 'ide' ? 'flex' : 'none', flexDirection: 'column' }}>
          <IDEMode
            workspace={workspace}
            files={files}
            activeFile={activeFile}
            fileContent={fileContent}
            checkpoints={checkpoints}
            tools={tools}
            skills={skills}
            activeHighlight={activeHighlight}
            onOpenFile={handleOpenFile}
            onAcceptChange={handleAcceptChange}
            onSelectFile={handleSelectFile}
            onContentChange={(val) => setFileContent(val)}
            onSaveFile={handleSaveFile}
            onRefreshFiles={loadFiles}
            onTriggerAgent={handleTriggerAgent}
            onRollback={handleRollbackFilesOnly}
            onOpenSettings={() => setShowSettings(true)}
            currentSessionId={currentSessionId}
            activeConversationTitle={activeConversationTitle}
            messages={chatMessages}
            sessions={sessions}
            loading={chatLoading && currentSessionId === runningSessionId}
            liveStatus={currentSessionId === runningSessionId ? liveStatus : null}
            liveThinking={currentSessionId === runningSessionId ? liveThinking : null}
            livePlan={currentSessionId === runningSessionId ? livePlan : null}
            liveToolCalls={currentSessionId === runningSessionId ? liveToolCalls : []}
            liveTrajectory={currentSessionId === runningSessionId ? liveTrajectory : []}
            liveAnswer={currentSessionId === runningSessionId ? liveAnswer : null}
            liveSeconds={currentSessionId === runningSessionId ? liveSeconds : 1}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            onSendMessage={handleSendMessage}
            onCancelChat={handleCancelChat}
            onSelectSession={handleSelectSession}
            onNewConversation={handleNewConversation}
            onDeleteSession={handleDeleteSession}
            onUndoMessage={handleUndoMessage}
            permissionMode={permissionMode}
            onSelectPermissionMode={handlePermissionChange}
            pendingQuestion={pendingQuestion}
            onAnswerQuestion={handleAnswerQuestion}
            onClearPlan={handleClearPlan}
            showLeftSidebar={showLeftSidebar}
            onToggleLeftSidebar={() => setShowLeftSidebar((p) => !p)}
            showTerminal={showTerminal}
            onToggleTerminal={() => setShowTerminal((p) => !p)}
            showRightChat={showRightChat}
            onToggleRightChat={() => setShowRightChat((p) => !p)}
            onResetLayout={() => {
              setShowLeftSidebar(true);
              setShowTerminal(true);
              setShowRightChat(true);
            }}
          />
        </div>
        {/* Lazy mount MultiAIMode khi chuyển sang tab 3 để tiết kiệm ~250MB RAM */}
        {mode === 'multi-ai' && (
          <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <MultiAIMode
              workspace={workspace}
              activeFile={activeFile}
              onApplyToEditor={handleApplySolutionFromMultiAI}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>
        )}
      </main>

      {/* 3. Status Bar Chân trang */}
      <StatusBar
        workspace={workspace}
        activeFile={activeFile}
        checkpointCount={checkpoints.length}
        permissionMode={permissionMode}
        onSelectPermissionMode={handlePermissionChange}
      />

      {/* 4. Command Palette (Ctrl+Shift+P) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSwitchMode={handleModeChange}
        onOpenFolder={handleOpenProjectFolder}
        onSaveFile={() => activeFile && handleSaveFile(activeFile, fileContent)}
        onOpenSettings={() => setShowSettings(true)}
        onRollback={() => handleRollback()}
        onRefreshFiles={loadFiles}
        onRunMultiAI={() => handleModeChange('multi-ai')}
      />

      {/* 5. Settings Modal (Ctrl+,) */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onRefreshModels={loadFiles}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
      />

      {/* 6. Visual Drag-and-Drop Overlay */}
      {isDraggingOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(2, 132, 199, 0.45)',
            backdropFilter: 'blur(8px)',
            border: '3px dashed #38bdf8',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            color: '#ffffff',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FolderOpen size={42} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.5px' }}>
            Thả thư mục dự án vào đây để mở (Open Workspace)
          </div>
          <div style={{ fontSize: '13px', color: '#bae6fd' }}>
            Toàn bộ giao diện IDE, AI Workspace & Multi-AI Pipeline sẽ chuyển sang dự án mới
          </div>
        </div>
      )}

      {/* 7. Toast Notification Banner */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            bottom: '34px',
            right: '20px',
            background: '#18181b',
            border: '1px solid #0284c7',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            borderRadius: '6px',
            padding: '8px 14px',
            color: '#f4f4f5',
            fontSize: '12px',
            fontWeight: 500,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ArrowDownCircle size={15} color="#38bdf8" />
          <span>{notification}</span>
        </div>
      )}
      {/* 8. Confirm Undo Modal (Antigravity parity) */}
      <ConfirmUndoModal
        isOpen={undoModalState.isOpen}
        onClose={() => setUndoModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmUndoAction}
        modifiedFiles={undoModalState.modifiedFiles}
        createdFiles={undoModalState.createdFiles}
      />
    </div>
  );
};

export default App;
