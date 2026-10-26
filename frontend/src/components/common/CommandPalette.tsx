import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Code2,
  Sparkles,
  Bot,
  FolderOpen,
  Save,
  Play,
  RotateCcw,
  Settings,
  Terminal,
  FilePlus,
  RefreshCw,
  GitBranch,
} from 'lucide-react';
import { AppMode } from '../../types';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Workspace' | 'Project' | 'AI & Agent' | 'Development' | 'Settings';
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchMode: (mode: AppMode) => void;
  onOpenFolder: () => void;
  onSaveFile?: () => void;
  onNewFile?: () => void;
  onRunMultiAI?: () => void;
  onOpenSettings: () => void;
  onRollback?: () => void;
  onRunTests?: () => void;
  onRunBuild?: () => void;
  onRefreshFiles?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSwitchMode,
  onOpenFolder,
  onSaveFile,
  onNewFile,
  onRunMultiAI,
  onOpenSettings,
  onRollback,
  onRunTests,
  onRunBuild,
  onRefreshFiles,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const commands: CommandItem[] = [
    {
      id: 'switch_ide',
      title: 'Chuyển sang IDE Workspace (VS Code Mode)',
      category: 'Workspace',
      shortcut: 'Ctrl+1',
      icon: <Code2 size={16} color="#38bdf8" />,
      action: () => onSwitchMode('ide'),
    },
    {
      id: 'switch_vibe',
      title: 'Chuyển sang AI Workspace (Antigravity Conversation)',
      category: 'Workspace',
      shortcut: 'Ctrl+2',
      icon: <Sparkles size={16} color="#a855f7" />,
      action: () => onSwitchMode('vibe'),
    },
    {
      id: 'switch_multi_ai',
      title: 'Mở Multi-AI Workspace (Multi-Agent Vertical Pipeline)',
      category: 'Workspace',
      shortcut: 'Ctrl+3',
      icon: <Bot size={16} color="#22c55e" />,
      action: () => onSwitchMode('multi-ai'),
    },
    {
      id: 'open_folder',
      title: 'Mở thư mục dự án (Open Workspace Folder)',
      category: 'Project',
      shortcut: 'Ctrl+O',
      icon: <FolderOpen size={16} color="#eab308" />,
      action: onOpenFolder,
    },
    {
      id: 'new_file',
      title: 'Tạo tệp mới (New File)',
      category: 'Project',
      shortcut: 'Ctrl+N',
      icon: <FilePlus size={16} color="#60a5fa" />,
      action: () => onNewFile?.(),
    },
    {
      id: 'save_file',
      title: 'Lưu tệp tin hiện tại (Save File)',
      category: 'Project',
      shortcut: 'Ctrl+S',
      icon: <Save size={16} color="#10b981" />,
      action: () => onSaveFile?.(),
    },
    {
      id: 'refresh_files',
      title: 'Làm mới cây thư mục dự án (Refresh Files)',
      category: 'Project',
      shortcut: 'F5',
      icon: <RefreshCw size={16} color="#94a3b8" />,
      action: () => onRefreshFiles?.(),
    },
    {
      id: 'run_multi_ai',
      title: 'Chạy toàn bộ pipeline Multi-AI (Run All Nodes)',
      category: 'AI & Agent',
      shortcut: 'Ctrl+Enter',
      icon: <Play size={16} color="#22c55e" />,
      action: () => {
        onSwitchMode('multi-ai');
        onRunMultiAI?.();
      },
    },
    {
      id: 'rollback_cp',
      title: 'Khôi phục về Checkpoint gần nhất (1-Click Rollback)',
      category: 'AI & Agent',
      shortcut: 'Ctrl+Z',
      icon: <RotateCcw size={16} color="#f97316" />,
      action: () => onRollback?.(),
    },
    {
      id: 'run_tests',
      title: 'Chạy bộ kiểm thử tự động (go test ./...)',
      category: 'Development',
      shortcut: 'Ctrl+T',
      icon: <Play size={16} color="#38bdf8" />,
      action: () => onRunTests?.(),
    },
    {
      id: 'run_build',
      title: 'Biên dịch dự án (go build)',
      category: 'Development',
      shortcut: 'Ctrl+B',
      icon: <Terminal size={16} color="#06b6d4" />,
      action: () => onRunBuild?.(),
    },
    {
      id: 'git_status',
      title: 'Kiểm tra trạng thái thay đổi Git (Git Status)',
      category: 'Development',
      shortcut: 'Ctrl+G',
      icon: <GitBranch size={16} color="#f43f5e" />,
      action: () => onSwitchMode('ide'),
    },
    {
      id: 'open_settings',
      title: 'Cài đặt hệ thống & AI Providers (Settings)',
      category: 'Settings',
      shortcut: 'Ctrl+,',
      icon: <Settings size={16} color="#c084fc" />,
      action: onOpenSettings,
    },
  ];

  const filtered = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '620px',
          maxHeight: '480px',
          background: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '10px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #27272a',
            gap: '10px',
            background: '#1f1f23',
          }}
        >
          <Search size={18} color="#71717a" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Gõ lệnh hoặc tìm kiếm... (ví dụ: switch, folder, test, ai)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f4f4f5',
              fontSize: '14px',
            }}
          />
          <span style={{ fontSize: '11px', color: '#71717a', padding: '2px 6px', background: '#27272a', borderRadius: '4px' }}>
            ESC to close
          </span>
        </div>

        {/* Command List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
              Không tìm thấy lệnh phù hợp
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: isSelected ? '#27272a' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: '#141416',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {cmd.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', color: isSelected ? '#ffffff' : '#d4d4d8', fontWeight: 500 }}>
                        {cmd.title}
                      </div>
                      <div style={{ fontSize: '10px', color: '#71717a' }}>{cmd.category}</div>
                    </div>
                  </div>

                  {cmd.shortcut && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#a1a1aa',
                        background: '#18181b',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #333338',
                        fontFamily: 'monospace',
                      }}
                    >
                      {cmd.shortcut}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
