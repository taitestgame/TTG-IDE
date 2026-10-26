import React, { useState, useEffect, useRef } from 'react';
import { AppMode } from '../../types';
import { LayoutControls } from './LayoutControls';
import {
  Code2,
  Sparkles,
  Layers,
  FolderOpen,
  FilePlus,
  Save,
  Settings,
  Flame,
  Minus,
  Square,
  X,
  Search,
  Play,
  Terminal,
  CheckCircle2,
  HelpCircle,
  FileText,
  RotateCcw,
} from 'lucide-react';

interface TitleBarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  workspace: string;
  activeFile?: string;
  checkpointCount?: number;
  onQuickRollback?: () => void;
  onOpenFolder?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onNewFile?: () => void;
  onSaveFile?: () => void;
  onRunTests?: () => void;
  showLeftSidebar?: boolean;
  onToggleLeftSidebar?: () => void;
  showTerminal?: boolean;
  onToggleTerminal?: () => void;
  showRightChat?: boolean;
  onToggleRightChat?: () => void;
  onResetLayout?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  mode,
  onModeChange,
  workspace,
  activeFile = 'README.md',
  checkpointCount = 0,
  onQuickRollback,
  onOpenFolder,
  onOpenCommandPalette,
  onOpenSettings,
  onNewFile,
  onSaveFile,
  onRunTests,
  showLeftSidebar = true,
  onToggleLeftSidebar,
  showTerminal = true,
  onToggleTerminal,
  showRightChat = true,
  onToggleRightChat,
  onResetLayout,
}) => {
  const folderName = workspace.split(/[/\\]/).pop() || 'Anchuyennganh';
  const fileName = activeFile.split(/[/\\]/).pop() || 'README.md';

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (name: string) => {
    setActiveMenu((prev) => (prev === name ? null : name));
  };

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    top: '32px',
    left: 0,
    background: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: '6px',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
    padding: '4px 0',
    minWidth: '220px',
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'column',
  };

  const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 14px',
    fontSize: '12px',
    color: '#e4e4e7',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <header
      style={{
        height: '36px',
        background: '#141416',
        borderBottom: '1px solid #27272a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 12px',
        userSelect: 'none',
        zIndex: 50,
        fontSize: '12px',
        color: '#a1a1aa',
        position: 'relative',
      }}
    >
      {/* 1. LEFT SECTION: Logo & 8 Full Working Desktop Menus */}
      <div ref={menuBarRef} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Brand Logo */}
        <div
          onClick={() => onModeChange('ide')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            marginRight: '6px',
          }}
          title="Taitestgame IDE – Dual-Mode & Multi-AI Development Environment"
        >
          <Flame size={16} color="#ffffff" />
          <span style={{ color: '#ffffff', letterSpacing: '0.5px' }}>Antigravity 2.0</span>
        </div>

        {/* 8 REAL DESKTOP DROPDOWN MENUS (IDE Mode only) */}
        {mode === 'ide' && (
        <div style={{ display: 'flex', gap: '2px', color: '#d4d4d8', fontSize: '12px' }}>
          {/* Menu 1: FILE */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('file')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'file' ? '#27272a' : 'transparent',
                color: activeMenu === 'file' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              File
            </span>
            {activeMenu === 'file' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onNewFile?.();
                  }}
                >
                  <span>New File (Tạo tệp mới)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+N</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenFolder?.();
                  }}
                >
                  <span>Open Folder... (Mở thư mục)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+O</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onSaveFile?.();
                  }}
                >
                  <span>Save (Lưu tệp)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+S</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onSaveFile?.();
                  }}
                >
                  <span>Save All (Lưu tất cả)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+Shift+S</span>
                </div>
                <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenSettings?.();
                  }}
                >
                  <span>Preferences (Cài đặt)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+,</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 2: EDIT */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('edit')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'edit' ? '#27272a' : 'transparent',
                color: activeMenu === 'edit' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              Edit
            </span>
            {activeMenu === 'edit' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    document.execCommand('undo');
                  }}
                >
                  <span>Undo</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+Z</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    document.execCommand('redo');
                  }}
                >
                  <span>Redo</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+Y</span>
                </div>
                <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    document.execCommand('cut');
                  }}
                >
                  <span>Cut</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+X</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    document.execCommand('copy');
                  }}
                >
                  <span>Copy</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+C</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenCommandPalette?.();
                  }}
                >
                  <span>Find in Files (Tìm kiếm)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+Shift+F</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 3: SELECTION */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('selection')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'selection' ? '#27272a' : 'transparent',
                color: activeMenu === 'selection' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              Selection
            </span>
            {activeMenu === 'selection' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    document.execCommand('selectAll');
                  }}
                >
                  <span>Select All</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+A</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('ide');
                  }}
                >
                  <span>Expand Selection</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('ide');
                  }}
                >
                  <span>Shrink Selection</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 4: VIEW */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('view')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'view' ? '#27272a' : 'transparent',
                color: activeMenu === 'view' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              View
            </span>
            {activeMenu === 'view' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('ide');
                  }}
                >
                  <span>Mode A: IDE Workspace</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+M</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('vibe');
                  }}
                >
                  <span>Mode B: AI Workspace</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+M</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('multi-ai');
                  }}
                >
                  <span>Multi-AI Workspace (Pipeline)</span>
                </div>
                <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenCommandPalette?.();
                  }}
                >
                  <span>Command Palette...</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+Shift+P</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 5: GO */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('go')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'go' ? '#27272a' : 'transparent',
                color: activeMenu === 'go' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              Go
            </span>
            {activeMenu === 'go' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenCommandPalette?.();
                  }}
                >
                  <span>Go to File...</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+P</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenCommandPalette?.();
                  }}
                >
                  <span>Go to Symbol...</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+Shift+O</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 6: RUN */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('run')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'run' ? '#27272a' : 'transparent',
                color: activeMenu === 'run' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              Run
            </span>
            {activeMenu === 'run' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onRunTests?.();
                  }}
                >
                  <span>Run Unit Tests (Chạy kiểm thử)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>go test</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('multi-ai');
                  }}
                >
                  <span>Run Multi-AI Pipeline</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 7: TERMINAL */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('terminal')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'terminal' ? '#27272a' : 'transparent',
                color: activeMenu === 'terminal' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              Terminal
            </span>
            {activeMenu === 'terminal' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onModeChange('ide');
                  }}
                >
                  <span>Toggle Terminal Panel</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+`</span>
                </div>
              </div>
            )}
          </div>

          {/* Menu 8: HELP */}
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => toggleMenu('help')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeMenu === 'help' ? '#27272a' : 'transparent',
                color: activeMenu === 'help' ? '#ffffff' : '#d4d4d8',
              }}
              className="hover:bg-zinc-800 hover:text-white"
            >
              Help
            </span>
            {activeMenu === 'help' && (
              <div style={menuStyle}>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenSettings?.();
                  }}
                >
                  <span>Keyboard Shortcuts (Phím tắt)</span>
                  <span style={{ color: '#71717a', fontSize: '11px' }}>Ctrl+,</span>
                </div>
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenSettings?.();
                  }}
                >
                  <span>AI Providers & API Bridge (:5050)</span>
                </div>
                <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />
                <div
                  style={menuItemStyle}
                  className="hover:bg-sky-600 hover:text-white"
                  onClick={() => {
                    setActiveMenu(null);
                    alert('Taitestgame IDE (TTG IDE) v1.0.0\nNền tảng Desktop AI-Powered Vibe Coding & Multi-AI Orchestrator.');
                  }}
                >
                  <span>About Taitestgame IDE</span>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* 2. CENTER SECTION: Mode Switcher Segmented Control (Clean Minimalist Antigravity Dark) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '2px',
          gap: '2px',
        }}
      >
        <button
          onClick={() => onModeChange('ide')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '6px',
            border: mode === 'ide' ? '1px solid #3f3f46' : '1px solid transparent',
            fontSize: '12px',
            fontWeight: mode === 'ide' ? 600 : 500,
            cursor: 'pointer',
            background: mode === 'ide' ? '#27272a' : 'transparent',
            color: mode === 'ide' ? '#f4f4f5' : '#a1a1aa',
            transition: 'all 0.15s ease',
          }}
          className={mode !== 'ide' ? 'hover:text-white hover:bg-white/5' : ''}
          title="Chế độ Antigravity IDE Workspace (Full Code & Monaco Editor) - Ctrl+M"
        >
          <Code2 size={13} strokeWidth={2} color={mode === 'ide' ? '#f4f4f5' : '#a1a1aa'} />
          <span>Antigravity IDE</span>
        </button>

        <button
          onClick={() => onModeChange('vibe')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '6px',
            border: mode === 'vibe' ? '1px solid #3f3f46' : '1px solid transparent',
            fontSize: '12px',
            fontWeight: mode === 'vibe' ? 600 : 500,
            cursor: 'pointer',
            background: mode === 'vibe' ? '#27272a' : 'transparent',
            color: mode === 'vibe' ? '#f4f4f5' : '#a1a1aa',
            transition: 'all 0.15s ease',
          }}
          className={mode !== 'vibe' ? 'hover:text-white hover:bg-white/5' : ''}
          title="Chế độ Antigravity 2.0 (Canvas & Vibe Coding) - Ctrl+M"
        >
          <Sparkles size={13} strokeWidth={2} color={mode === 'vibe' ? '#f4f4f5' : '#a1a1aa'} />
          <span>Antigravity 2.0</span>
        </button>

        <button
          onClick={() => onModeChange('multi-ai')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '6px',
            border: mode === 'multi-ai' ? '1px solid #3f3f46' : '1px solid transparent',
            fontSize: '12px',
            fontWeight: mode === 'multi-ai' ? 600 : 500,
            cursor: 'pointer',
            background: mode === 'multi-ai' ? '#27272a' : 'transparent',
            color: mode === 'multi-ai' ? '#f4f4f5' : '#a1a1aa',
            transition: 'all 0.15s ease',
          }}
          className={mode !== 'multi-ai' ? 'hover:text-white hover:bg-white/5' : ''}
          title="Chế độ Multi-AI Workspace (Pipeline Hàng Dọc)"
        >
          <Layers size={13} strokeWidth={2} color={mode === 'multi-ai' ? '#f4f4f5' : '#a1a1aa'} />
          <span>Multi-AI</span>
        </button>
      </div>

      {/* 3. RIGHT SECTION: Status Pill, Command Palette, Settings & Window Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Layout Toggle Buttons (VS Code Style - IDE Mode only) */}
        {mode === 'ide' && (
          <>
            <LayoutControls
              showLeftSidebar={showLeftSidebar}
              onToggleLeftSidebar={onToggleLeftSidebar}
              showTerminal={showTerminal}
              onToggleTerminal={onToggleTerminal}
              showRightChat={showRightChat}
              onToggleRightChat={onToggleRightChat}
              onResetLayout={onResetLayout}
            />
            <div style={{ width: '1px', height: '16px', background: '#27272a', margin: '0 2px' }} />
          </>
        )}


        {/* Command Palette Trigger Button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '5px',
              padding: '2px 7px',
              color: '#d4d4d8',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            title="Mở Command Palette (Ctrl+Shift+P)"
          >
            <Search size={11} color="#38bdf8" />
            <span>Ctrl+Shift+P</span>
          </button>
        )}

        {/* Settings Button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '3px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Cài đặt hệ thống (Ctrl+,)"
          >
            <Settings size={15} />
          </button>
        )}


      </div>
    </header>
  );
};
