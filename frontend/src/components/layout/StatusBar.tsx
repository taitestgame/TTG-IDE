import React from 'react';
import { GitBranch, Bell, Settings, Radio } from 'lucide-react';
import { PermissionSelector, PermissionMode } from '../common/PermissionSelector';

interface StatusBarProps {
  workspace: string;
  activeFile?: string;
  checkpointCount?: number;
  permissionMode?: PermissionMode;
  onSelectPermissionMode?: (mode: PermissionMode) => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  workspace,
  activeFile = 'README.md',
  checkpointCount = 0,
  permissionMode,
  onSelectPermissionMode,
}) => {
  const fileExt = activeFile.split('.').pop() || 'md';
  const language =
    fileExt === 'go'
      ? 'Go'
      : fileExt === 'tsx' || fileExt === 'ts'
      ? 'TypeScript'
      : fileExt === 'md'
      ? 'Markdown'
      : 'JSON';

  return (
    <footer
      style={{
        height: '22px',
        background: '#18181b',
        borderTop: '1px solid #27272a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 0',
        fontSize: '11px',
        color: '#a1a1aa',
        userSelect: 'none',
        zIndex: 40,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* LEFT SECTION (Image 1: Blue >< icon, 0 0 0) */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        {/* Blue Remote Indicator >< */}
        <div
          style={{
            background: '#0284c7',
            color: '#ffffff',
            height: '100%',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '12px',
            marginRight: '8px',
            cursor: 'pointer',
          }}
        >
          &gt;&lt;
        </div>

        {/* Status icons (0 errors, 0 warnings) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span className="hover:text-white">⊗ 0</span>
          <span className="hover:text-white">⚠ 0</span>
          <span className="hover:text-white">ℹ 0</span>
        </div>
      </div>

      {/* RIGHT SECTION (Image 1: Ln 1, Col 1 | Spaces: 4 | UTF-8 with BOM | LF | Markdown | * Claude Code | Antigravity - Settings | Bell) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px' }}>
        <span className="hover:text-white cursor-pointer">Ln 1, Col 1</span>
        <span className="hover:text-white cursor-pointer">Spaces: 4</span>
        <span className="hover:text-white cursor-pointer">UTF-8 with BOM</span>
        <span className="hover:text-white cursor-pointer">LF</span>
        <span className="hover:text-white cursor-pointer">&#123; &#125; {language}</span>
        <span
          className="hover:text-white cursor-pointer"
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span style={{ color: '#0ea5e9' }}>✦</span> TTG IDE
        </span>
        <span className="hover:text-white cursor-pointer">Settings</span>
        <Bell size={12} style={{ cursor: 'pointer' }} />
      </div>
    </footer>
  );
};
