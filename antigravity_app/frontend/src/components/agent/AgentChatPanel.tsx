import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  History,
  MoreHorizontal,
  X,
  Mic,
  ArrowUp,
  Square,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Swords,
  Bot,
  Brain,
  Trash2,
  Wrench,
  Terminal,
  FileCode,
  CheckCircle2,
  XCircle,
  Copy,
  Undo2,
  Image as ImageIcon,
  FolderOpen,
  Paperclip,
  Eye,
} from 'lucide-react';
import { Plan, Checkpoint, MultiAISession, MultiAIConfig, ToolCall, UnifiedMessage, TrajectoryItem } from '../../types';
import { ModelSelector } from './ModelSelector';
import { PermissionSelector, PermissionMode } from '../common/PermissionSelector';
import { TrajectoryStream, WorkingIndicator } from './TrajectoryStream';
import { WailsService } from '../../services/wailsBridge';
import { ToolCallCard } from './ToolCallCard';
import { PlanCard } from './PlanCard';
import { MessageActionBar, extractPlanFromText } from './MessageActionBar';
import { StandardFileIcon } from '../common/StandardFileIcon';
import { MarkdownMessage } from './MarkdownMessage';
import { ImageViewerModal } from '../common/ImageViewerModal';
import { SlashCommandsMenu, SlashCommandItem } from '../common/SlashCommandsMenu';
import { QuestionCard, PendingQuestionData, extractOptionsFromText, extractQuestionPrompt } from './QuestionCard';

interface AgentChatPanelProps {
  width?: number;
  onTriggerAgent?: (prompt: string, verifyCmd?: string, sessionId?: string) => Promise<Plan>;
  checkpoints: Checkpoint[];
  onRollback: (id: string) => void;
  activeFile?: string;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onOpenFile?: (path: string, lineOrRange?: any) => void;
  onAcceptChange?: (filePath: string) => void;
  files?: string[];

  permissionMode?: PermissionMode;
  onSelectPermissionMode?: (mode: PermissionMode) => void;
  pendingQuestion?: PendingQuestionData | null;
  onAnswerQuestion?: (answer: string) => void;

  // Shared Chat State & Handlers
  currentSessionId?: string;
  activeConversationTitle?: string;
  messages?: UnifiedMessage[];
  sessions?: { id: string; title: string; createdAt?: string }[];
  loading?: boolean;
  liveStatus?: string | null;
  liveThinking?: string | null;
  livePlan?: Plan | null;
  liveToolCalls?: ToolCall[];
  liveTrajectory?: TrajectoryItem[];
  liveAnswer?: string | null;
  liveSeconds?: number;
  selectedModel?: string;
  onSelectModel?: (m: string) => void;
  onSendMessage?: (text: string, images?: string[], files?: string[]) => void;
  onCancelChat?: () => void;
  onSelectSession?: (sess: { id: string; title: string }) => void;
  onNewConversation?: () => void;
  onDeleteSession?: (e: React.MouseEvent, id: string) => void;
  onUndoMessage?: (msg: UnifiedMessage) => Promise<void> | void;
  onClearPlan?: () => void;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  width = 400,
  onTriggerAgent,
  checkpoints,
  onRollback,
  activeFile,
  onClose,
  onOpenSettings,
  currentSessionId = '',
  activeConversationTitle = '',
  messages = [],
  sessions = [],
  loading = false,
  liveStatus = null,
  liveThinking = null,
  livePlan = null,
  liveToolCalls = [],
  liveTrajectory = [],
  liveAnswer = null,
  liveSeconds = 1,
  selectedModel = (typeof window !== 'undefined' && localStorage.getItem('ttgide_selected_model')) || 'nemotron-3.5-lightning-free',
  onSelectModel,
  onSendMessage,
  onCancelChat,
  onSelectSession,
  onNewConversation,
  onDeleteSession,
  onUndoMessage,
  permissionMode = 'full',
  onSelectPermissionMode,
  pendingQuestion = null,
  onAnswerQuestion,
  onClearPlan,
  onOpenFile,
  onAcceptChange,
  files,
}) => {
  const [panelTab, setPanelTab] = useState<'chat' | 'arena'>('chat');
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [showDiffCard, setShowDiffCard] = useState(false);
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [localFileList, setLocalFileList] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [messageActiveViews, setMessageActiveViews] = useState<Record<string, 'all' | 'none' | 'plan' | 'cmd' | 'code' | 'web'>>({});
  const [topBarActiveView, setTopBarActiveView] = useState<'all' | 'none' | 'plan' | 'cmd' | 'code' | 'web'>('all');
  const [dismissedQuestionMsg, setDismissedQuestionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (files && files.length > 0) {
      setLocalFileList(files);
    } else {
      WailsService.listFiles()
        .then((res) => {
          if (typeof res === 'string') {
            const parsed = res.split('\n').map((f) => f.trim()).filter(Boolean);
            setLocalFileList(parsed);
          } else if (Array.isArray(res)) {
            setLocalFileList(res);
          }
        })
        .catch(() => {});
    }
  }, [files]);

  const [expandedLiveThinking, setExpandedLiveThinking] = useState(true);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatMessageTime = (id?: string, ts?: string): string => {
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    }
    if (id) {
      const match = id.match(/_(\d+)/);
      if (match) {
        const d = new Date(parseInt(match[1]));
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        }
      }
    }
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const handleCopyText = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleUndo = async (msg: UnifiedMessage) => {
    setInput(msg.text || '');
    if (msg.images && msg.images.length > 0) {
      setAttachedImages(msg.images);
    }
    if (msg.files && msg.files.length > 0) {
      setAttachedFiles(msg.files);
    }
    if (onUndoMessage) {
      await onUndoMessage(msg);
    }
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
    }, 50);
  };

  useEffect(() => {
    const handleRestorePrompt = (e: any) => {
      if (e?.detail?.text) {
        setInput(e.detail.text);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    };
    window.addEventListener('ttgide-restore-prompt', handleRestorePrompt);
    return () => window.removeEventListener('ttgide-restore-prompt', handleRestorePrompt);
  }, []);

  // Tự động co giãn vừa phải (45px -> tối đa 150px) khi dán hoặc gõ văn bản dài
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const targetHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 45), 150);
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [input]);

  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverChat) setIsDraggingOverChat(true);
  };

  const handleChatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOverChat(false);
  };

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChat(false);

    // 1. Tệp kéo từ Sidebar IDE
    const sidebarFile = e.dataTransfer.getData('application/x-ttgide-file');
    if (sidebarFile) {
      const fName = sidebarFile.split(/[/\\]/).pop() || sidebarFile;
      setInput((prev) => (prev ? `${prev} @${fName} ` : `@${fName} `));
      return;
    }

    // 2. Tệp kéo từ Windows Explorer
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      for (const file of droppedFiles) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const b64 = ev.target?.result as string;
            if (b64) setAttachedImages((prev) => [...prev, b64]);
          };
          reader.readAsDataURL(file);
        } else {
          setInput((prev) => (prev ? `${prev} @${file.name} ` : `@${file.name} `));
        }
      }
      return;
    }

    // 3. Khối mã nguồn (Code) hoặc đoạn văn bản kéo thả từ Editor vào khung chat
    const draggedText = e.dataTransfer.getData('text/plain');
    if (draggedText && draggedText.trim()) {
      const clean = draggedText.trim().replace(/^@/, '');
      if (clean.includes('.') && !clean.includes('\n') && clean.length < 120) {
        const fName = clean.split(/[/\\]/).pop() || clean;
        setInput((prev) => (prev ? `${prev} @${fName} ` : `@${fName} `));
      } else if (draggedText.includes('\n') || /[{}();=<>]/.test(draggedText)) {
        const block = `\`\`\`\n${draggedText}\n\`\`\`\n`;
        setInput((prev) => (prev ? `${prev}\n${block}` : block));
      } else {
        setInput((prev) => (prev ? `${prev} ${draggedText}` : draggedText));
      }
    }
  };

  useEffect(() => {
    const handleNativeChatDrop = async (e: any) => {
      const detail = e.detail;
      if (!detail?.path) return;
      const p = detail.path as string;
      const ext = p.split('.').pop()?.toLowerCase() || '';
      const imgExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
      if (imgExts.includes(ext)) {
        setInput((prev) => (prev ? `${prev} [Ảnh: ${p}]` : `[Ảnh: ${p}]`));
      } else {
        const fName = p.split(/[/\\]/).pop() || p;
        setInput((prev) => (prev ? `${prev} @${fName} ` : `@${fName} `));
      }
    };
    window.addEventListener('ttgide-chat-drop', handleNativeChatDrop);
    return () => window.removeEventListener('ttgide-chat-drop', handleNativeChatDrop);
  }, []);

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) {
          setAttachedImages((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      if (file.name) {
        setInput((prev) => (prev ? `${prev} @${file.name} ` : `@${file.name} `));
      }
    }
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            if (base64) {
              setAttachedImages((prev) => [...prev, base64]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const displayMessages: UnifiedMessage[] = messages;

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, loading]);

  // Multi-AI Arena state
  const [arenaSession, setArenaSession] = useState<MultiAISession | null>(null);
  const [arenaLoading, setArenaLoading] = useState(false);
  const [arenaModels, setArenaModels] = useState<string[]>([
    'deepseek-v4.1-flash-free',
    'glm-5.3-flash-free',
  ]);

  const handleToggleHistory = () => {
    setShowHistory((prev) => !prev);
  };

  const handleSelectSession = (sess: { id: string; title: string }) => {
    setShowHistory(false);
    onSelectSession?.(sess);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessId: string) => {
    e.stopPropagation();
    onDeleteSession?.(e, sessId);
  };

  const handleNewChat = () => {
    setShowHistory(false);
    setShowDiffCard(false);
    onNewConversation?.();
  };

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCancelGeneration = () => {
    onCancelChat?.();
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() && attachedImages.length === 0 && attachedFiles.length === 0) return;

    let userText = input.trim();
    if (!userText && attachedImages.length > 0) {
      userText = 'Phân tích và xử lý hình ảnh đính kèm';
    } else if (!userText && attachedFiles.length > 0) {
      userText = 'Phân tích tệp tin đính kèm';
    }
    const currentImgs = [...attachedImages];
    const currentFiles = [...attachedFiles];

    // Trích xuất các tệp @filename được gõ hoặc gắn trong câu prompt
    const fileMentions = userText.match(/@([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/g);
    if (fileMentions) {
      for (const m of fileMentions) {
        const cleanName = m.replace(/^@/, '');
        if (!currentFiles.includes(cleanName)) {
          currentFiles.push(cleanName);
        }
      }
    }

    const lowerText = userText.toLowerCase();
    if (
      lowerText.includes('tắt cmd') ||
      lowerText.includes('đóng cmd') ||
      lowerText.includes('tắt terminal') ||
      lowerText.includes('đóng terminal') ||
      lowerText.includes('dừng cmd') ||
      lowerText.includes('dừng terminal') ||
      lowerText.includes('xóa cmd') ||
      lowerText.includes('clear cmd')
    ) {
      setTopBarActiveView('none');
      try {
        WailsService.killAllBackgroundTasks().catch(() => {});
        window.dispatchEvent(new CustomEvent('ttgide:kill_all_tasks'));
        window.dispatchEvent(new CustomEvent('ttgide:clear_cmds'));
      } catch {}
    }

    setInput('');
    setAttachedImages([]);
    setAttachedFiles([]);

    onSendMessage?.(userText, currentImgs, currentFiles);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/@([a-zA-Z0-9_\-\.\/\\]*)$/);
    if (match) {
      setMentionFilter(match[1]);
      setShowMentionMenu(true);
      setShowSlashMenu(false);
    } else {
      setShowMentionMenu(false);
      const slashMatch = textBefore.match(/\/([a-zA-Z0-9_\-]*)$/);
      if (slashMatch) {
        setSlashFilter(slashMatch[1]);
        setShowSlashMenu(true);
      } else {
        setShowSlashMenu(false);
      }
    }
  };

  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const replaced = textBefore.replace(/\/([a-zA-Z0-9_\-]*)$/, `${cmd.command} `);
    setInput(replaced + textAfter);
    setShowSlashMenu(false);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleSelectMention = (filePath: string) => {
    const fName = filePath.split(/[/\\]/).pop() || filePath;
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const replaced = textBefore.replace(/@([a-zA-Z0-9_\-\.\/\\]*)$/, `@${fName} `);
    setInput(replaced + textAfter);
    if (!attachedFiles.includes(fName)) {
      setAttachedFiles((prev) => [...prev, fName]);
    }
    setShowMentionMenu(false);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const promptMentions = (input.match(/@([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)/g) || []).map((m) =>
    m.replace(/^@/, '')
  );
  const activeFilePills = Array.from(new Set([...attachedFiles, ...promptMentions]));
  const filteredMentionFiles = localFileList
    .filter((f) => !mentionFilter || f.toLowerCase().includes(mentionFilter.toLowerCase()))
    .slice(0, 10);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu) {
      if (e.key === 'Escape') {
        setShowMentionMenu(false);
        return;
      }
      if ((e.key === 'Tab' || e.key === 'Enter') && filteredMentionFiles.length > 0) {
        e.preventDefault();
        handleSelectMention(filteredMentionFiles[0]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Kích hoạt Multi-AI Arena với 2-4 Sandbox độc lập từ backend
  const handleLaunchArena = async () => {
    if (!input.trim() || arenaLoading) return;
    const taskPrompt = input.trim();
    setInput('');
    setArenaLoading(true);

    const allModels = await WailsService.getAIModels();
    const selectedConfigs = allModels.filter((m) => arenaModels.includes(m.id));

    try {
      const session = await WailsService.triggerMultiAIArena(
        `arena_${Date.now()}`,
        taskPrompt,
        'go test ./...',
        selectedConfigs.length > 0 ? selectedConfigs : allModels.slice(0, 2)
      );
      setArenaSession(session);
    } catch (err: any) {
      console.error('Arena execution failed:', err);
    } finally {
      setArenaLoading(false);
    }
  };

  const handleSelectSolution = async (modelId: string) => {
    if (!arenaSession) return;
    try {
      await WailsService.selectMultiAISolution(arenaSession.sessionId, modelId);
      setArenaSession((prev) => (prev ? { ...prev, selectedId: modelId } : null));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      style={{
        width: `${width}px`,
        minWidth: '280px',
        height: '100%',
        background: '#18181b',
        borderLeft: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '12px',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* 1. Header Bar: Tiêu đề + Chuyển đổi Assistant / Multi-AI Arena */}
      <div
        style={{
          height: '35px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #27272a',
          color: '#d4d4d8',
          background: '#18181b',
        }}
      >
        {/* Toggle Assistant vs Multi-AI */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setPanelTab('chat')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: panelTab === 'chat' ? '#27272a' : 'transparent',
              border: panelTab === 'chat' ? '1px solid #3f3f46' : '1px solid transparent',
              color: panelTab === 'chat' ? '#ffffff' : '#71717a',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Bot size={12} color={panelTab === 'chat' ? '#ffffff' : '#71717a'} />
            <span>AI Assistant</span>
          </button>

          <button
            onClick={() => setPanelTab('arena')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: panelTab === 'arena' ? '#27272a' : 'transparent',
              border: panelTab === 'arena' ? '1px solid #3f3f46' : '1px solid transparent',
              color: panelTab === 'arena' ? '#ffffff' : '#71717a',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Đấu trường chạy đua song song 2-4 AI trên Sandbox riêng biệt"
          >
            <Swords size={12} color={panelTab === 'arena' ? '#ffffff' : '#71717a'} />
            <span>Multi-AI Arena</span>
          </button>

          {activeConversationTitle && (
            <span
              style={{
                fontSize: '11px',
                color: '#71717a',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginLeft: '2px',
              }}
              title={activeConversationTitle}
            >
              / {activeConversationTitle}
            </span>
          )}
        </div>

        {/* Action icons: Permission Mode, New Chat, History, Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa' }}>
          {permissionMode && onSelectPermissionMode && (
            <PermissionSelector
              mode={permissionMode}
              onChangeMode={onSelectPermissionMode}
              direction="down"
            />
          )}

          <button
            onClick={handleNewChat}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px', display: 'flex' }}
            title="Cuộc trò chuyện mới (New Chat)"
          >
            <Plus size={15} />
          </button>

          <button
            onClick={handleToggleHistory}
            style={{
              background: showHistory ? 'rgba(255,255,255,0.08)' : 'none',
              border: showHistory ? '1px solid #3f3f46' : '1px solid transparent',
              color: showHistory ? '#ffffff' : 'inherit',
              cursor: 'pointer',
              padding: '2px 5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
            }}
            title="Lịch sử hội thoại (Session History)"
          >
            <History size={13} />
            {sessions.length > 0 && <span style={{ fontSize: '10px', color: '#71717a' }}>{sessions.length}</span>}
          </button>

          <MoreHorizontal size={14} style={{ cursor: 'pointer' }} />
          {onClose && <X size={14} style={{ cursor: 'pointer' }} onClick={onClose} />}
        </div>
      </div>

      {/* 1.1 SESSION HISTORY DRAWER / POPOVER */}
      {showHistory && (
        <div
          style={{
            position: 'absolute',
            top: '36px',
            left: 0,
            right: 0,
            background: '#141416',
            borderBottom: '1px solid #2e2e34',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            padding: '8px',
            maxHeight: '260px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px', fontSize: '11px', color: '#71717a', fontWeight: 600 }}>
            <span>LỊCH SỬ HỘI THOẠI ({sessions.length})</span>
            <button
              onClick={handleNewChat}
              style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid #3f3f46', color: '#ffffff', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px' }}
            >
              <Plus size={12} />
              <span>Tạo mới</span>
            </button>
          </div>

          {sessions.length === 0 ? (
            <div style={{ color: '#71717a', fontSize: '11px', padding: '12px', textAlign: 'center' }}>
              Chưa có phiên hội thoại nào được lưu
            </div>
          ) : (
            sessions.map((sess) => {
              const isCurrent = sess.id === currentSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => handleSelectSession(sess)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: isCurrent ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: isCurrent ? '1px solid #3f3f46' : '1px solid transparent',
                    color: isCurrent ? '#ffffff' : '#d4d4d8',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                  className="hover:bg-white/5"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <Bot size={12} color={isCurrent ? '#ffffff' : '#71717a'} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sess.title || sess.id}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, sess.id)}
                    style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '2px' }}
                    className="hover:text-red-400"
                    title="Xóa phiên này"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 2. CHAT ASSISTANT MODE */}
      {panelTab === 'chat' && (
        <>
          {/* Chat Stream */}
          <div
            className="chat-drop-zone"
            onDragOver={handleChatDragOver}
            onDragLeave={handleChatDragLeave}
            onDrop={handleChatDrop}
            style={{
              flex: 1,
              padding: '14px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'relative',
            }}
          >
            {displayMessages.map((msg, idx) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Antigravity Trajectory Stream matching user screenshots */}
                {msg.sender === 'agent' && (
                  <TrajectoryStream
                    trajectory={msg.trajectory}
                    toolCalls={msg.toolCalls}
                    thinking={msg.thinking}
                    thinkingSeconds={msg.workedTime?.match(/\(([\d\.]+)s\)/)?.[1] || 7}
                    onOpenFile={onOpenFile}
                    onAcceptChange={onAcceptChange}
                    onAcceptAll={() => setModifiedFiles([])}
                    onRejectAll={() => onRollback('')}
                  />
                )}

                {/* Main Message Content */}
                {((msg.text && msg.text.trim()) || (msg.images && msg.images.length > 0) || (msg.files && msg.files.length > 0)) && (
                  <div
                    style={{
                      position: 'relative',
                      background: msg.sender === 'user' ? '#222226' : 'transparent',
                      borderRadius: msg.sender === 'user' ? '8px' : '0',
                      padding: msg.sender === 'user' ? '10px 14px' : '2px 0 6px 0',
                      color: '#f4f4f5',
                      border: msg.sender === 'user' ? '1px solid #2d2d33' : 'none',
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: msg.sender === 'user' ? '88%' : '100%',
                      width: msg.sender === 'user' ? 'auto' : '100%',
                    }}
                    className={msg.sender === 'user' ? 'user-msg-bubble' : ''}
                  >
                    {/* Thumbnail ảnh đính kèm (nếu có) */}
                    {msg.images && msg.images.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: msg.text ? '8px' : '0' }}>
                        {msg.images.map((imgSrc, i) => (
                          <img
                            key={i}
                            src={imgSrc}
                            alt="attached"
                            onClick={() => setPreviewImage(imgSrc)}
                            style={{
                              maxWidth: '180px',
                              maxHeight: '140px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                              border: '1px solid #3f3f46',
                              cursor: 'pointer',
                              transition: 'transform 0.15s ease, border-color 0.15s ease',
                            }}
                            className="hover:scale-[1.02] hover:border-sky-400"
                            title="Nhấn để xem ảnh phóng to"
                          />
                        ))}
                      </div>
                    )}

                    {/* Badge các tệp đính kèm nếu có và chưa xuất hiện trong text */}
                    {(() => {
                      const unmentioned = (msg.files || []).filter((f) => {
                        const name = f.split(/[/\\]/).pop() || f;
                        return !msg.text?.includes(name);
                      });
                      if (unmentioned.length === 0) return null;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: msg.text ? '8px' : '0' }}>
                          {unmentioned.map((filePath, i) => {
                            const fName = filePath.split(/[/\\]/).pop() || filePath;
                            return (
                              <div
                                key={i}
                                onClick={() => onOpenFile?.(filePath)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '12px',
                                  color: '#38bdf8',
                                  cursor: 'pointer',
                                }}
                                title={`Mở tệp: ${filePath}`}
                              >
                                <StandardFileIcon filename={fName} size={14} />
                                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fName}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Rich IDE Markdown & Code Content */}
                    {msg.sender === 'user' ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '6px 10px',
                        }}
                      >
                        {msg.text && (
                          <div style={{ flex: '1 1 auto', minWidth: 'fit-content' }}>
                            <MarkdownMessage
                              content={msg.text}
                              sender={msg.sender}
                              onOpenFile={onOpenFile}
                            />
                          </div>
                        )}

                        {/* Metadata & Actions: Trên cùng 1 hàng thẳng, nút ẩn đi di chuột vào mới hiện */}
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexShrink: 0,
                            userSelect: 'none',
                            marginBottom: '2px',
                            marginLeft: 'auto',
                          }}
                        >
                          <span style={{ fontSize: '10.5px', color: '#71717a', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                            {formatMessageTime(msg.id, msg.timestamp)}
                          </span>

                          <div className="msg-action-btns">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(msg.text, msg.id);
                              }}
                              className={`msg-action-btn ${copiedId === msg.id ? 'copied' : ''}`}
                              title={copiedId === msg.id ? 'Đã sao chép' : 'Sao chép nội dung'}
                            >
                              {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUndo(msg);
                              }}
                              className="msg-action-btn"
                              title="Thu hồi và chỉnh sửa lại tin nhắn này (Undo)"
                            >
                              <Undo2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Agent Message */
                      msg.text && (
                        <div>
                          <MarkdownMessage
                            content={msg.text}
                            sender={msg.sender}
                            onOpenFile={onOpenFile}
                          />

                        </div>
                      )
                    )}
                  </div>
                )}

                {msg.statusNote && (
                  <div style={{ color: '#0284c7', fontSize: '11px', paddingLeft: '4px', fontWeight: 500 }}>
                    {msg.statusNote}
                  </div>
                )}

                {(msg.workedTime || (msg.sender === 'agent' && msg.text)) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#71717a',
                      fontSize: '11px',
                      paddingLeft: '4px',
                    }}
                  >
                    {msg.workedTime && <span>{msg.workedTime}</span>}
                    {msg.sender === 'agent' && msg.text && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleCopyText(msg.text, msg.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '2px',
                            cursor: 'pointer',
                            color: copiedId === msg.id ? '#10b981' : '#71717a',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                          className="hover:text-zinc-200"
                          title={copiedId === msg.id ? 'Đã sao chép' : 'Sao chép phản hồi'}
                        >
                          {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUndo(msg);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '2px 4px',
                            cursor: 'pointer',
                            color: '#71717a',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                          }}
                          className="hover:text-zinc-200"
                          title="Hoàn tác lượt này và khôi phục mã nguồn (Undo / Reject)"
                        >
                          <Undo2 size={12} />
                          <span>Undo</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Antigravity Trajectory Stream (Live) */}
            {loading && (
              <div style={{ maxWidth: '96%', width: '100%', alignSelf: 'flex-start' }}>
                <TrajectoryStream
                  trajectory={liveTrajectory}
                  toolCalls={liveToolCalls}
                  thinking={liveThinking}
                  thinkingSeconds={liveSeconds}
                  isLive={true}
                  hideWorkingIndicator={true}
                  liveStatus={liveStatus}
                  onOpenFile={onOpenFile}
                  onAcceptChange={onAcceptChange}
                />
                {liveAnswer && liveAnswer.trim().length > 0 && (
                  <div
                    style={{
                      position: 'relative',
                      background: 'transparent',
                      padding: '6px 2px',
                      color: '#ffffff',
                      marginTop: '8px',
                      width: '100%',
                    }}
                  >
                    <MarkdownMessage content={liveAnswer} />
                  </div>
                )}
                {/* Working... luôn luôn ở DƯỚI CÙNG của khối đang phản hồi */}
                <div style={{ marginTop: '8px', paddingLeft: '2px' }}>
                  <WorkingIndicator />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Top-of-Input Toolbar (Screenshot 4) & Diff Review Card (Screenshot 3) */}
          <div style={{ padding: '0 12px' }}>
            {(() => {
              const allSessionToolCalls = messages.flatMap((m) => m.toolCalls || []);
              const allCurrentToolCalls = [
                ...allSessionToolCalls,
                ...liveToolCalls,
              ];
              // Tìm plan hợp lệ trong phiên trò chuyện: ưu tiên livePlan, sau đó quét từ tin nhắn mới nhất lùi về trước
              let currentPlan = (livePlan && (livePlan.steps || []).length > 0) ? livePlan : null;
              let msgContent = '';

              const reversedAgentMsgs = [...messages].reverse().filter((m) => m.sender === 'agent');

              if (!currentPlan) {
                for (const msg of reversedAgentMsgs) {
                  if (msg.plan && (msg.plan.steps || []).length > 0) {
                    currentPlan = msg.plan;
                    msgContent = msg.text || '';
                    break;
                  }
                  const extracted = extractPlanFromText(msg.text);
                  if (extracted.steps.length > 0) {
                    currentPlan = {
                      id: `plan_${msg.id}`,
                      goal: 'Kế hoạch nâng cấp hệ thống',
                      steps: extracted.steps,
                      currentStep: 0,
                      createdAt: msg.timestamp || new Date().toISOString(),
                    };
                    msgContent = msg.text || '';
                    break;
                  }
                }
              }

              if (!msgContent && reversedAgentMsgs.length > 0) {
                msgContent = reversedAgentMsgs[0].text || '';
              }

              // Đồng bộ tiến độ các bước (progress tracking) theo nội dung báo cáo tiến độ và công cụ đang chạy
              if (currentPlan && currentPlan.steps && currentPlan.steps.length > 0) {
                const fullText = (reversedAgentMsgs.map((m) => m.text).join('\n') + '\n' + (liveStatus || '')).toLowerCase();
                let activeStepIdx = currentPlan.currentStep || 0;

                for (let i = 0; i < currentPlan.steps.length; i++) {
                  const stepNum = i + 1;
                  if (
                    fullText.includes(`giai đoạn ${stepNum}`) ||
                    fullText.includes(`bước ${stepNum}`) ||
                    fullText.includes(`phase ${stepNum}`) ||
                    fullText.includes(`đợt ${stepNum}`)
                  ) {
                    activeStepIdx = i;
                  }
                }

                currentPlan.currentStep = activeStepIdx;
                currentPlan.steps = currentPlan.steps.map((st, idx) => {
                  if (idx < activeStepIdx) {
                    return { ...st, status: 'success' };
                  } else if (idx === activeStepIdx) {
                    return { ...st, status: loading ? 'executing' : (st.status === 'success' ? 'success' : 'idle') };
                  }
                  return { ...st, status: st.status === 'success' ? 'success' : 'idle' };
                });
              }

              const hasPlanComputed = Boolean(
                (currentPlan && (currentPlan.steps || []).length > 0) ||
                (msgContent && (msgContent.includes('kế hoạch') || msgContent.includes('Đợt') || msgContent.includes('Bước') || msgContent.includes('Phase') || msgContent.includes('Giai đoạn')))
              );
              const hasCmdComputed = allCurrentToolCalls.some((t) => t.name === 'run_command' || Boolean(t.arguments?.command) || Boolean(t.arguments?.CommandLine));
              const hasCodeComputed = modifiedFiles.length > 0 || allCurrentToolCalls.some((t) => ['write_file', 'edit_file', 'modify_file', 'replace_file_content', 'multi_replace_file_content', 'create_file'].includes(t.name));
              const hasWebComputed = allCurrentToolCalls.some((t) => ['browser', 'web_search', 'search_web'].includes(t.name));

              return (
                <MessageActionBar
                  plan={currentPlan}
                  toolCalls={allCurrentToolCalls}
                  messageContent={msgContent}
                  isExecuting={loading}
                  liveStatus={liveStatus}
                  onClearPlan={onClearPlan}
                  hasPlan={hasPlanComputed}
                  hasCmd={hasCmdComputed}
                  hasCode={hasCodeComputed}
                  hasWeb={hasWebComputed}
                  activeView={topBarActiveView}
                  onToggleView={(view) => setTopBarActiveView(view)}
                  modifiedFiles={modifiedFiles}
                  showReviewCard={showDiffCard}
                  onToggleReviewCard={() => setShowDiffCard((prev) => !prev)}
                  onAcceptAll={() => {
                    setModifiedFiles([]);
                    setShowDiffCard(false);
                  }}
                  onRejectAll={async () => {
                    try {
                      await onRollback('');
                      setModifiedFiles([]);
                      setShowDiffCard(false);
                    } catch (e) {
                      console.error('Lỗi khi rollback:', e);
                    }
                  }}
                  onCloseReview={() => setShowDiffCard(false)}
                  permissionMode={permissionMode}
                  onSelectPermissionMode={onSelectPermissionMode}
                  onSelectFile={onOpenFile}
                  onExecutePlan={() => {
                    if (permissionMode === 'plan') {
                      onSelectPermissionMode?.('full');
                    }
                    onSendMessage?.('Bắt đầu thực thi kế hoạch: Làm lần lượt từng bước từ Bước 1 đến hết.');
                  }}
                />
              );
            })()}
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={handleSend}
            onDragOver={handleChatDragOver}
            onDragLeave={handleChatDragLeave}
            onDrop={handleChatDrop}
            className="chat-drop-zone"
            style={{ padding: '0 12px 12px 12px', background: '#18181b' }}
          >
            {/* Hộp thoại câu hỏi từ AI (ask_question hoặc trích xuất từ tin nhắn cuối) */}
            {(() => {
              const lastAgentMsg = displayMessages.length > 0 && displayMessages[displayMessages.length - 1].sender === 'agent'
                ? displayMessages[displayMessages.length - 1]
                : null;
              if (lastAgentMsg && dismissedQuestionMsg === lastAgentMsg.id && !pendingQuestion) {
                return null;
              }
              const extractedOpts = lastAgentMsg && !pendingQuestion ? extractOptionsFromText(lastAgentMsg.text) : [];
              const effectiveQuestion: PendingQuestionData | null = pendingQuestion || (
                extractedOpts.length >= 2 ? {
                  question: extractQuestionPrompt(lastAgentMsg!.text),
                  options: extractedOpts,
                  allowCustom: true,
                  isMultiSelect: true,
                } : null
              );
              if (!effectiveQuestion) return null;
              return (
                <QuestionCard
                  questionData={effectiveQuestion}
                  onSelectOption={(opt) => {
                    onAnswerQuestion?.(opt);
                  }}
                  onFillInput={(text) => {
                    setInput(text);
                    textareaRef.current?.focus();
                  }}
                  onDismiss={() => {
                    if (lastAgentMsg) {
                      setDismissedQuestionMsg(lastAgentMsg.id);
                    }
                    onAnswerQuestion?.('');
                  }}
                />
              );
            })()}

            <div
              onDragOver={handleChatDragOver}
              onDragLeave={handleChatDragLeave}
              onDrop={handleChatDrop}
              style={{
                background: '#1e1e24',
                border: isDraggingOverChat ? '1px solid #38bdf8' : '1px solid #2e2e36',
                borderRadius: '10px',
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                position: 'relative',
                transition: 'border 0.15s ease',
              }}
            >
              {/* Menu gợi ý lệnh tắt Slash Commands & Plugins khi gõ / */}
              {showSlashMenu && (
                <SlashCommandsMenu
                  query={slashFilter}
                  onSelect={handleSelectSlashCommand}
                  onClose={() => setShowSlashMenu(false)}
                />
              )}

              {/* Popover danh sách gợi ý tìm file khi gõ @ */}
              {showMentionMenu && filteredMentionFiles.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: '0',
                    right: '0',
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '10px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7)',
                    zIndex: 100,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    padding: '6px',
                  }}
                >
                  <div
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      color: '#a1a1aa',
                      fontWeight: 600,
                      borderBottom: '1px solid #27272a',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ color: '#38bdf8' }}>Kiếm file vào chat (@)</span>
                    <span style={{ fontSize: '10px', color: '#71717a' }}>Nhấn Tab/Enter để chọn</span>
                  </div>
                  {filteredMentionFiles.map((f) => {
                    const fName = f.split(/[/\\]/).pop() || f;
                    return (
                      <div
                        key={f}
                        onClick={() => handleSelectMention(f)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          color: '#e4e4e7',
                        }}
                        className="hover:bg-sky-500/20 hover:text-sky-300"
                      >
                        <StandardFileIcon filename={fName} size={15} />
                        <span style={{ fontWeight: 600 }}>{fName}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#71717a',
                            marginLeft: 'auto',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '50%',
                          }}
                        >
                          {f}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dải thumbnail ảnh đính kèm trước khi gửi */}
              {attachedImages.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '6px', borderBottom: '1px solid #27272a' }}>
                  {attachedImages.map((b64, idx) => (
                    <div
                      key={idx}
                      className="thumb-card"
                      style={{ width: '52px', height: '52px' }}
                      onClick={() => setPreviewImage(b64)}
                      title="Nhấn để xem ảnh phóng to"
                    >
                      <img
                        src={b64}
                        alt="attachment-preview"
                        className="thumb-img"
                      />

                      {/* Subtle hover overlay with eye preview cue */}
                      <div className="thumb-overlay">
                        <Eye size={15} color="#ffffff" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
                      </div>

                      {/* Modern prominent remove button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: '#ef4444',
                          color: '#ffffff',
                          border: '1.5px solid #ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 20,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.8)',
                          padding: 0,
                        }}
                        className="hover:scale-110 hover:bg-red-600"
                        title="Xóa ảnh này"
                      >
                        <X size={12} strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Dải pill tệp đính kèm / @mention với icon chuẩn */}
              {activeFilePills.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingBottom: '6px', borderBottom: '1px solid #27272a' }}>
                  {activeFilePills.map((filePath) => {
                    const fName = filePath.split(/[/\\]/).pop() || filePath;
                    return (
                      <div
                        key={filePath}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          fontSize: '12px',
                          color: '#38bdf8',
                          fontFamily: "'Cascadia Code', monospace",
                        }}
                      >
                        <StandardFileIcon filename={fName} size={14} />
                        <span style={{ fontWeight: 600 }}>@{fName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachedFiles((prev) => prev.filter((f) => f !== filePath && f !== fName));
                            setInput((prev) => {
                              const escaped = fName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                              return prev.replace(new RegExp(`@${escaped}\\s*`, 'g'), '');
                            });
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#71717a',
                            cursor: 'pointer',
                            padding: '0 2px',
                            fontSize: '13px',
                            lineHeight: 1,
                          }}
                          className="hover:text-red-400"
                          title={`Gỡ @${fName} khỏi chat`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onPaste={handlePaste}
                onDragOver={handleChatDragOver}
                onDrop={handleChatDrop}
                onKeyDown={handleInputKeyDown}
                placeholder={
                  loading
                    ? 'Nhập yêu cầu hoặc câu hỏi... (Nhấn Enter để gửi)'
                    : 'Ask anything, dán ảnh Ctrl+V hoặc chọn ảnh, @ to mention, / for actions'
                }
                style={{
                  width: '100%',
                  minHeight: '45px',
                  maxHeight: '150px',
                  overflowY: (textareaRef.current?.scrollHeight || 0) > 150 ? 'auto' : 'hidden',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f4f4f5',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'none',
                  lineHeight: '1.4',
                }}
              />

              {/* Action Row with Clean Dark ModelSelector (Antigravity Parity) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ModelSelector
                    selectedModelId={selectedModel}
                    onSelectModel={(id) => onSelectModel?.(id)}
                    direction="up"
                    onOpenSettings={onOpenSettings}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Nút đính kèm ảnh (Image upload) */}
                  <input
                    type="file"
                    ref={imageInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                  />
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: attachedImages.length > 0 ? '#38bdf8' : '#71717a',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                    }}
                    title="Đính kèm ảnh cho AI phân tích (hoặc nhấn Ctrl+V để dán trực tiếp)"
                  >
                    <ImageIcon size={15} />
                  </button>

                  {/* Nút đính kèm tệp mã nguồn / tài liệu */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: attachedFiles.length > 0 ? '#38bdf8' : '#71717a',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                    }}
                    title="Đính kèm tệp mã nguồn / tài liệu cho AI (hoặc kéo thả vào đây)"
                  >
                    <Paperclip size={15} />
                  </button>

                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', display: 'flex' }}
                  >
                    <Mic size={14} />
                  </button>

                  {/* NÚT HÀNH ĐỘNG DUY NHẤT (UNIFIED ACTION BUTTON: SEND / STOP) */}
                  {(() => {
                    const hasContent = Boolean(input.trim() || attachedImages.length > 0 || attachedFiles.length > 0);

                    // Khi AI đang chạy và chưa nhập nội dung mới: Hiển thị nút DỪNG (STOP) hiện đại, cao cấp
                    if (loading && !hasContent) {
                      return (
                        <button
                          type="button"
                          onClick={handleCancelGeneration}
                          title="Dừng tạo phản hồi (Stop)"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            color: '#09090b',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.5)';
                            e.currentTarget.style.transform = 'scale(1.06)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.color = '#09090b';
                            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.25)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                            <rect width="10" height="10" rx="2" />
                          </svg>
                        </button>
                      );
                    }

                    // Bình thường hoặc khi đang chạy mà có gõ nội dung chỉ dẫn: Hiển thị nút GỬI (SEND)
                    return (
                      <button
                        type="submit"
                        disabled={!hasContent}
                        title={loading ? 'Gửi chỉ dẫn bổ sung vào phiên đang chạy (Enter)' : (hasContent ? 'Gửi tin nhắn (Enter)' : 'Nhập tin nhắn để gửi')}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: hasContent ? '#ffffff' : '#27272a',
                          color: hasContent ? '#09090b' : '#52525b',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: hasContent ? 'pointer' : 'default',
                          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                          boxShadow: hasContent ? '0 1px 4px rgba(0, 0, 0, 0.25)' : 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (hasContent) {
                            e.currentTarget.style.transform = 'scale(1.06)';
                            e.currentTarget.style.opacity = '0.92';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (hasContent) {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.opacity = '1';
                          }
                        }}
                      >
                        <ArrowUp size={14} strokeWidth={2.4} />
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </form>
        </>
      )}

      {/* 3. MULTI-AI ARENA MODE (Thi đấu 2-4 AI trong Sandbox cô lập) */}
      {panelTab === 'arena' && (
        <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a855f7', fontWeight: 700, fontSize: '13px' }}>
              <Swords size={16} />
              ĐẤU TRƯỜNG SO SÁNH ĐA AI (ARENA)
            </div>
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px', lineHeight: '1.4' }}>
              Chạy đồng thời 2-4 mô hình AI trên các Sandbox cô lập riêng biệt trong backend, so sánh kết quả và chọn lời giải tốt nhất.
            </p>
          </div>

          {/* Model selection checkboxes for Arena */}
          <div style={{ background: '#141416', border: '1px solid #27272a', borderRadius: '6px', padding: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 600, marginBottom: '6px' }}>
              CÁC MODEL THAM GIA THI ĐẤU:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              {['deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'gemini-2.5-flash-free'].map((mid) => (
                <label key={mid} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#d4d4d8' }}>
                  <input
                    type="checkbox"
                    checked={arenaModels.includes(mid)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setArenaModels((prev) => [...prev, mid]);
                      } else {
                        setArenaModels((prev) => prev.filter((m) => m !== mid));
                      }
                    }}
                  />
                  <span>{mid}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Prompt input for Arena */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập bài toán cần các AI thi đấu giải quyết..."
            style={{
              width: '100%',
              height: '70px',
              background: '#141416',
              border: '1px solid #2e2e34',
              borderRadius: '6px',
              padding: '8px',
              color: '#ffffff',
              fontSize: '12px',
              outline: 'none',
              resize: 'none',
              marginBottom: '8px',
            }}
          />

          <button
            onClick={handleLaunchArena}
            disabled={arenaLoading || !input.trim() || arenaModels.length === 0}
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: arenaLoading || !input.trim() ? 'not-allowed' : 'pointer',
              marginBottom: '14px',
            }}
          >
            {arenaLoading ? 'Đang chạy song song trên các Sandbox...' : `Khởi chạy Đấu trường (${arenaModels.length} AI)`}
          </button>

          {/* Arena results list */}
          {arenaSession && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {arenaSession.results.map((res) => {
                const isSelected = arenaSession.selectedId === res.modelId;
                return (
                  <div
                    key={res.modelId}
                    style={{
                      background: '#1e1e24',
                      border: isSelected ? '1px solid #22c55e' : '1px solid #2e2e34',
                      borderRadius: '8px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '12px' }}>{res.modelName}</span>
                      <span style={{ fontSize: '10px', color: '#71717a' }}>{res.durationMs}ms</span>
                    </div>

                    <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.4', marginBottom: '8px' }}>
                      {res.answer}
                    </div>

                    <button
                      onClick={() => handleSelectSolution(res.modelId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: isSelected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: isSelected ? '1px solid #22c55e' : '1px solid #3f3f46',
                        color: isSelected ? '#22c55e' : '#ffffff',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isSelected ? <Check size={12} /> : null}
                      {isSelected ? 'ĐÃ ÁP DỤNG VÀO PROJECT CHÍNH' : 'ÁP DỤNG LỜI GIẢI NÀY VÀO PROJECT'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal xem ảnh toàn màn hình */}
      <ImageViewerModal
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};
