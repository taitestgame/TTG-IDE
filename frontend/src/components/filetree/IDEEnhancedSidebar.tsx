import React, { useState, useMemo, useEffect } from 'react';
import {
  Files,
  Search,
  GitBranch,
  PlayCircle,
  LayoutGrid,
  Settings,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Terminal,
  Activity,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  FilePlus,
  FolderPlus,
  RefreshCw,
  ChevronsDownUp,
  Trash2,
  Copy,
  Edit3,
  FolderMinus,
} from 'lucide-react';
import { WailsService } from '../../services/wailsBridge';
import { getFileIcon } from '../agent/TrajectoryStream';
import { StandardFileIcon } from '../common/StandardFileIcon';

export type ActivityTab = 'files' | 'search' | 'git' | 'debug' | 'extensions' | 'antigravity';

interface IDEEnhancedSidebarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  files: string[];
  activeFile: string;
  onSelectFile: (file: string) => void;
  onRefreshFiles: (preserveFile?: string) => void;
  workspaceName?: string;
  sidebarWidth?: number;
  onOpenSettings?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: Record<string, TreeNode>;
}

export const IDEEnhancedSidebar: React.FC<IDEEnhancedSidebarProps> = ({
  activeTab,
  onTabChange,
  files,
  activeFile,
  onSelectFile,
  onRefreshFiles,
  workspaceName = 'Anchuyennganh',
  sidebarWidth = 260,
  onOpenSettings,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    internal: true,
    'internal/agent': true,
    'internal/capabilities': true,
    'internal/capabilities/tools': true,
    'internal/capabilities/tools/fs': true,
    plugins: true,
    docs: false,
    frontend: false,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [gitStatus, setGitStatus] = useState<string>('');
  const [gitCommitMsg, setGitCommitMsg] = useState('');

  // Inline creation states (Zero ugly browser prompts!)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [newEntryName, setNewEntryName] = useState('');

  // Danh sách các thư mục chỉ xóa / ẩn khỏi IDE (không xóa dữ liệu ổ đĩa)
  const [removedFolders, setRemovedFolders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ttgide_removed_folders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleRemoveFolderFromIDE = (folderPath: string) => {
    const clean = (folderPath || '').replace(/^[/\\]+|[/\\]+$/g, '');
    if (!clean) return;
    setRemovedFolders((prev) => {
      const next = Array.from(new Set([...prev, clean]));
      try {
        localStorage.setItem('ttgide_removed_folders', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleRestoreRemovedFolders = () => {
    setRemovedFolders([]);
    try {
      localStorage.removeItem('ttgide_removed_folders');
    } catch {}
    onRefreshFiles();
  };

  const toggleFolder = (folderPath: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Tự động mở toàn bộ các thư mục cha khi một tệp tin được chọn hoặc tạo mới
  useEffect(() => {
    if (!activeFile) return;
    const clean = activeFile.replace(/\\/g, '/');
    const parts = clean.split('/');
    if (parts.length > 1) {
      const toOpen: Record<string, boolean> = {};
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        toOpen[acc] = true;
      }
      setOpenFolders((prev) => ({ ...prev, ...toOpen }));
    }
  }, [activeFile]);

  // Load real git status when tab is shown
  const loadGitStatus = async () => {
    try {
      const out = await WailsService.gitStatus();
      setGitStatus(out);
    } catch {
      setGitStatus('');
    }
  };

  useEffect(() => {
    if (activeTab === 'git') {
      loadGitStatus();
    }
  }, [activeTab]);

  const handleStartCreateFile = () => {
    setCreatingType('file');
    setNewEntryName('');
  };

  const handleStartCreateFolder = () => {
    setCreatingType('folder');
    setNewEntryName('');
  };

  const handleCommitCreation = async () => {
    if (!newEntryName.trim()) {
      setCreatingType(null);
      return;
    }
    const clean = newEntryName.trim();
    try {
      if (creatingType === 'file') {
        await WailsService.saveFile(clean, '');
        onSelectFile(clean);
        onRefreshFiles(clean);
      } else if (creatingType === 'folder') {
        await WailsService.createFolder(clean);
        onRefreshFiles();
      }
    } catch (e) {
      console.error('Lỗi tạo tệp/thư mục:', e);
    } finally {
      setCreatingType(null);
      setNewEntryName('');
    }
  };

  const handleDeleteFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    if (window.confirm(`Bạn có chắc chắn muốn xóa "${fileName}" không?`)) {
      await WailsService.deleteFile(filePath);
      onRefreshFiles();
    }
  };

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
    isDir: boolean;
  } | null>(null);

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handleClose);
      window.addEventListener('contextmenu', handleClose);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setContextMenu(null);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('click', handleClose);
        window.removeEventListener('contextmenu', handleClose);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [contextMenu]);

  const handleRename = async (targetPath: string) => {
    const currentName = targetPath.split(/[/\\]/).pop() || targetPath;
    const parentDir = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '';
    const newName = window.prompt(`Đổi tên "${currentName}" thành:`, currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const cleanNew = newName.trim();
      const newPath = parentDir ? `${parentDir}/${cleanNew}` : cleanNew;
      try {
        await WailsService.renameFile(targetPath, newPath);
        onRefreshFiles(newPath);
      } catch (err) {
        console.error('Lỗi khi đổi tên:', err);
      }
    }
  };

  const handleDelete = async (targetPath: string) => {
    const name = targetPath.split(/[/\\]/).pop() || targetPath;
    if (window.confirm(`Bạn có chắc chắn muốn xóa "${name}" không?`)) {
      try {
        await WailsService.deleteFile(targetPath);
        onRefreshFiles();
      } catch (err) {
        console.error('Lỗi khi xóa:', err);
      }
    }
  };

  const handleCopyPath = async (targetPath: string, isRelative: boolean) => {
    try {
      if (isRelative) {
        await navigator.clipboard.writeText(targetPath);
      } else {
        const ws = await WailsService.getWorkspace();
        const full = ws ? `${ws.replace(/\\/g, '/')}/${targetPath}` : targetPath;
        await navigator.clipboard.writeText(full);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevealInExplorer = async (targetPath: string) => {
    try {
      await WailsService.revealInExplorer(targetPath);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenInTerminal = async (targetPath: string, isDir: boolean) => {
    const dir = isDir ? targetPath : (targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '');
    try {
      await WailsService.runCommand(`cd "${dir || '.'}"`);
    } catch (e) {
      console.error(e);
    }
  };

  // Lọc bỏ các thư mục người dùng đã chọn đóng/xóa khỏi IDE (giữ 100% dữ liệu ổ đĩa)
  const visibleFiles = useMemo(() => {
    if (removedFolders.length === 0) return files;
    return files.filter((f) => {
      const cleanF = f.replace(/^[/\\]+/, '');
      return !removedFolders.some((rf) => cleanF === rf || cleanF.startsWith(rf + '/') || cleanF.startsWith(rf + '\\'));
    });
  }, [files, removedFolders]);

  // Build real dynamic nested tree from files list
  const fileTree = useMemo(() => {
    const root: TreeNode = { name: '', path: '', isDir: true, children: {} };

    visibleFiles.forEach((filePath) => {
      const parts = filePath.split(/[/\\]/);
      let current = root;

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        const currentPath = parts.slice(0, index + 1).join('/');

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            isDir: !isLast,
            children: {},
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [visibleFiles]);

  // Helper icon for file extension using standard language vector icons
  const renderFileIcon = (name: string) => {
    return <StandardFileIcon filename={name} size={15} />;
  };

  // Recursive tree renderer
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const childrenList = Object.values(node.children);
    // Sort directories first, then files
    childrenList.sort((a, b) => {
      if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
      return a.isDir ? -1 : 1;
    });

    return (
      <div key={node.path || 'root'} style={{ display: 'flex', flexDirection: 'column' }}>
        {childrenList.map((child) => {
          if (child.isDir) {
            const isIgnoredFolder = child.name === 'node_modules' || child.name === '.git' || child.name === 'dist' || child.name === '.ttgide';
            const isOpen = openFolders[child.path] ?? (!isIgnoredFolder && depth <= 1);
            return (
              <div key={child.path} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-ttgide-file', child.path);
                    e.dataTransfer.setData('text/plain', child.path);
                  }}
                  onClick={() => toggleFolder(child.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      x: Math.min(e.clientX, window.innerWidth - 220),
                      y: Math.min(e.clientY, window.innerHeight - 300),
                      path: child.path,
                      name: child.name,
                      isDir: true,
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 6px',
                    paddingLeft: `${depth * 14 + 6}px`,
                    cursor: 'pointer',
                    color: '#d4d4d8',
                    fontSize: '12px',
                    userSelect: 'none',
                  }}
                  className="hover:bg-white/5"
                >
                  {isOpen ? <ChevronDown size={13} color="#71717a" /> : <ChevronRight size={13} color="#71717a" />}
                  <StandardFileIcon filename={child.name} isFolder={true} isOpen={isOpen} size={15} />
                  <span>{child.name}</span>
                </div>
                {isOpen && renderNode(child, depth + 1)}
              </div>
            );
          }

          // File Item
          const isActive = activeFile === child.path;
          return (
            <div
              key={child.path}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-ttgide-file', child.path);
                e.dataTransfer.setData('text/plain', child.path);
              }}
              onClick={() => onSelectFile(child.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  x: Math.min(e.clientX, window.innerWidth - 220),
                  y: Math.min(e.clientY, window.innerHeight - 300),
                  path: child.path,
                  name: child.name,
                  isDir: false,
                });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                padding: '3px 6px',
                paddingLeft: `${depth * 14 + 20}px`,
                cursor: 'pointer',
                background: isActive ? 'rgba(2, 132, 199, 0.22)' : 'transparent',
                color: isActive ? '#ffffff' : '#a1a1aa',
                fontSize: '12px',
                borderRadius: '3px',
                userSelect: 'none',
              }}
              className="hover:bg-white/5 group"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                {renderFileIcon(child.name)}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {child.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleTabClick = (tab: ActivityTab) => {
    if (isCollapsed) {
      onToggleCollapse?.();
      onTabChange(tab);
    } else if (activeTab === tab) {
      onToggleCollapse?.();
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#18181b', flexShrink: 0 }}>
      {/* 1. ACTIVITY BAR (Image 1 Left 48px bar - ALWAYS VISIBLE, NEVER COLLAPSED) */}
      <div
        style={{
          width: '48px',
          height: '100%',
          background: '#18181b',
          borderRight: '1px solid #27272a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '6px',
          paddingBottom: '8px',
          flexShrink: 0,
        }}
      >
        {/* Top Activity Icons */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
          {/* Explorer Tab */}
          <button
            onClick={() => handleTabClick('files')}
            title="Explorer (Tệp dự án)"
            style={{
              width: '100%',
              height: '42px',
              background: 'none',
              border: 'none',
              borderLeft: (!isCollapsed && activeTab === 'files') ? '2px solid #ffffff' : '2px solid transparent',
              color: (!isCollapsed && activeTab === 'files') ? '#ffffff' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Files size={20} />
          </button>

          {/* Search Tab */}
          <button
            onClick={() => handleTabClick('search')}
            title="Search (Grep Codebase)"
            style={{
              width: '100%',
              height: '42px',
              background: 'none',
              border: 'none',
              borderLeft: (!isCollapsed && activeTab === 'search') ? '2px solid #ffffff' : '2px solid transparent',
              color: (!isCollapsed && activeTab === 'search') ? '#ffffff' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Search size={20} />
          </button>

          {/* Source Control Tab with Badge "1" */}
          <button
            onClick={() => handleTabClick('git')}
            title="Source Control (Git)"
            style={{
              width: '100%',
              height: '42px',
              background: 'none',
              border: 'none',
              borderLeft: (!isCollapsed && activeTab === 'git') ? '2px solid #ffffff' : '2px solid transparent',
              color: (!isCollapsed && activeTab === 'git') ? '#ffffff' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <GitBranch size={20} />
            <div
              style={{
                position: 'absolute',
                top: '6px',
                right: '8px',
                background: '#0284c7',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: 700,
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              1
            </div>
          </button>

          {/* Run & Debug */}
          <button
            onClick={() => handleTabClick('debug')}
            title="Run & Debug"
            style={{
              width: '100%',
              height: '42px',
              background: 'none',
              border: 'none',
              borderLeft: (!isCollapsed && activeTab === 'debug') ? '2px solid #ffffff' : '2px solid transparent',
              color: (!isCollapsed && activeTab === 'debug') ? '#ffffff' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <PlayCircle size={20} />
          </button>

          {/* Extensions */}
          <button
            onClick={() => handleTabClick('extensions')}
            title="Extensions & Plugins"
            style={{
              width: '100%',
              height: '42px',
              background: 'none',
              border: 'none',
              borderLeft: (!isCollapsed && activeTab === 'extensions') ? '2px solid #ffffff' : '2px solid transparent',
              color: (!isCollapsed && activeTab === 'extensions') ? '#ffffff' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={20} />
          </button>

          {/* TTG AI Superpowers (Replaced dummy A icon!) */}
          <div
            onClick={() => handleTabClick('antigravity')}
            title="TTG AI Superpowers & Multi-AI Tools"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background:
                (!isCollapsed && activeTab === 'antigravity')
                  ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                  : '#27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: (!isCollapsed && activeTab === 'antigravity') ? '#ffffff' : '#38bdf8',
              cursor: 'pointer',
              marginTop: '6px',
              boxShadow:
                (!isCollapsed && activeTab === 'antigravity')
                  ? '0 2px 8px rgba(2, 132, 199, 0.4)'
                  : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={15} />
          </div>
        </div>

        {/* Bottom Gear */}
        <div
          onClick={onOpenSettings}
          title="Cài đặt hệ thống (Ctrl+,)"
          style={{ color: '#71717a', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
          className="hover:text-white"
        >
          <Settings size={20} />
        </div>
      </div>

      {/* 2. SIDEBAR PANEL (Dynamic Width based on Resizer, Collapses cleanly into Activity Bar) */}
      {!isCollapsed && (
        <div
          style={{
            width: `${Math.max(160, sidebarWidth - 48)}px`,
            height: '100%',
            background: '#18181b',
            borderRight: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            fontSize: '12px',
            overflow: 'hidden',
          }}
        >
        {/* Header */}
        <div
          style={{
            height: '35px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#a1a1aa',
          }}
        >
          <span>
            {activeTab === 'files'
              ? 'EXPLORER'
              : activeTab === 'search'
              ? 'SEARCH'
              : activeTab === 'git'
              ? 'SOURCE CONTROL'
              : 'EXTENSIONS'}
          </span>
          {activeTab === 'files' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                title="Tạo tệp mới (New File)"
                style={{ cursor: 'pointer', color: '#a1a1aa', display: 'flex', alignItems: 'center' }}
                className="hover:text-white"
                onClick={handleStartCreateFile}
              >
                <FilePlus size={14} />
              </span>
              <span
                title="Tạo thư mục mới (New Folder)"
                style={{ cursor: 'pointer', color: '#a1a1aa', display: 'flex', alignItems: 'center' }}
                className="hover:text-white"
                onClick={handleStartCreateFolder}
              >
                <FolderPlus size={14} />
              </span>
              <span
                title="Làm mới danh sách (Refresh)"
                style={{ cursor: 'pointer', color: '#a1a1aa', display: 'flex', alignItems: 'center' }}
                className="hover:text-white"
                onClick={() => onRefreshFiles()}
              >
                <RefreshCw size={14} />
              </span>
              <span
                title="Thu gọn tất cả (Collapse All)"
                style={{ cursor: 'pointer', color: '#a1a1aa', display: 'flex', alignItems: 'center' }}
                className="hover:text-white"
                onClick={() => setOpenFolders({})}
              >
                <ChevronsDownUp size={14} />
              </span>
            </div>
          ) : (
            <MoreHorizontal size={14} style={{ cursor: 'pointer' }} onClick={() => onRefreshFiles()} />
          )}
        </div>

        {/* TAB 1: FILES EXPLORER */}
        {activeTab === 'files' && (
          <>
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: Math.min(e.clientX, window.innerWidth - 220),
                  y: Math.min(e.clientY, window.innerHeight - 300),
                  path: '',
                  name: workspaceName,
                  isDir: true,
                });
              }}
              style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}
            >
              {/* Workspace root item */}
              <div
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: Math.min(e.clientX, window.innerWidth - 220),
                    y: Math.min(e.clientY, window.innerHeight - 300),
                    path: '',
                    name: workspaceName,
                    isDir: true,
                  });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 6px',
                  fontWeight: 700,
                  color: '#f4f4f5',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <ChevronDown size={14} />
                <span>{workspaceName}</span>
              </div>

              {/* INLINE NEW FILE / NEW FOLDER CREATION (VS Code Style) */}
              {creatingType !== null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px 3px 20px',
                    background: 'rgba(2, 132, 199, 0.15)',
                    border: '1px solid #0284c7',
                    borderRadius: '4px',
                    margin: '2px 4px',
                  }}
                >
                  {creatingType === 'file' ? (
                    <FileCode size={13} color="#38bdf8" />
                  ) : (
                    <Folder size={13} color="#eab308" />
                  )}
                  <input
                    type="text"
                    autoFocus
                    value={newEntryName}
                    onChange={(e) => setNewEntryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCommitCreation();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setCreatingType(null);
                        setNewEntryName('');
                      }
                    }}
                    onBlur={() => {
                      if (!newEntryName.trim()) setCreatingType(null);
                    }}
                    placeholder={creatingType === 'file' ? 'Tên tệp (main.go)...' : 'Tên thư mục (utils)...'}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <span style={{ fontSize: '9px', color: '#94a3b8' }}>↵ Enter</span>
                </div>
              )}

              {/* Dynamic Real File Tree */}
              {renderNode(fileTree)}
            </div>
          </>
        )}

        {/* TAB 2: SEARCH */}
        {activeTab === 'search' && (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !searchQuery.trim()) return;
                try {
                  const out = await WailsService.grepSearch(searchQuery);
                  if (!out || out.trim().length === 0) {
                    setSearchResults([`Không tìm thấy kết quả nào cho "${searchQuery}"`]);
                  } else {
                    setSearchResults(out.split('\n').filter(Boolean).slice(0, 50));
                  }
                } catch (err: any) {
                  setSearchResults([`Lỗi tìm kiếm: ${err?.message || err}`]);
                }
              }}
              placeholder="Search in files (Enter to search)..."
              style={{
                width: '100%',
                background: '#141416',
                border: '1px solid #2e2e34',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#ffffff',
                fontSize: '11px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchResults.length === 0 && (
              <div style={{ fontSize: '11px', color: '#71717a', textAlign: 'center', marginTop: '16px' }}>
                Press Enter to search
              </div>
            )}
            {searchResults.map((line, i) => {
              const parts = line.split(':');
              const file = parts[0] || '';
              const lineNum = parts[1] || '';
              const content = parts.slice(2).join(':');
              return (
                <div key={i} style={{ fontSize: '11px', color: '#d4d4d8', padding: '3px 4px', borderRadius: '3px', cursor: 'pointer' }}
                  className="hover:bg-white/5"
                  onClick={() => onSelectFile(file.replace(/^\.[\/\\]/, ''))}
                >
                  <span style={{ color: '#38bdf8' }}>{file}</span>
                  {lineNum && <span style={{ color: '#71717a' }}>:{lineNum}</span>}
                  <span style={{ color: '#a1a1aa' }}>{content}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: SOURCE CONTROL (GIT) */}
        {activeTab === 'git' && (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
            <textarea
              value={gitCommitMsg}
              onChange={(e) => setGitCommitMsg(e.target.value)}
              placeholder="Message (Ctrl+Enter to commit)..."
              onKeyDown={async (e) => {
                if (!((e.ctrlKey || e.metaKey) && e.key === 'Enter')) return;
                if (!gitCommitMsg.trim()) return;
                await WailsService.gitCommit(gitCommitMsg);
                setGitCommitMsg('');
                await loadGitStatus();
              }}
              style={{
                height: '60px',
                background: '#141416',
                border: '1px solid #2e2e34',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#ffffff',
                fontSize: '11px',
                resize: 'none',
                outline: 'none',
              }}
            />
            <button
              onClick={async () => {
                if (!gitCommitMsg.trim()) return;
                const app = (window as any)?.go?.main?.App;
                if (app?.RunTerminalCommand) {
                  await app.RunTerminalCommand(`git add -A && git commit -m "${gitCommitMsg}"`);
                  setGitCommitMsg('');
                  const out = await app.RunTerminalCommand('git status --short');
                  setGitStatus(out);
                }
              }}
              style={{
                background: '#0284c7', border: 'none', borderRadius: '4px',
                padding: '6px', color: '#ffffff', fontWeight: 600,
                fontSize: '11px', cursor: 'pointer',
              }}
            >
              ✓ Commit (Ctrl+Enter)
            </button>
            <div style={{ borderTop: '1px solid #27272a', paddingTop: '8px', fontSize: '11px', color: '#71717a' }}>
              {gitStatus ? 'CHANGES' : 'No changes'}
            </div>
            {gitStatus
              ? gitStatus.split('\n').filter(Boolean).map((line, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#38bdf8', paddingLeft: '6px' }}>{line}</div>
                ))
              : <div style={{ fontSize: '11px', color: '#52525b', paddingLeft: '6px' }}>Working tree clean</div>}
          </div>
        )}

        {/* TAB 4: EXTENSIONS & TTG AI SUPERPOWERS */}
        {(activeTab === 'extensions' || activeTab === 'antigravity') && (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={13} color="#38bdf8" />
              <span>TTG AI SUPERPOWERS & TOOLS</span>
            </div>
            <div style={{ fontSize: '11px', color: '#71717a' }}>
              Hệ thống 23 Tool Calls tự động & Đấu trường Multi-AI:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '11px' }}>fs_tools</div>
                <div style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '2px' }}>read_file, write_file, edit_file, list_dir</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '11px' }}>terminal_tools</div>
                <div style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '2px' }}>run_command, manage_task (PowerShell)</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '11px' }}>git_tools</div>
                <div style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '2px' }}>git_diff, git_status, git_commit, rollback</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '11px' }}>multi_ai_arena</div>
                <div style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '2px' }}>Song song 2-4 Sandbox AI so sánh lời giải</div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 4. CONTEXT MENU (VS Code File Explorer Style) */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            minWidth: '220px',
            background: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            padding: '4px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            fontSize: '12px',
            userSelect: 'none',
          }}
        >
          {/* Menu item: New File */}
          <div
            onClick={() => {
              setCreatingType('file');
              setNewEntryName(contextMenu.isDir && contextMenu.path ? `${contextMenu.path}/` : '');
              setContextMenu(null);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
            className="hover:bg-blue-600 hover:text-white"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FilePlus size={14} />
              <span>New File...</span>
            </div>
          </div>

          {/* Menu item: New Folder */}
          <div
            onClick={() => {
              setCreatingType('folder');
              setNewEntryName(contextMenu.isDir && contextMenu.path ? `${contextMenu.path}/` : '');
              setContextMenu(null);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
            className="hover:bg-blue-600 hover:text-white"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderPlus size={14} />
              <span>New Folder...</span>
            </div>
          </div>

          <div style={{ height: '1px', background: '#27272a', margin: '3px 4px' }} />

          {/* Menu item: Reveal in File Explorer */}
          <div
            onClick={() => {
              handleRevealInExplorer(contextMenu.path);
              setContextMenu(null);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
            className="hover:bg-blue-600 hover:text-white"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderOpen size={14} />
              <span>Reveal in File Explorer</span>
            </div>
            <span style={{ fontSize: '10px', color: '#71717a' }}>Shift+Alt+R</span>
          </div>

          {/* Menu item: Open in Integrated Terminal */}
          <div
            onClick={() => {
              handleOpenInTerminal(contextMenu.path, contextMenu.isDir);
              setContextMenu(null);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
            className="hover:bg-blue-600 hover:text-white"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={14} />
              <span>Open in Integrated Terminal</span>
            </div>
          </div>

          <div style={{ height: '1px', background: '#27272a', margin: '3px 4px' }} />

          {/* Menu item: Copy Path */}
          <div
            onClick={() => {
              handleCopyPath(contextMenu.path, false);
              setContextMenu(null);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
            className="hover:bg-blue-600 hover:text-white"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Copy size={14} />
              <span>Copy Path</span>
            </div>
            <span style={{ fontSize: '10px', color: '#71717a' }}>Shift+Alt+C</span>
          </div>

          {/* Menu item: Copy Relative Path */}
          <div
            onClick={() => {
              handleCopyPath(contextMenu.path, true);
              setContextMenu(null);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
            className="hover:bg-blue-600 hover:text-white"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Copy size={14} />
              <span>Copy Relative Path</span>
            </div>
          </div>

          {contextMenu.path && (
            <>
              <div style={{ height: '1px', background: '#27272a', margin: '3px 4px' }} />

              {/* Menu item: Rename... */}
              <div
                onClick={() => {
                  handleRename(contextMenu.path);
                  setContextMenu(null);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f4f4f5' }}
                className="hover:bg-blue-600 hover:text-white"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={14} />
                  <span>Rename...</span>
                </div>
                <span style={{ fontSize: '10px', color: '#71717a' }}>F2</span>
              </div>

              {/* Menu item: Remove Folder from IDE (Chỉ xóa/đóng khỏi IDE, KHÔNG xóa dữ liệu ổ đĩa) */}
              {contextMenu.isDir && (
                <div
                  onClick={() => {
                    handleRemoveFolderFromIDE(contextMenu.path);
                    setContextMenu(null);
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#fbbf24' }}
                  className="hover:bg-amber-600/30 hover:text-white"
                  title="Đóng / xóa thư mục này khỏi IDE mà KHÔNG xóa tệp tin trên ổ đĩa"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FolderMinus size={14} color="#fbbf24" />
                    <span>Remove Folder from IDE</span>
                  </div>
                </div>
              )}

              {/* Menu item: Delete (Xóa thực sự trên ổ đĩa) */}
              <div
                onClick={() => {
                  handleDelete(contextMenu.path);
                  setContextMenu(null);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#f87171' }}
                className="hover:bg-red-600 hover:text-white"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trash2 size={14} />
                  <span>Delete</span>
                </div>
                <span style={{ fontSize: '10px', color: '#71717a' }}>Del</span>
              </div>
            </>
          )}

          {/* Menu item: Khôi phục lại các thư mục đã đóng khỏi IDE */}
          {removedFolders.length > 0 && (
            <>
              <div style={{ height: '1px', background: '#27272a', margin: '3px 4px' }} />
              <div
                onClick={() => {
                  handleRestoreRemovedFolders();
                  setContextMenu(null);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', color: '#38bdf8' }}
                className="hover:bg-sky-600/30 hover:text-white"
                title="Hiện lại toàn bộ các thư mục đã đóng trước đây"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RotateCcw size={14} color="#38bdf8" />
                  <span>Restore Hidden Folders ({removedFolders.length})</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
