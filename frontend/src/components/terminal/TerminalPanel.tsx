import React, { useState } from 'react';
import { Terminal as TerminalIcon, AlertCircle, GitBranch, Play, Trash2 } from 'lucide-react';
import { WailsService } from '../../services/wailsBridge';

export const TerminalPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'problems' | 'git' | 'output'>('terminal');
  const [command, setCommand] = useState('');
  const [logs, setLogs] = useState<string[]>([
    'TaiForge Terminal đã sẵn sàng (PowerShell/Bash)',
    'Nhập câu lệnh bên dưới hoặc để AI Agent tự động thực thi...'
  ]);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!command.trim() || isExecuting) return;

    const cmd = command;
    setCommand('');
    setLogs((prev) => [...prev, `$ ${cmd}`]);
    setIsExecuting(true);

    try {
      const output = await WailsService.saveFile ? await (window as any).go?.main?.App?.RunTerminalCommand(cmd) : 'Lệnh đã hoàn thành.';
      setLogs((prev) => [...prev, output || '(Không có kết quả trả về)']);
    } catch (err: any) {
      setLogs((prev) => [...prev, `[LỖI]: ${err.message || err}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div style={{
      height: '240px',
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Tiêu đề các Tab */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('terminal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'terminal' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'terminal' ? '#38bdf8' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <TerminalIcon size={13} />
            Terminal (Dòng lệnh)
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'problems' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'problems' ? '#38bdf8' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <AlertCircle size={13} />
            Vấn đề & Cảnh báo (0)
          </button>

          <button
            onClick={() => setActiveTab('git')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'git' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'git' ? '#38bdf8' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <GitBranch size={13} />
            Thay đổi Git
          </button>
        </div>

        <button
          onClick={() => setLogs([])}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          title="Xóa màn hình console"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Khung hiển thị log Terminal */}
      <div style={{
        flex: 1,
        padding: '10px 14px',
        overflowY: 'auto',
        fontFamily: "'Fira Code', monospace",
        fontSize: '12px',
        lineHeight: '1.5',
        color: '#cbd5e1'
      }}>
        {logs.map((log, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', color: log.startsWith('$') ? '#38bdf8' : log.startsWith('[LỖI]') ? '#f43f5e' : '#e2e8f0' }}>
            {log}
          </div>
        ))}
      </div>

      {/* Thanh nhập lệnh */}
      <form onSubmit={handleRun} style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        borderTop: '1px solid var(--border-color)',
        background: 'rgba(0, 0, 0, 0.3)'
      }}>
        <span style={{ color: '#06b6d4', marginRight: '8px', fontSize: '13px', fontFamily: 'monospace' }}>&gt;</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Nhập lệnh terminal (ví dụ: go test ./..., npm run dev)..."
          disabled={isExecuting}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontFamily: "'Fira Code', monospace",
            fontSize: '12px'
          }}
        />
        <button
          type="submit"
          disabled={isExecuting || !command.trim()}
          style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer' }}
        >
          <Play size={14} fill="#38bdf8" />
        </button>
      </form>
    </div>
  );
};
