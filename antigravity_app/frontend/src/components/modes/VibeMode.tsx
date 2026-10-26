import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  History,
  Clock,
  Folder,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Mic,
  ArrowRight,
  Square,
  Sparkles,
  SlidersHorizontal,
  FolderOpen,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Brain,
  Trash2,
  Bot,
  Wrench,
  Terminal,
  FileCode,
  Copy,
  Check,
  Undo2,
  Image as ImageIcon,
  ArrowUp,
  Paperclip,
  Eye,
  X,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import { Plan, ToolCall, UnifiedMessage, TrajectoryItem } from '../../types';
import { ModelSelector } from '../agent/ModelSelector';
import { PermissionSelector, PermissionMode } from '../common/PermissionSelector';
import { WailsService } from '../../services/wailsBridge';
import { ToolCallCard } from '../agent/ToolCallCard';
import { PlanCard } from '../agent/PlanCard';
import { TrajectoryStream, WorkingIndicator, getFileIcon } from '../agent/TrajectoryStream';
import { StandardFileIcon } from '../common/StandardFileIcon';
import { MessageActionBar, MessageViewMode, extractPlanFromText } from '../agent/MessageActionBar';
import { MarkdownMessage } from '../agent/MarkdownMessage';
import { ImageViewerModal } from '../common/ImageViewerModal';
import { SlashCommandsMenu, SlashCommandItem } from '../common/SlashCommandsMenu';
import { QuestionCard, PendingQuestionData, extractOptionsFromText, extractQuestionPrompt } from '../agent/QuestionCard';

interface VibeModeProps {
  onTriggerAgent?: (prompt: string, verifyCmd?: string, sessionId?: string) => Promise<Plan>;
  onRollback: () => void;
  onAnswerQuestion?: (answer: string) => void;
  pendingQuestion?: PendingQuestionData | null;
  workspace?: string;
  activeFile?: string;
  files?: string[];
  onSelectFile?: (file: string) => void;
  onOpenFile?: (file: string, lineOrRange?: any) => void;
  onAcceptChange?: (file?: string) => void;
  onOpenFolder?: () => void;
  onOpenSettings?: () => void;

  permissionMode?: PermissionMode;
  onSelectPermissionMode?: (mode: PermissionMode) => void;

  // Shared Chat State & Handlers
  currentSessionId?: string;
  runningSessionId?: string | null;
  activeConversationTitle?: string;
  conversationMessages?: UnifiedMessage[];
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
  modifiedFiles?: string[];
  showDiffCard?: boolean;
  onCloseDiffCard?: () => void;
  onClearPlan?: () => void;
}

export const VibeMode: React.FC<VibeModeProps> = ({
  onTriggerAgent,
  onRollback,
  onAnswerQuestion,
  onClearPlan,
  pendingQuestion = null,
  workspace,
  activeFile = '',
  files = [],
  onSelectFile,
  onOpenFile,
  onAcceptChange,
  onOpenFolder,
  onOpenSettings,
  currentSessionId = '',
  runningSessionId = null,
  activeConversationTitle = 'Cuộc hội thoại hiện tại',
  conversationMessages = [],
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
  modifiedFiles = [],
  showDiffCard = false,
  onCloseDiffCard,
  permissionMode = 'full',
  onSelectPermissionMode,
}) => {
  const [prompt, setPrompt] = useState('');
  const currentProjectName = workspace
    ? workspace.split(/[/\\]/).pop() || 'Anchuyennganh'
    : 'Anchuyennganh';

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('ttgide_sidebar_collapsed') === 'true';
  });
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'files'>('chats');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [localFileList, setLocalFileList] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [messageActiveViews, setMessageActiveViews] = useState<Record<string, 'all' | 'none' | 'plan' | 'cmd' | 'code' | 'web'>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  const [showVibeToolbar, setShowVibeToolbar] = useState<boolean>(() => {
    return localStorage.getItem('ttgide_show_vibe_toolbar') !== 'false';
  });

  useEffect(() => {
    const handleSyncToolbar = () => {
      setShowVibeToolbar(localStorage.getItem('ttgide_show_vibe_toolbar') !== 'false');
    };
    window.addEventListener('storage', handleSyncToolbar);
    window.addEventListener('ttgide_toggle_toolbar', handleSyncToolbar);
    return () => {
      window.removeEventListener('storage', handleSyncToolbar);
      window.removeEventListener('ttgide_toggle_toolbar', handleSyncToolbar);
    };
  }, []);

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
  const [reviewCardOpen, setReviewCardOpen] = useState(false);
  const [topBarActiveView, setTopBarActiveView] = useState<MessageViewMode>('all');
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const [dismissedQuestionMsg, setDismissedQuestionMsg] = useState<string | null>(null);

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
    setPrompt(msg.text || '');
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
        setPrompt(e.detail.text);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    };
    window.addEventListener('ttgide-restore-prompt', handleRestorePrompt);
    return () => window.removeEventListener('ttgide-restore-prompt', handleRestorePrompt);
  }, []);

  // Tự động co giãn vừa phải (52px -> tối đa 160px) khi dán hoặc gõ văn bản dài
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const targetHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 52), 160);
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [prompt]);

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

    // 1. Tệp kéo từ Sidebar IDE hoặc thanh Explorer
    const sidebarFile = e.dataTransfer.getData('application/x-ttgide-file');
    if (sidebarFile) {
      const fName = sidebarFile.split(/[/\\]/).pop() || sidebarFile;
      setPrompt((prev) => (prev ? `${prev} @${fName} ` : `@${fName} `));
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
          setPrompt((prev) => (prev ? `${prev} @${file.name} ` : `@${file.name} `));
        }
      }
      return;
    }

    // 3. Khối mã nguồn hoặc đường dẫn kéo từ editor
    const draggedText = e.dataTransfer.getData('text/plain');
    if (draggedText && draggedText.trim()) {
      const clean = draggedText.trim().replace(/^@/, '');
      if (clean.includes('.') && !clean.includes('\n') && clean.length < 120) {
        const fName = clean.split(/[/\\]/).pop() || clean;
        setPrompt((prev) => (prev ? `${prev} @${fName} ` : `@${fName} `));
      } else {
        setPrompt((prev) => (prev ? `${prev} ${draggedText}` : draggedText));
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
        setPrompt((prev) => (prev ? `${prev} [Ảnh: ${p}]` : `[Ảnh: ${p}]`));
      } else {
        const fName = p.split(/[/\\]/).pop() || p;
        setPrompt((prev) => (prev ? `${prev} @${fName} ` : `@${fName} `));
      }
    };
    window.addEventListener('ttgide-chat-drop', handleNativeChatDrop);
    return () => window.removeEventListener('ttgide-chat-drop', handleNativeChatDrop);
  }, []);

  useEffect(() => {
    if (showDiffCard) setReviewCardOpen(true);
  }, [showDiffCard]);

  useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
      chatScrollContainerRef.current.scrollLeft = 0;
    }
  }, [conversationMessages, loading]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAttachedImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      if (file.name) {
        setPrompt((prev) => (prev ? `${prev} @${file.name} ` : `@${file.name} `));
      }
    }
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setAttachedImages((prev) => [...prev, reader.result as string]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // Mouse drag handler cho thanh kéo thả sidebar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newW = Math.max(180, Math.min(500, e.clientX));
        setSidebarWidth(newW);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const handleSelectSession = (sess: { id: string; title: string }) => {
    setShowHistoryModal(false);
    onSelectSession?.(sess);
  };

  const handleNewConversation = () => {
    setShowHistoryModal(false);
    setPrompt('');
    onNewConversation?.();
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteSession?.(e, id);
  };

  const handleCancel = () => {
    onCancelChat?.();
  };

  const handleStart = (p?: string) => {
    if (!prompt.trim() && attachedImages.length === 0 && attachedFiles.length === 0 && !p) return;

    let text = (p || prompt).trim();
    if (!text && attachedImages.length > 0) {
      text = 'Phân tích và xử lý hình ảnh đính kèm';
    } else if (!text && attachedFiles.length > 0) {
      text = 'Phân tích tệp tin đính kèm';
    }

    const currentImages = [...attachedImages];
    const currentFiles = [...attachedFiles];

    // Trích xuất các tệp @filename được gõ hoặc gắn trong câu prompt
    const fileMentions = text.match(/@([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/g);
    if (fileMentions) {
      for (const m of fileMentions) {
        const cleanName = m.replace(/^@/, '');
        if (!currentFiles.includes(cleanName)) {
          currentFiles.push(cleanName);
        }
      }
    }

    const lowerText = text.toLowerCase();
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

    setAttachedImages([]);
    setAttachedFiles([]);
    setPrompt('');

    onSendMessage?.(text, currentImages, currentFiles);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);

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
    const cursorPos = textareaRef.current?.selectionStart || prompt.length;
    const textBefore = prompt.slice(0, cursorPos);
    const textAfter = prompt.slice(cursorPos);
    const replaced = textBefore.replace(/\/([a-zA-Z0-9_\-]*)$/, `${cmd.command} `);
    setPrompt(replaced + textAfter);
    setShowSlashMenu(false);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleSelectMention = (filePath: string) => {
    const fName = filePath.split(/[/\\]/).pop() || filePath;
    const cursorPos = textareaRef.current?.selectionStart || prompt.length;
    const textBefore = prompt.slice(0, cursorPos);
    const textAfter = prompt.slice(cursorPos);
    const replaced = textBefore.replace(/@([a-zA-Z0-9_\-\.\/\\]*)$/, `@${fName} `);
    setPrompt(replaced + textAfter);
    if (!attachedFiles.includes(fName)) {
      setAttachedFiles((prev) => [...prev, fName]);
    }
    setShowMentionMenu(false);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const promptMentions = (prompt.match(/@([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)/g) || []).map((m) =>
    m.replace(/^@/, '')
  );
  const activeFilePills = Array.from(new Set([...attachedFiles, ...promptMentions]));
  const filteredMentionFiles = localFileList
    .filter((f) => !mentionFilter || f.toLowerCase().includes(mentionFilter.toLowerCase()))
    .slice(0, 10);

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      handleStart();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 57px)',
        width: '100vw',
        background: '#121214',
        color: '#f4f4f5',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 1. LEFT SIDEBAR (Dynamic Width) */}
      {!sidebarCollapsed && (
        <>
          <div
            style={{
            width: `${sidebarWidth}px`,
            minWidth: '180px',
            height: '100%',
            background: '#141416',
            borderRight: '1px solid #222226',
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 10px',
            fontSize: '13px',
            flexShrink: 0,
          }}
        >
          {/* + New Conversation Button & Close Sidebar Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
            <button
              onClick={handleNewConversation}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: '#1f1f23',
                border: '1px solid #2e2e34',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#f4f4f5',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              className="hover:bg-zinc-800"
            >
              <Plus size={15} />
              <span>New Conversation</span>
            </button>

            <button
              onClick={() => {
                setSidebarCollapsed(true);
                localStorage.setItem('ttgide_sidebar_collapsed', 'true');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                background: '#1f1f23',
                border: '1px solid #2e2e34',
                borderRadius: '8px',
                color: '#a1a1aa',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              className="hover:bg-zinc-800 hover:text-white"
              title="Đóng thanh bên cho gọn"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Navigation list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
          <div
            onClick={() => {
              setShowHistoryModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 10px',
              borderRadius: '6px',
              color: '#a1a1aa',
              cursor: 'pointer',
            }}
            className="hover:bg-white/5 hover:text-white"
          >
            <History size={15} />
            <span>Conversation History ({sessions.length})</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 10px',
              borderRadius: '6px',
              color: '#a1a1aa',
              cursor: 'pointer',
            }}
            className="hover:bg-white/5 hover:text-white"
          >
            <Clock size={15} />
            <span>Scheduled Tasks</span>
          </div>
        </div>

        {/* Projects section */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            color: '#71717a',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '6px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <span
              onClick={() => setSidebarTab('chats')}
              style={{
                cursor: 'pointer',
                color: sidebarTab === 'chats' ? '#ffffff' : '#71717a',
                borderBottom: sidebarTab === 'chats' ? '2px solid #ffffff' : 'none',
                paddingBottom: '2px',
              }}
            >
              Hội thoại ({sessions.length})
            </span>
            <span
              onClick={() => setSidebarTab('files')}
              style={{
                cursor: 'pointer',
                color: sidebarTab === 'files' ? '#ffffff' : '#71717a',
                borderBottom: sidebarTab === 'files' ? '2px solid #ffffff' : 'none',
                paddingBottom: '2px',
              }}
            >
              Tệp ({files.length})
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span
              style={{ cursor: 'pointer', display: 'flex' }}
              title="Mở thư mục dự án khác..."
              onClick={onOpenFolder}
            >
              <FolderOpen size={13} />
            </span>
          </div>
        </div>

        {/* Active Project & Content List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              color: '#a1a1aa',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Folder size={13} color="#a1a1aa" />
            <span>{currentProjectName}</span>
          </div>

          {sidebarTab === 'chats' ? (
            <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {sessions.map((s) => {
                const isActive = s.id === currentSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: isActive ? '#ffffff' : '#71717a',
                      background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                    }}
                    className="hover:bg-white/5 group"
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.id === runningSessionId && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            boxShadow: '0 0 6px #22c55e',
                            flexShrink: 0,
                          }}
                          title="Phiên đang chạy ngầm"
                        />
                      )}
                      <span>{s.title || s.id}</span>
                    </span>
                    <span
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      title="Xóa cuộc trò chuyện này"
                    >
                      <Trash2 size={11} />
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {files.map((f) => {
                const isSelected = f === activeFile || f.replace(/^[/\\]+/, '') === activeFile.replace(/^[/\\]+/, '');
                const fileName = f.split(/[/\\]/).pop() || f;
                return (
                  <div
                    key={f}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-ttgide-file', f);
                      e.dataTransfer.setData('text/plain', f);
                    }}
                    onClick={() => onSelectFile?.(f)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: isSelected ? '#ffffff' : '#a1a1aa',
                      background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                    className="hover:bg-white/5"
                    title={`Chọn tệp để AI tập trung phân tích: ${f}`}
                  >
                    <StandardFileIcon filename={fileName} size={14} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fileName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Settings Link */}
        <div
          onClick={onOpenSettings}
          style={{
            borderTop: '1px solid #222226',
            paddingTop: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#a1a1aa',
            cursor: 'pointer',
          }}
          className="hover:text-white"
        >
          <Settings size={15} />
          <span>Cài đặt hệ thống (Ctrl+,)</span>
        </div>
      </div>

        {/* DRAGGABLE RESIZER: Sidebar - Canvas */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          style={{
            width: '5px',
            cursor: 'col-resize',
            background: isDragging ? '#52525b' : 'transparent',
            zIndex: 50,
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
          className="hover:bg-zinc-700"
          title="Kéo sang trái/phải để thay đổi kích thước Sidebar"
        />
      </>
      )}

      {/* 2. CENTER CANVAS */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top Active Folder & Conversation Header */}
        <div
          style={{
            width: '100%',
            maxWidth: '820px',
            padding: '12px 20px 4px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: '#a1a1aa',
              cursor: 'pointer',
            }}
          >
            {sidebarCollapsed && (
              <button
                onClick={() => {
                  setSidebarCollapsed(false);
                  localStorage.setItem('ttgide_sidebar_collapsed', 'false');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 6px',
                  marginRight: '6px',
                  background: '#1f1f23',
                  border: '1px solid #2e2e34',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                }}
                className="hover:text-white hover:bg-zinc-800"
                title="Mở thanh bên (Sidebar)"
              >
                <PanelLeft size={14} />
              </button>
            )}
            <Folder size={14} color="#71717a" />
            <span>{currentProjectName}</span>
            <ChevronRight size={14} />
            <span style={{ color: '#f4f4f5', fontWeight: 500 }}>{activeConversationTitle}</span>
            {activeFile && (
              <>
                <ChevronRight size={14} />
                <span
                  style={{
                    color: '#e4e4e7',
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#1f1f23',
                    border: '1px solid #2e2e34',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  title={`Tệp đang chọn đồng bộ: ${activeFile}`}
                >
                  <FileCode size={12} color="#a1a1aa" />
                  <span>{activeFile.split(/[/\\]/).pop()}</span>
                </span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {permissionMode && onSelectPermissionMode && (
              <PermissionSelector
                mode={permissionMode}
                onChangeMode={onSelectPermissionMode}
                direction="down"
              />
            )}
          </div>
        </div>

        {/* Middle Scrollable Conversation Stream (Top to Bottom, Normal Order) */}
        <div
          ref={chatScrollContainerRef}
          className="chat-drop-zone"
          onDragOver={handleChatDragOver}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '820px',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative',
          }}
        >
          {conversationMessages.length === 0 && !loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#71717a',
                textAlign: 'center',
                paddingTop: '80px',
              }}
            >
              <Bot size={40} color="#71717a" style={{ marginBottom: '14px', opacity: 0.6 }} />
              <h2 style={{ fontSize: '18px', color: '#f4f4f5', fontWeight: 600, margin: '0 0 6px 0' }}>
                Taitestgame Vibe Workspace
              </h2>
              <p style={{ fontSize: '13px', color: '#a1a1aa', maxWidth: '440px', lineHeight: '1.5', margin: 0 }}>
                Nhập câu hỏi, yêu cầu viết code hoặc dán ảnh vào ô bên dưới để bắt đầu làm việc cùng AI Agent.
              </p>
            </div>
          ) : (
            conversationMessages.map((msg, idx) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Antigravity Trajectory Stream matching user screenshots */}
                {msg.sender === 'agent' && (
                  <TrajectoryStream
                    trajectory={msg.trajectory}
                    toolCalls={msg.toolCalls}
                    thinking={msg.thinking}
                    thinkingSeconds={msg.workedTime?.match(/\(([\d\.]+)s\)/)?.[1] || 7}
                    onOpenFile={onOpenFile || onSelectFile}
                    onAcceptAll={() => {
                      onAcceptChange?.();
                      onCloseDiffCard?.();
                    }}
                    onRejectAll={onRollback}
                  />
                )}

                {/* Main Message Content */}
                {((msg.text && msg.text.trim()) || (msg.images && msg.images.length > 0) || (msg.files && msg.files.length > 0)) && (
                  <div
                    style={{
                      position: 'relative',
                      background: msg.sender === 'user' ? '#222226' : 'transparent',
                      borderRadius: msg.sender === 'user' ? '8px' : '0',
                      padding: msg.sender === 'user' ? '8px 12px' : '4px 2px',
                      color: '#ffffff',
                      border: msg.sender === 'user' ? '1px solid #2d2d33' : 'none',
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: msg.sender === 'user' ? '88%' : '100%',
                      width: msg.sender === 'user' ? 'auto' : '100%',
                    }}
                    className={msg.sender === 'user' ? 'user-msg-bubble' : ''}
                  >
                    {/* Thumbnail ảnh đính kèm nếu có */}
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
                            className="hover:scale-[1.02] hover:border-zinc-500"
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
                                onClick={() => onSelectFile?.(filePath)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: '#27272a',
                                  border: '1px solid #3f3f46',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '12px',
                                  color: '#f4f4f5',
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
                              onOpenFile={onOpenFile || onSelectFile}
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
                            onOpenFile={onOpenFile || onSelectFile}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}>
                    {msg.workedTime && (
                      <span style={{ fontSize: '11px', color: '#71717a' }}>
                        {msg.workedTime}
                      </span>
                    )}
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
            ))
          )}

          {/* Antigravity Live Trajectory Stream */}
          {loading && (
            <div style={{ maxWidth: '92%', width: '100%', alignSelf: 'flex-start' }}>
              <TrajectoryStream
                trajectory={liveTrajectory}
                toolCalls={liveToolCalls}
                thinking={liveThinking}
                thinkingSeconds={liveSeconds}
                isLive={true}
                hideWorkingIndicator={true}
                liveStatus={liveStatus}
                onOpenFile={onOpenFile || onSelectFile}
                onAcceptAll={() => {
                  onAcceptChange?.();
                  onCloseDiffCard?.();
                }}
                onRejectAll={onRollback}
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
              {/* Working... luôn luôn nằm ở DƯỚI CÙNG của khối đang phản hồi */}
              <div style={{ marginTop: '8px', paddingLeft: '2px' }}>
                <WorkingIndicator />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Pinned Area: Top-of-Input Toolbar (Screenshot 4), Diff Review Card (Screenshot 3) & Prompt Box */}
        <div
          style={{
            width: '100%',
            maxWidth: '820px',
            padding: '2px 20px 16px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Tracking Toolbar (Screenshot 2 / Image 2 parity: Plan, CMD, Code, Browser) */}
          {(() => {
            const allSessionToolCalls = conversationMessages.flatMap((m) => m.toolCalls || []);
            const allCurrentToolCalls = [
              ...allSessionToolCalls,
              ...liveToolCalls,
            ];

            // Tìm plan hợp lệ trong toàn bộ phiên hội thoại: ưu tiên livePlan, sau đó quét từ tin nhắn gần nhất lùi về trước
            let currentPlan: Plan | null = (livePlan && (livePlan.steps || []).length > 0)
              ? { ...livePlan, steps: [...livePlan.steps] }
              : null;
            let msgContent = '';

            const reversedAgentMsgs = [...conversationMessages].reverse().filter((m) => m.sender === 'agent');

            if (!currentPlan) {
              for (const msg of reversedAgentMsgs) {
                if (msg.plan && (msg.plan.steps || []).length > 0) {
                  currentPlan = { ...msg.plan, steps: [...msg.plan.steps] };
                  msgContent = msg.text || '';
                  break;
                }
                const extracted = extractPlanFromText(msg.text);
                if (extracted.steps.length > 0) {
                  currentPlan = {
                    id: `plan_${msg.id}`,
                    goal: 'Kế hoạch triển khai dự án',
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
            const hasCmdComputed = allCurrentToolCalls.some(
              (t) => t.name === 'run_command' || Boolean(t.arguments?.command) || Boolean(t.arguments?.CommandLine) || t.name?.includes('command') || t.name?.includes('terminal')
            );
            const detectedModifiedFiles = Array.from(
              new Set(
                allCurrentToolCalls
                  .filter((t) => ['write_file', 'edit_file', 'modify_file', 'create_file', 'replace_file_content', 'multi_replace_file_content'].includes(t.name))
                  .map((t) => t.arguments?.path || t.arguments?.targetFile || t.arguments?.TargetFile || t.arguments?.filePath || '')
                  .filter(Boolean)
              )
            );
            const hasCodeComputed = detectedModifiedFiles.length > 0;
            const hasWebComputed = allCurrentToolCalls.some((t) => ['browser', 'web_search', 'search_web', 'fetch_web_request'].includes(t.name));

            return (
              <div style={{ marginBottom: '2px' }}>
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
                  modifiedFiles={detectedModifiedFiles}
                  showReviewCard={reviewCardOpen || showDiffCard}
                  onToggleReviewCard={() => setReviewCardOpen((prev) => !prev)}
                  onAcceptAll={() => onCloseDiffCard?.()}
                  onRejectAll={() => onRollback?.()}
                  onCloseReview={() => {
                    setReviewCardOpen(false);
                    onCloseDiffCard?.();
                  }}
                  permissionMode={permissionMode}
                  onSelectPermissionMode={onSelectPermissionMode}
                  onSelectFile={onSelectFile}
                  onExecutePlan={() => {
                    if (permissionMode === 'plan') {
                      onSelectPermissionMode?.('full');
                    }
                    onSendMessage?.('Bắt đầu thực thi kế hoạch: Làm lần lượt từng bước từ Bước 1 đến hết.');
                  }}
                />
              </div>
            );
          })()}

          {/* Hộp thoại câu hỏi từ AI (ask_question hoặc trích xuất từ tin nhắn cuối) */}
          {(() => {
            const lastAgentMsg = conversationMessages.length > 0 && conversationMessages[conversationMessages.length - 1].sender === 'agent'
              ? conversationMessages[conversationMessages.length - 1]
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
                  setPrompt(text);
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

          {/* Floating Prompt Box with drop zone */}
          <div
            className="chat-drop-zone"
            onDragOver={handleChatDragOver}
            onDragLeave={handleChatDragLeave}
            onDrop={handleChatDrop}
            style={{
              width: '100%',
              background: '#1c1c1f',
              border: isDraggingOverChat ? '1px solid #52525b' : '1px solid #27272a',
              borderRadius: '12px',
              padding: '12px 14px',
              boxShadow: isDraggingOverChat ? '0 4px 20px rgba(0, 0, 0, 0.5)' : '0 4px 16px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              position: 'relative',
              transition: 'border 0.15s ease, box-shadow 0.15s ease',
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
                  maxHeight: '230px',
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
                  <span style={{ color: '#e4e4e7' }}>Kiếm file vào chat (@)</span>
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
                        fontSize: '13px',
                        color: '#f4f4f5',
                      }}
                      className="hover:bg-zinc-800 hover:text-white"
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid #27272a' }}>
                {attachedImages.map((b64, idx) => (
                  <div
                    key={idx}
                    className="thumb-card"
                    style={{ width: '56px', height: '56px' }}
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
                      <Eye size={16} color="#ffffff" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
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
                        background: '#27272a',
                        border: '1px solid #3f3f46',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '12px',
                        color: '#f4f4f5',
                        fontFamily: "'Cascadia Code', monospace",
                      }}
                    >
                      <StandardFileIcon filename={fName} size={14} />
                      <span style={{ fontWeight: 600 }}>@{fName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedFiles((prev) => prev.filter((f) => f !== filePath && f !== fName));
                          setPrompt((prev) => {
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
              value={prompt}
              onChange={handlePromptChange}
              onPaste={handlePaste}
              onDragOver={handleChatDragOver}
              onDrop={handleChatDrop}
              onKeyDown={handlePromptKeyDown}
              placeholder={
                loading
                  ? 'Nhập yêu cầu hoặc câu hỏi... (Nhấn Enter để gửi)'
                  : 'Ask anything, dán ảnh Ctrl+V hoặc chọn ảnh, @ to mention, / for actions'
              }
              style={{
                width: '100%',
                minHeight: '52px',
                maxHeight: '160px',
                overflowY: (textareaRef.current?.scrollHeight || 0) > 160 ? 'auto' : 'hidden',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#f4f4f5',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                lineHeight: '1.5',
              }}
            />

            {/* Bottom action row inside the card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '6px',
              }}
            >
              {/* Left selector: Model picker (Clean layout matching Antigravity) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ModelSelector
                  selectedModelId={selectedModel}
                  onSelectModel={(id) => onSelectModel?.(id)}
                  direction="up"
                  onOpenSettings={onOpenSettings}
                />
              </div>

              {/* Right tools: Image upload, Voice mic, Send arrow / RED STOP BUTTON / CHÈN */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Nút đính kèm ảnh */}
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
                    color: attachedImages.length > 0 ? '#ffffff' : '#71717a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                  title="Đính kèm ảnh cho AI phân tích (hoặc nhấn Ctrl+V để dán trực tiếp)"
                >
                  <ImageIcon size={16} />
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
                    color: attachedFiles.length > 0 ? '#ffffff' : '#71717a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                  title="Đính kèm tệp mã nguồn / tài liệu cho AI (hoặc kéo thả vào đây)"
                >
                  <Paperclip size={16} />
                </button>

                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#71717a',
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                >
                  <Mic size={15} />
                </button>

                {/* NÚT HÀNH ĐỘNG DUY NHẤT (UNIFIED ACTION BUTTON: SEND / STOP) */}
                {(() => {
                  const hasContent = Boolean(prompt.trim() || attachedImages.length > 0);

                  // Khi AI đang chạy và chưa nhập nội dung mới: Hiển thị nút DỪNG (STOP) hiện đại, cao cấp
                  if (loading && !hasContent) {
                    return (
                      <button
                        type="button"
                        onClick={handleCancel}
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
                      type="button"
                      onClick={() => handleStart()}
                      disabled={!hasContent}
                      title={loading ? 'Gửi chỉ dẫn bổ sung vào phiên đang chạy (Enter)' : (hasContent ? 'Gửi yêu cầu (Enter)' : 'Nhập yêu cầu để gửi')}
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
                      <ArrowRight size={14} strokeWidth={2.4} />
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal xem ảnh toàn màn hình */}
      <ImageViewerModal
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};
