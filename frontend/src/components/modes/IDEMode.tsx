import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronRight,
  Split,
  MoreHorizontal,
  FileText,
  Terminal,
  ChevronDown,
  Save,
} from 'lucide-react';
import { IDEEnhancedSidebar, ActivityTab } from '../filetree/IDEEnhancedSidebar';
import { MonacoWrapper } from '../editor/MonacoWrapper';
import { AgentChatPanel } from '../agent/AgentChatPanel';
import { VSCodeTerminal } from '../terminal/VSCodeTerminal';
import { Plan, Checkpoint, ToolDefinition, Skill, ToolCall, UnifiedMessage, TrajectoryItem } from '../../types';
import { WailsService } from '../../services/wailsBridge';
import { PermissionMode } from '../common/PermissionSelector';
import { PendingQuestionData } from '../agent/QuestionCard';

interface IDEModeProps {
  workspace?: string;
  files: string[];
  activeFile: string;
  fileContent: string;
  checkpoints: Checkpoint[];
  tools: ToolDefinition[];
  skills: Skill[];
  onSelectFile: (file: string) => void;
  onContentChange: (newContent: string) => void;
  onSaveFile?: (file: string, content: string) => void;
  onRefreshFiles: (preserveFile?: string) => void;
  onTriggerAgent: (prompt: string, verifyCmd?: string, sessionId?: string) => Promise<Plan>;
  onRollback: (id: string) => void;
  onOpenSettings?: () => void;

  permissionMode?: PermissionMode;
  onSelectPermissionMode?: (mode: PermissionMode) => void;
  pendingQuestion?: PendingQuestionData | null;
  onAnswerQuestion?: (answer: string) => void;
  onClearPlan?: () => void;

  // Shared Chat State & Handlers
  currentSessionId: string;
  activeConversationTitle: string;
  messages: UnifiedMessage[];
  sessions: { id: string; title: string; createdAt?: string }[];
  loading: boolean;
  liveStatus: string | null;
  liveThinking: string | null;
  livePlan: Plan | null;
  liveToolCalls: ToolCall[];
  liveTrajectory?: TrajectoryItem[];
  liveAnswer?: string | null;
  liveSeconds: number;
  selectedModel: string;
  onSelectModel: (m: string) => void;
  onSendMessage: (text: string, images?: string[], files?: string[]) => void;
  onCancelChat: () => void;
  onSelectSession: (sess: { id: string; title: string }) => void;
  onNewConversation: () => void;
  onDeleteSession: (e: React.MouseEvent, id: string) => void;
  onUndoMessage?: (msg: UnifiedMessage) => Promise<void> | void;

  showLeftSidebar?: boolean;
  onToggleLeftSidebar?: () => void;
  showTerminal?: boolean;
  onToggleTerminal?: () => void;
  showRightChat?: boolean;
  onToggleRightChat?: () => void;
  onResetLayout?: () => void;

  activeHighlight?: { filePath: string; startLine: number; endLine: number; id?: string } | null;
  onOpenFile?: (path: string, lineOrRange?: any) => void;
  onAcceptChange?: (filePath?: string) => void;
}

export const IDEMode: React.FC<IDEModeProps> = ({
  workspace,
  files,
  activeFile,
  fileContent,
  checkpoints,
  tools,
  skills,
  activeHighlight,
  onOpenFile,
  onAcceptChange,
  onSelectFile,
  onContentChange,
  onSaveFile,
  onRefreshFiles,
  onTriggerAgent,
  onRollback,
  onOpenSettings,
  permissionMode,
  onSelectPermissionMode,
  pendingQuestion,
  onAnswerQuestion,
  onClearPlan,
  currentSessionId,
  activeConversationTitle,
  messages,
  sessions,
  loading,
  liveStatus,
  liveThinking,
  livePlan,
  liveToolCalls,
  liveTrajectory = [],
  liveAnswer = null,
  liveSeconds,
  selectedModel,
  onSelectModel,
  onSendMessage,
  onCancelChat,
  onSelectSession,
  onNewConversation,
  onDeleteSession,
  onUndoMessage,
  showLeftSidebar,
  onToggleLeftSidebar,
  showTerminal,
  onToggleTerminal,
  showRightChat,
  onToggleRightChat,
  onResetLayout,
}) => {
  const [activeActivity, setActiveActivity] = useState<ActivityTab>('files');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(400);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const [localShowLeftSidebar, setLocalShowLeftSidebar] = useState(true);
  const [localShowTerminal, setLocalShowTerminal] = useState(true);
  const [localShowRightChat, setLocalShowRightChat] = useState(true);

  const effectiveShowLeft = showLeftSidebar !== undefined ? showLeftSidebar : localShowLeftSidebar;
  const toggleLeftSidebar = onToggleLeftSidebar || (() => setLocalShowLeftSidebar((p) => !p));

  const effectiveShowTerminal = showTerminal !== undefined ? showTerminal : localShowTerminal;
  const toggleTerminal = onToggleTerminal || (() => setLocalShowTerminal((p) => !p));

  const effectiveShowRight = showRightChat !== undefined ? showRightChat : localShowRightChat;
  const toggleRightChat = onToggleRightChat || (() => setLocalShowRightChat((p) => !p));

  const [terminalHeight, setTerminalHeight] = useState(260);
  const [isDraggingTerminal, setIsDraggingTerminal] = useState(false);

  const [tabs, setTabs] = useState<{ name: string; path: string }[]>([]);
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({});
  const [localHighlight, setLocalHighlight] = useState<{ filePath: string; startLine: number; endLine: number; id?: string } | null>(null);
  const effectiveHighlight = activeHighlight !== undefined ? activeHighlight : localHighlight;

  const handleOpenFileWithHighlight = (path: string, lineOrRange?: any) => {
    if (onOpenFile) {
      onOpenFile(path, lineOrRange);
      return;
    }
    onSelectFile(path);
    const isFolder = !path.includes('.') || path.endsWith('/') || path.endsWith('\\');
    if (!isFolder) {
      setTabs((prev) => {
        const cleanPrev = prev.filter((t) => t.path.includes('.') && !t.path.endsWith('/') && !t.path.endsWith('\\'));
        return cleanPrev.find((t) => t.path === path) ? cleanPrev : [...cleanPrev, { name: path.split(/[/\\]/).pop() || path, path }];
      });
    }
    if (lineOrRange) {
      if (typeof lineOrRange === 'number') {
        setLocalHighlight({ filePath: path, startLine: lineOrRange, endLine: lineOrRange });
      } else if (typeof lineOrRange === 'object' && lineOrRange.startLine) {
        setLocalHighlight({ ...lineOrRange, filePath: path });
      }
    }
  };

  const handleAcceptChangeInternal = (filePath?: string) => {
    if (onAcceptChange) {
      onAcceptChange(filePath);
    }
    setLocalHighlight(null);
  };

  // Mouse drag handlers for left and right splitters and terminal height resizer
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newW = Math.max(160, Math.min(600, e.clientX));
        setSidebarWidth(newW);
      } else if (isDraggingRight) {
        const newW = Math.max(280, Math.min(800, window.innerWidth - e.clientX));
        setChatWidth(newW);
      } else if (isDraggingTerminal) {
        const newH = Math.max(100, Math.min(window.innerHeight - 150, window.innerHeight - e.clientY - 35));
        setTerminalHeight(newH);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      setIsDraggingTerminal(false);
    };

    if (isDraggingLeft || isDraggingRight || isDraggingTerminal) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isDraggingTerminal ? 'row-resize' : 'col-resize';
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
  }, [isDraggingLeft, isDraggingRight, isDraggingTerminal]);

  // Sync activeFile into tabs (loại trừ thư mục, dọn dẹp các tab cũ)
  useEffect(() => {
    if (!activeFile) return;
    const isFolder = !activeFile.includes('.') || activeFile.endsWith('/') || activeFile.endsWith('\\');
    if (isFolder) return;

    setTabs((prev) => {
      const cleanPrev = prev.filter((t) => t.path.includes('.') && !t.path.endsWith('/') && !t.path.endsWith('\\'));
      if (cleanPrev.find((t) => t.path === activeFile || t.path.replace(/\\/g, '/') === activeFile.replace(/\\/g, '/'))) return cleanPrev;
      return [...cleanPrev, { name: activeFile.split(/[/\\]/).pop() || activeFile, path: activeFile }];
    });
  }, [activeFile]);

  const handleSave = () => {
    if (activeFile && onSaveFile) {
      onSaveFile(activeFile, fileContent);
      setDirtyFiles((prev) => ({ ...prev, [activeFile]: false }));
    }
  };

  // Ctrl+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && activeFile) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeFile, fileContent, onSaveFile]);

  const handleCloseTab = (e: React.MouseEvent, tabPath: string) => {
    e.stopPropagation();
    const remaining = tabs.filter((t) => t.path !== tabPath);
    setTabs(remaining);
    if (activeFile === tabPath && remaining.length > 0) {
      onSelectFile(remaining[remaining.length - 1].path);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 57px)', width: '100vw', overflow: 'hidden', background: '#18181b' }}>

      {/* LEFT: Activity Bar (Always visible, never collapsed) + Collapsible Explorer Drawer */}
      <IDEEnhancedSidebar
        activeTab={activeActivity}
        onTabChange={(tab) => {
          if (!effectiveShowLeft) {
            toggleLeftSidebar();
          }
          setActiveActivity(tab);
        }}
        files={files}
        activeFile={activeFile}
        onSelectFile={(f) => {
          setTabs((prev) => prev.find((t) => t.path === f) ? prev : [...prev, { name: f.split(/[/\\]/).pop() || f, path: f }]);
          onSelectFile(f);
        }}
        workspaceName={workspace ? workspace.split(/[/\\]/).pop() || 'workspace' : 'workspace'}
        onRefreshFiles={onRefreshFiles}
        sidebarWidth={sidebarWidth}
        onOpenSettings={onOpenSettings}
        isCollapsed={!effectiveShowLeft}
        onToggleCollapse={toggleLeftSidebar}
      />

      {/* DRAGGABLE RESIZER: Sidebar - Editor (Only visible when explorer drawer is expanded) */}
      {effectiveShowLeft && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingLeft(true);
          }}
          style={{
            width: '5px',
            cursor: 'col-resize',
            background: isDraggingLeft ? '#0ea5e9' : 'transparent',
            zIndex: 50,
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
          className="hover:bg-sky-500/50"
          title="Kéo sang trái/phải để đổi độ rộng Sidebar"
        />
      )}

      {/* CENTER: Editor + Terminal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#1e1e1e' }}>

        {/* Tab Bar */}
        <div style={{ height: '35px', background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', userSelect: 'none' }}>
          <div style={{ display: 'flex', height: '100%', overflowX: 'auto' }}>
            {tabs.map((t) => {
              const isActive = activeFile === t.path;
              const isDirty = dirtyFiles[t.path];
              const ext = t.name.split('.').pop() || '';
              const extColor = ext === 'go' ? '#00ADD8' : ext === 'tsx' || ext === 'ts' ? '#3178c6' : ext === 'md' ? '#a1a1aa' : '#f4c430';
              return (
                <div key={t.path} onClick={() => onSelectFile(t.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '0 12px', height: '100%', flexShrink: 0,
                    background: isActive ? '#1e1e1e' : '#18181b',
                    color: isActive ? '#ffffff' : '#969696', fontSize: '12px', cursor: 'pointer',
                    borderRight: '1px solid #27272a',
                    borderTop: isActive ? '1px solid #0078d4' : '1px solid transparent',
                  }}
                >
                  <span style={{ color: extColor, fontSize: '9px' }}>●</span>
                  <span>{t.name}</span>
                  {isDirty ? (
                    <span
                      title="Chưa lưu (Unsaved)"
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#38bdf8',
                        display: 'inline-block',
                        marginLeft: '4px',
                      }}
                      onClick={(e) => handleCloseTab(e, t.path)}
                    />
                  ) : (
                    <X size={13} style={{ marginLeft: '4px', cursor: 'pointer', color: '#71717a', opacity: 0.7 }} onClick={(e) => handleCloseTab(e, t.path)} />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '10px', color: '#71717a' }}>
            <span title="Chia đôi trình soạn thảo" style={{ display: 'flex', cursor: 'pointer' }}><Split size={14} /></span>
            <span title="Tùy chọn khác" style={{ display: 'flex', cursor: 'pointer' }}><MoreHorizontal size={14} /></span>
          </div>
        </div>

        {/* Breadcrumb + Save Button */}
        <div style={{ height: '26px', background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: '11px', color: '#71717a', borderBottom: '1px solid #282828' }}>
          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            {activeFile
              ? activeFile.split(/[/\\]/).map((seg, i, arr) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight size={13} style={{ margin: '0 2px' }} />}
                    <span style={{ color: i === arr.length - 1 ? '#f4f4f5' : '#969696' }}>{seg}</span>
                  </React.Fragment>
                ))
              : <span style={{ color: '#52525b' }}>No file open</span>}
          </div>
          {activeFile && dirtyFiles[activeFile] && (
            <button
              onClick={handleSave}
              title="Lưu tệp (Ctrl+S)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#0284c7',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Save size={12} />
              <span>Lưu *</span>
            </button>
          )}
        </div>

        {/* Monaco Editor */}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {activeFile ? (
            <MonacoWrapper
              filePath={activeFile}
              content={fileContent}
              onChange={(val) => {
                setDirtyFiles((prev) => ({ ...prev, [activeFile]: true }));
                onContentChange(val);
              }}
              highlightRange={
                effectiveHighlight && (
                  effectiveHighlight.filePath === activeFile ||
                  effectiveHighlight.filePath.replace(/\\/g, '/') === activeFile.replace(/\\/g, '/') ||
                  effectiveHighlight.filePath.split(/[/\\]/).pop() === activeFile.split(/[/\\]/).pop()
                ) ? effectiveHighlight : null
              }
            />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#52525b', gap: '12px', userSelect: 'none' }}>
              <FileText size={48} strokeWidth={1} />
              <div style={{ fontSize: '14px', color: '#71717a' }}>Open a file from the Explorer</div>
              <div style={{ fontSize: '12px' }}>Click any file in the left panel</div>
            </div>
          )}
        </div>

        {/* HORIZONTAL DRAGGABLE RESIZER: Editor - Terminal */}
        {effectiveShowTerminal && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingTerminal(true);
            }}
            style={{
              height: '5px',
              cursor: 'row-resize',
              background: isDraggingTerminal ? '#0ea5e9' : '#27272a',
              zIndex: 40,
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
            className="hover:bg-sky-500/60"
            title="Kéo lên / xuống để đổi chiều cao Terminal"
          />
        )}

        {/* Real VS Code Interactive PowerShell Terminal */}
        {effectiveShowTerminal ? (
          <VSCodeTerminal
            workspace={workspace}
            height={terminalHeight}
            onClose={() => toggleTerminal()}
          />
        ) : (
          <div
            onClick={() => toggleTerminal()}
            style={{
              height: '26px',
              borderTop: '1px solid #27272a',
              background: '#18181b',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              fontSize: '11px',
              color: '#94a3b8',
              cursor: 'pointer',
              userSelect: 'none',
              flexShrink: 0,
            }}
            className="hover:text-white hover:bg-white/5"
            title="Mở bảng điều khiển Terminal (Ctrl+`)"
          >
            <Terminal size={12} color="#38bdf8" />
            <span style={{ fontWeight: 600 }}>Terminal</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>powershell</span>
          </div>
        )}
      </div>

      {/* DRAGGABLE RESIZER: Editor - Chat & RIGHT: AI Assistant Panel */}
      {effectiveShowRight && (
        <>
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingRight(true);
            }}
            style={{
              width: '5px',
              cursor: 'col-resize',
              background: isDraggingRight ? '#0ea5e9' : 'transparent',
              zIndex: 50,
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
            className="hover:bg-sky-500/50"
            title="Kéo sang trái/phải để đổi độ rộng Chat Assistant"
          />

          <AgentChatPanel
            width={chatWidth}
            files={files}
            onTriggerAgent={onTriggerAgent}
            checkpoints={checkpoints}
            onRollback={onRollback}
            activeFile={activeFile}
            onClose={() => toggleRightChat()}
            onOpenSettings={onOpenSettings}
            currentSessionId={currentSessionId}
            activeConversationTitle={activeConversationTitle}
            messages={messages}
            sessions={sessions}
            loading={loading}
            liveStatus={liveStatus}
            liveThinking={liveThinking}
            livePlan={livePlan}
            liveToolCalls={liveToolCalls}
            liveTrajectory={liveTrajectory}
            liveAnswer={liveAnswer}
            liveSeconds={liveSeconds}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            onSendMessage={onSendMessage}
            onCancelChat={onCancelChat}
            onSelectSession={onSelectSession}
            onNewConversation={onNewConversation}
            onDeleteSession={onDeleteSession}
            onUndoMessage={onUndoMessage}
            permissionMode={permissionMode}
            onSelectPermissionMode={onSelectPermissionMode}
            pendingQuestion={pendingQuestion}
            onAnswerQuestion={onAnswerQuestion}
            onClearPlan={onClearPlan}
            onOpenFile={onOpenFile || handleOpenFileWithHighlight}
            onAcceptChange={onAcceptChange || handleAcceptChangeInternal}
          />
        </>
      )}
    </div>
  );
};
