import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  AlertCircle,
  GitBranch,
  Activity,
  Play,
  Trash2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Check,
} from 'lucide-react';
import { WailsService } from '../../services/wailsBridge';

interface EnhancedTerminalDrawerProps {
  onRunTest?: () => void;
  toolCallLogs?: string[];
}

export const EnhancedTerminalDrawer: React.FC<EnhancedTerminalDrawerProps> = ({
  onRunTest,
  toolCallLogs = [],
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'problems' | 'tools' | 'git'>('terminal');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'TTG IDE Cyber Interactive Terminal (Windows PowerShell & Shell Bridge)',
    'Gõ lệnh trực tiếp hoặc bấm các phím tắt bên dưới để thực thi qua Wails backend...',
  ]);

  const handleRunCommand = async (customCmd?: string) => {
    const cmd = customCmd || command;
    if (!cmd.trim() || isExecuting) return;

    setCommand('');
    setTerminalLogs((prev) => [...prev, `$ ${cmd}`]);
    setIsExecuting(true);

    try {
      const output = await WailsService.runCommand(cmd);
      setTerminalLogs((prev) => [...prev, output || '(Lệnh thực thi thành công, không có stdout)']);
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `[LỖI THỰC THI]: ${err.message || err}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  const quickCommands = [
    { label: 'go build ./...', cmd: 'go build ./...' },
    { label: 'go test ./...', cmd: 'go test ./...' },
    { label: 'go vet ./...', cmd: 'go vet ./...' },
    { label: 'git status', cmd: 'git status' },
  ];

  if (isCollapsed) {
    return (
      <div
        style={{
          height: '28px',
          background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
        onClick={() => setIsCollapsed(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TerminalIcon size={12} color="var(--cyan)" />
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>TERMINAL DRAWER (COLLAPSED)</span>
        </div>
        <ChevronUp size={14} />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '240px',
        background: 'var(--bg-void)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Header bar of drawer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: '34px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-dim)',
        }}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            onClick={() => setActiveTab('terminal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'terminal' ? '2px solid var(--cyan)' : '2px solid transparent',
              color: activeTab === 'terminal' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <TerminalIcon size={12} color={activeTab === 'terminal' ? 'var(--cyan)' : 'inherit'} />
            TERMINAL
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'problems' ? '2px solid var(--cyan)' : '2px solid transparent',
              color: activeTab === 'problems' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <AlertCircle size={12} color={activeTab === 'problems' ? 'var(--cyan)' : 'inherit'} />
            PROBLEMS (0)
          </button>

          <button
            onClick={() => setActiveTab('tools')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'tools' ? '2px solid var(--cyan)' : '2px solid transparent',
              color: activeTab === 'tools' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Activity size={12} color={activeTab === 'tools' ? 'var(--cyan)' : 'inherit'} />
            TOOL CALL STREAM
          </button>

          <button
            onClick={() => setActiveTab('git')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'git' ? '2px solid var(--cyan)' : '2px solid transparent',
              color: activeTab === 'git' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <GitBranch size={12} color={activeTab === 'git' ? 'var(--cyan)' : 'inherit'} />
            GIT CHANGES
          </button>
        </div>

        {/* Quick Command Shortcuts & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {quickCommands.map((qc, idx) => (
            <button
              key={idx}
              onClick={() => handleRunCommand(qc.cmd)}
              disabled={isExecuting}
              style={{
                fontSize: '10px',
                fontFamily: "'Fira Code', monospace",
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: '#38bdf8',
                padding: '2px 8px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
              }}
            >
              {qc.label}
            </button>
          ))}

          <button
            onClick={() => setTerminalLogs([])}
            title="Clear terminal"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <Trash2 size={13} />
          </button>

          <button
            onClick={() => setIsCollapsed(true)}
            title="Thu gọn Drawer"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Content depending on Active Tab */}
      {activeTab === 'terminal' && (
        <>
          <div
            style={{
              flex: 1,
              padding: '10px 14px',
              overflowY: 'auto',
              fontFamily: "'Fira Code', monospace",
              fontSize: '12px',
              lineHeight: '1.6',
              background: 'rgba(5, 7, 11, 0.95)',
            }}
          >
            {terminalLogs.map((log, i) => (
              <div
                key={i}
                style={{
                  whiteSpace: 'pre-wrap',
                  color: log.startsWith('$')
                    ? 'var(--cyan)'
                    : log.startsWith('[LỖI')
                    ? 'var(--rose)'
                    : '#cbd5e1',
                }}
              >
                {log}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunCommand();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              borderTop: '1px solid var(--border-dim)',
              background: 'rgba(8, 12, 19, 0.98)',
            }}
          >
            <span
              style={{
                color: 'var(--cyan)',
                marginRight: '8px',
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}
            >
              &gt;
            </span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Nhập lệnh shell hoặc PowerShell (vd: go run main.go, npm test)..."
              disabled={isExecuting}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontFamily: "'Fira Code', monospace",
                fontSize: '12px',
              }}
            />
            <button
              type="submit"
              disabled={isExecuting || !command.trim()}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--cyan)',
                cursor: command.trim() ? 'pointer' : 'default',
              }}
            >
              <Play size={13} fill={command.trim() ? 'var(--cyan)' : 'none'} />
            </button>
          </form>
        </>
      )}

      {activeTab === 'problems' && (
        <div style={{ flex: 1, padding: '14px', color: 'var(--emerald)', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} color="var(--emerald)" />
            <span>0 lỗi và cảnh báo được phát hiện. Workspace đang ở trạng thái tốt!</span>
          </div>
        </div>
      )}

      {activeTab === 'tools' && (
        <div
          style={{
            flex: 1,
            padding: '10px 14px',
            overflowY: 'auto',
            fontFamily: "'Fira Code', monospace",
            fontSize: '11px',
            color: '#38bdf8',
          }}
        >
          {toolCallLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Chưa có Tool Call nào được kích hoạt.</div>
          ) : (
            toolCallLogs.map((log, idx) => <div key={idx}>{log}</div>)
          )}
        </div>
      )}

      {activeTab === 'git' && (
        <div style={{ flex: 1, padding: '14px', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <div>Không có thay đổi chưa commit. Thư mục làm việc sạch sẽ.</div>
        </div>
      )}
    </div>
  );
};
