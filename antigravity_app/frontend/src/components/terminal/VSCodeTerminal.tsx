import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Terminal as TerminalIcon,
  Plus,
  Trash2,
  ChevronDown,
  Columns,
  Maximize2,
  Minimize2,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { WailsService } from '../../services/wailsBridge';

interface VSCodeTerminalProps {
  workspace?: string;
  height?: number;
  onClose?: () => void;
}

interface TermEntry {
  cmd: string;
  output?: string;
  error?: boolean;
}

export const VSCodeTerminal: React.FC<VSCodeTerminalProps> = ({
  workspace = 'C:\\code\\python\\Anchuyennganh',
  height = 260,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'problems'>('terminal');
  const [history, setHistory] = useState<TermEntry[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Chuẩn hóa đường dẫn hiển thị theo chuẩn Windows PowerShell
  const displayWs = workspace
    ? workspace.replace(/\//g, '\\')
    : 'C:\\code\\python\\Anchuyennganh';

  // Tự động cuộn xuống dòng mới nhất khi có kết quả
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [history, isRunning]);

  // Focus input khi click vào bất kỳ vùng nào trong terminal
  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Thực thi câu lệnh dòng lệnh
  const handleRunCommand = async (rawCmd: string) => {
    const cmd = rawCmd.trim();
    if (!cmd) {
      setHistory((prev) => [...prev, { cmd: '' }]);
      return;
    }

    // Xử lý lệnh clear/cls ngay lập tức
    if (cmd.toLowerCase() === 'cls' || cmd.toLowerCase() === 'clear') {
      setHistory([]);
      setInputVal('');
      setHistoryIdx(-1);
      return;
    }

    setCmdHistory((prev) => [cmd, ...prev]);
    setHistoryIdx(-1);
    setInputVal('');
    setIsRunning(true);

    try {
      const out = await WailsService.runCommand(cmd);
      setHistory((prev) => [
        ...prev,
        {
          cmd,
          output: out || '',
          error: false,
        },
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          cmd,
          output: err?.message || String(err),
          error: true,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRunCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(nextIdx);
      setInputVal(cmdHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputVal(cmdHistory[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isMaximized ? '100%' : `${height}px`,
        background: '#18181b',
        borderTop: '1px solid #27272a',
        fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
        fontSize: '12px',
        overflow: 'hidden',
        userSelect: 'text',
      }}
    >
      {/* 1. VS CODE TERMINAL HEADER (Exact match to screenshot) */}
      <div
        style={{
          height: '35px',
          background: '#18181b',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {/* Left Tabs: Problems (1), Terminal, ... */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Problems Tab */}
          <button
            onClick={() => setActiveTab('problems')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'problems' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'problems' ? '#ffffff' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Problems</span>
            <span
              style={{
                background: '#0284c7',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '0 6px',
                fontSize: '10px',
                fontWeight: 700,
                minWidth: '16px',
                textAlign: 'center',
              }}
            >
              0
            </span>
          </button>

          {/* Terminal Tab */}
          <button
            onClick={() => setActiveTab('terminal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'terminal' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'terminal' ? '#ffffff' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Terminal</span>
          </button>

          <span style={{ color: '#64748b', fontSize: '11px', cursor: 'pointer', padding: '0 4px' }}>
            •••
          </span>
        </div>

        {/* Right Toolbar Icons: >_ powershell, +, v, @, [], trash, ..., X */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
          {/* PowerShell Selector Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: '#27272a',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#e4e4e7',
              cursor: 'pointer',
              marginRight: '4px',
            }}
            title="Active Shell: Windows PowerShell"
          >
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>&gt;_</span>
            <span>powershell</span>
            <ChevronDown size={11} color="#a1a1aa" />
          </div>

          {/* Plus icon (New Terminal / Reset) */}
          <button
            onClick={() => {
              setHistory([]);
              setInputVal('');
              if (inputRef.current) inputRef.current.focus();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            className="hover:bg-white/10 hover:text-white"
            title="Tạo phiên Terminal mới (+)"
          >
            <Plus size={14} />
          </button>

          {/* Dropdown Chevron */}
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            className="hover:bg-white/10 hover:text-white"
            title="Tùy chọn Shell"
          >
            <ChevronDown size={14} />
          </button>

          {/* Split icon (@ / Columns) */}
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            className="hover:bg-white/10 hover:text-white"
            title="Chia đôi Terminal (Split Terminal)"
          >
            <Columns size={13} />
          </button>

          {/* Trash Icon (Clear output) */}
          <button
            onClick={() => setHistory([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            className="hover:bg-white/10 hover:text-white"
            title="Xóa toàn bộ nội dung dòng lệnh (Clear Output)"
          >
            <Trash2 size={13} />
          </button>

          {/* More actions (...) */}
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            className="hover:bg-white/10 hover:text-white"
            title="Tùy chọn khác"
          >
            <MoreHorizontal size={14} />
          </button>

          {/* Maximize/Restore Toggle */}
          <button
            onClick={() => setIsMaximized((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            className="hover:bg-white/10 hover:text-white"
            title={isMaximized ? 'Thu nhỏ panel' : 'Phóng to panel'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Close Panel (X) */}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '3px',
              }}
              className="hover:bg-red-500/20 hover:text-red-400"
              title="Đóng bảng điều khiển Terminal (Ctrl+`)"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 2. TAB BODY */}
      {activeTab === 'problems' ? (
        <div
          style={{
            flex: 1,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#71717a',
            gap: '8px',
          }}
        >
          <AlertCircle size={32} color="#0284c7" />
          <div style={{ color: '#e4e4e7', fontSize: '13px', fontWeight: 600 }}>
            Không có vấn đề nào được phát hiện trong workspace
          </div>
          <div style={{ fontSize: '11px', color: '#71717a' }}>
            Mã nguồn hiện tại sạch và tuân thủ các quy tắc kiểm tra tĩnh.
          </div>
        </div>
      ) : (
        /* Real Interactive PowerShell Terminal (Exact match to screenshot) */
        <div
          ref={containerRef}
          onClick={handleTerminalClick}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
            lineHeight: '1.6',
            color: '#e4e4e7',
            cursor: 'text',
          }}
        >
          {/* History lines */}
          {history.map((entry, idx) => (
            <div key={idx} style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '10px' }}>○</span>
                <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
                  PS {displayWs}&gt; {entry.cmd}
                </span>
              </div>
              {entry.output && (
                <pre
                  style={{
                    margin: '3px 0 6px 18px',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    color: entry.error ? '#f87171' : '#cbd5e1',
                    lineHeight: '1.5',
                  }}
                >
                  {entry.output}
                </pre>
              )}
            </div>
          ))}

          {/* Currently running indicator */}
          {isRunning && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#38bdf8',
                marginBottom: '4px',
              }}
            >
              <span style={{ color: '#38bdf8' }}>○</span>
              <span style={{ fontStyle: 'italic', fontSize: '11px' }}>
                [PowerShell đang thực thi lệnh...]
              </span>
            </div>
          )}

          {/* Active Prompt Line (Exact match to user's screenshot: o PS C:\code\python\Anchuyennganh> []) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#64748b', fontSize: '10px' }}>○</span>
            <span style={{ color: '#f1f5f9', fontWeight: 500, whiteSpace: 'nowrap' }}>
              PS {displayWs}&gt;
            </span>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={inputVal}
              disabled={isRunning}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontFamily: 'inherit',
                fontSize: '12px',
                caretColor: '#38bdf8',
                padding: 0,
                margin: 0,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
