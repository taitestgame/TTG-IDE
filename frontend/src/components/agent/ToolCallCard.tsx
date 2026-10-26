import React, { useState } from 'react';
import {
  Terminal,
  FileCode,
  Search,
  Globe,
  Bot,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Code2,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { ToolCall } from '../../types';
import { WailsService } from '../../services/wailsBridge';

interface ToolCallCardProps {
  toolCall: ToolCall;
  isExecuting?: boolean;
  onAccept?: (filePath: string) => void;
  onRollback?: () => void;
  onOpenFile?: (path: string, lineOrRange?: any) => void;
  onDismiss?: () => void;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolCall,
  isExecuting = false,
  onAccept,
  onRollback,
  onOpenFile,
  onDismiss,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [killed, setKilled] = useState(false);

  if (dismissed) {
    return null;
  }

  const handleCopy = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. CODE CARD: Dành riêng cho write_file, edit_file, replace_file_content, etc.
  const isCodeTool = [
    'write_file',
    'edit_file',
    'modify_file',
    'create_file',
    'replace_file_content',
    'multi_replace_file_content',
    'write_to_file',
    'replace_in_file',
    'FileEdit',
    'FileWrite',
  ].includes(toolCall.name);

  if (isCodeTool) {
    const filePath =
      (toolCall.arguments?.path as string) ||
      (toolCall.arguments?.TargetFile as string) ||
      (toolCall.arguments?.targetFile as string) ||
      (toolCall.arguments?.filePath as string) ||
      (toolCall.arguments?.AbsolutePath as string) ||
      'source_file';
    const codeContent =
      (toolCall.arguments?.content as string) ||
      (toolCall.arguments?.CodeContent as string) ||
      (toolCall.arguments?.replacement as string) ||
      (toolCall.arguments?.ReplacementContent as string) ||
      toolCall.result ||
      '';
    const isEdit = toolCall.name !== 'write_file' && toolCall.name !== 'create_file' && toolCall.name !== 'write_to_file';
    const fileName = filePath.split(/[/\\]/).pop() || filePath;

    return (
      <div
        style={{
          margin: '8px 0',
          borderRadius: '8px',
          background: '#141418',
          border: isExecuting ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid #27272a',
          overflow: 'hidden',
          boxShadow: isExecuting ? '0 0 14px rgba(56, 189, 248, 0.15)' : 'none',
        }}
      >
        {/* Header bar */}
        <div
          onClick={() => {
            setExpanded(!expanded);
            if (filePath && onOpenFile) {
              const sLine = Number(toolCall.arguments?.StartLine || toolCall.arguments?.startLine) || 1;
              const eLine = Number(toolCall.arguments?.EndLine || toolCall.arguments?.endLine) || 0;
              const lineCount = codeContent ? String(codeContent).split('\n').length : 10;
              onOpenFile(filePath, { startLine: sLine, endLine: eLine || (sLine + lineCount - 1), id: toolCall.id });
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: '#18181d',
            borderBottom: expanded ? '1px solid #27272a' : 'none',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCode size={14} color="#38bdf8" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5' }}>
              {fileName}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: isEdit ? '#38bdf8' : '#22c55e',
                background: isEdit ? 'rgba(56, 189, 248, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                padding: '1px 6px',
                borderRadius: '4px',
                fontWeight: 500,
              }}
            >
              {isEdit ? 'Chỉnh sửa file' : 'Ghi / Tạo mới file'}
            </span>
            <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
              ({filePath})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Sao chép mã */}
            {codeContent && (
              <button
                type="button"
                onClick={(e) => handleCopy(codeContent, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#222228',
                  border: '1px solid #32323a',
                  color: copied ? '#22c55e' : '#a1a1aa',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
                className="hover:text-white"
                title="Sao chép nội dung mã nguồn"
              >
                {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
              </button>
            )}

            {isExecuting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#38bdf8' }}>
                <Loader2 size={12} className="animate-spin" />
                Đang ghi...
              </span>
            ) : toolCall.isError ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#ef4444' }}>
                <AlertTriangle size={12} />
                Lỗi
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#22c55e' }}>
                <CheckCircle2 size={12} />
                Đã lưu
              </span>
            )}

            {expanded ? <ChevronDown size={13} color="#71717a" /> : <ChevronRight size={13} color="#71717a" />}
          </div>
        </div>

        {/* Code View Body */}
        {expanded && (
          <>
            <div
              style={{
                background: '#0d0d10',
                padding: '10px 12px',
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                fontSize: '11px',
                color: '#d4d4d8',
                lineHeight: '1.5',
                maxHeight: '220px',
                overflowY: 'auto',
                whiteSpace: 'pre',
              }}
            >
              {codeContent || '// File được tạo mới rỗng hoặc chưa có nội dung preview'}
            </div>

            {/* Accept / Rollback Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: '#16161b',
                borderTop: '1px solid #27272a',
              }}
            >
              <div style={{ fontSize: '11px' }}>
                {accepted ? (
                  <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                    <Check size={12} /> Đã xác nhận chấp nhận thay đổi
                  </span>
                ) : rolledBack ? (
                  <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                    <RotateCcw size={12} /> Đã hoàn tác (Rollback) về phiên bản trước
                  </span>
                ) : (
                  <span style={{ color: '#a1a1aa' }}>Xem lại thay đổi mã nguồn trước khi áp dụng:</span>
                )}
              </div>

              {!accepted && !rolledBack && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRolledBack(true);
                      onRollback?.();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      borderRadius: '4px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    className="hover:bg-red-500/25"
                    title="Khôi phục trạng thái tệp trước khi sửa (Rollback)"
                  >
                    <RotateCcw size={11} />
                    <span>Quay lại</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // 2. CMD / TERMINAL CARD: Dành riêng cho run_command, execute_command, Bash hoặc command execution
  if (toolCall.name === 'run_command' || toolCall.name === 'execute_command' || toolCall.name === 'Bash' || Boolean(toolCall.arguments?.CommandLine) || Boolean(toolCall.arguments?.command)) {
    const cmdStr =
      (toolCall.arguments?.CommandLine as string) ||
      (toolCall.arguments?.command as string) ||
      (toolCall.arguments?.cmd as string) ||
      '';
    const output = toolCall.result || '';
    const taskIdMatch = output.match(/TaskId:\s*["']?([^"'\s]+)["']?/);
    const taskId = taskIdMatch ? taskIdMatch[1] : null;
    const isExplicitlyKilled = Boolean(killed || (taskId && localStorage.getItem(`killed_task_${taskId}`) === 'true'));
    const isBackground = !isExplicitlyKilled && (output.includes('[TIEN TRINH CHAY NGAM]') || output.includes('TaskId:'));
    const hasError = Boolean(toolCall.isError) || output.includes('ParserError') || output.includes("The token '&&'") || output.includes('SyntaxError');

    const handleCloseOrKill = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        if (taskId) {
          localStorage.setItem(`killed_task_${taskId}`, 'true');
          window.dispatchEvent(new CustomEvent('ttgide:task_killed', { detail: { taskId } }));
          await WailsService.killTask(taskId);
        } else if (isBackground || isExecuting) {
          window.dispatchEvent(new CustomEvent('ttgide:kill_all_tasks'));
          await WailsService.killAllBackgroundTasks();
        }
        setKilled(true);
      } catch (err) {
        console.error('Lỗi khi tắt tiến trình:', err);
      }
      setDismissed(true);
      onDismiss?.();
    };

    return (
      <div
        style={{
          margin: '8px 0',
          borderRadius: '8px',
          background: '#0d0d11',
          border: isExplicitlyKilled
            ? '1px solid rgba(239, 68, 68, 0.45)'
            : hasError
              ? '1px solid rgba(239, 68, 68, 0.4)'
              : isBackground
                ? '1px solid rgba(245, 158, 11, 0.35)'
                : isExecuting
                  ? '1px solid rgba(56, 189, 248, 0.45)'
                  : '1px solid #27272a',
          overflow: 'hidden',
          boxShadow: isExecuting ? '0 0 14px rgba(56, 189, 248, 0.15)' : 'none',
        }}
      >
        {/* Terminal Header */}
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 12px',
            background: '#15151a',
            borderBottom: expanded ? '1px solid #222227' : 'none',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <Terminal size={14} color={isExplicitlyKilled ? '#f87171' : hasError ? '#f87171' : isBackground ? '#fbbf24' : '#38bdf8'} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#f4f4f5' }}>
              PowerShell / CMD
            </span>
            <code
              style={{
                fontSize: '11px',
                color: isExplicitlyKilled ? '#f87171' : hasError ? '#fca5a5' : '#e4e4e7',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 7px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '420px',
              }}
            >
              {cmdStr}
            </code>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {output && (
              <button
                type="button"
                onClick={(e) => handleCopy(`${cmdStr}\n\n${output}`, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#222228',
                  border: '1px solid #32323a',
                  color: copied ? '#22c55e' : '#a1a1aa',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
                className="hover:text-white"
                title="Sao chép câu lệnh và output"
              >
                {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
              </button>
            )}

            {isExplicitlyKilled ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#f87171', fontWeight: 600 }}>
                <Square size={10} fill="#f87171" />
                Đã tắt (Stopped)
              </span>
            ) : isExecuting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#38bdf8' }}>
                <Loader2 size={12} className="animate-spin" />
                Đang chạy...
              </span>
            ) : hasError ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#ef4444' }}>
                <AlertTriangle size={12} />
                Lỗi cú pháp / Lệnh
              </span>
            ) : isBackground ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#fbbf24' }}>
                <span>⏳ Chạy ngầm (Background)</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#22c55e' }}>
                <CheckCircle2 size={12} />
                Hoàn thành (Exit 0)
              </span>
            )}

            {expanded ? <ChevronDown size={13} color="#71717a" /> : <ChevronRight size={13} color="#71717a" />}

            {/* Nút X để tắt tiến trình & đóng/ẩn khung lệnh hoặc lỗi này */}
            <button
              type="button"
              onClick={handleCloseOrKill}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#a1a1aa',
                borderRadius: '4px',
                padding: '3px 6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
              title="Tắt tiến trình & Đóng khung lệnh này (X)"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Terminal Console Output */}
        {expanded && (
          <div
            style={{
              background: '#070709',
              padding: '10px 14px',
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontSize: '11px',
              color: killed ? '#fca5a5' : hasError ? '#fca5a5' : isBackground ? '#fde68a' : '#86efac',
              maxHeight: '220px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.5',
            }}
          >
            <div style={{ color: '#71717a', marginBottom: '6px' }}>
              PS &gt; {cmdStr}
            </div>
            {output || '(Không có dữ liệu stdout/stderr xuất ra)'}
            {killed && (
              <div style={{ color: '#f87171', marginTop: '6px', fontWeight: 600 }}>
                [TIẾN TRÌNH ĐÃ ĐƯỢC TẮT / DỪNG THÀNH CÔNG THEO YÊU CẦU NGƯỜI DÙNG]
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 3. THẺ CÔNG CỤ CHUẨN (read_file, list_files, grep_search, git_*, etc.)
  const getToolIcon = (name: string) => {
    if (name.includes('read') || name.includes('write') || name.includes('file') || name.includes('dir')) {
      return <FileCode size={13} color="#38bdf8" />;
    }
    if (name.includes('command') || name.includes('task') || name.includes('terminal')) {
      return <Terminal size={13} color="#a855f7" />;
    }
    if (name.includes('search') || name.includes('grep') || name.includes('symbol')) {
      return <Search size={13} color="#eab308" />;
    }
    if (name.includes('web') || name.includes('fetch') || name.includes('browser')) {
      return <Globe size={13} color="#10b981" />;
    }
    if (name.includes('git')) {
      return <GitBranch size={13} color="#f97316" />;
    }
    return <Bot size={13} color="#ec4899" />;
  };

  const actionText = toolCall.toolAction || `Gọi công cụ ${toolCall.name}`;
  const paramSummary = toolCall.arguments?.path
    ? String(toolCall.arguments.path)
    : toolCall.arguments?.query
      ? String(toolCall.arguments.query)
      : '';

  return (
    <div
      style={{
        margin: '6px 0',
        borderRadius: '6px',
        background: '#151518',
        border: isExecuting ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #222226',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          cursor: 'pointer',
          background: 'rgba(255, 255, 255, 0.02)',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          {getToolIcon(toolCall.name)}
          <span style={{ fontWeight: 500, color: '#f4f4f5' }}>{toolCall.name}</span>
          {paramSummary && (
            <span style={{ color: '#38bdf8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ({paramSummary})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isExecuting ? (
            <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>
              <Loader2 size={11} className="animate-spin" /> Đang chạy...
            </span>
          ) : toolCall.isError ? (
            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>
              <AlertTriangle size={11} /> Thất bại
            </span>
          ) : (
            <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}>
              <CheckCircle2 size={11} /> Đã xong
            </span>
          )}
          {expanded ? <ChevronDown size={12} color="#71717a" /> : <ChevronRight size={12} color="#71717a" />}

          {/* Nút X để đóng/ẩn thẻ này */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: '#71717a',
              padding: '2px',
              cursor: 'pointer',
              borderRadius: '3px',
              marginLeft: '2px',
            }}
            className="hover:text-red-400"
            title="Đóng / ẩn thẻ này (X)"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {expanded && toolCall.result && (
        <div
          style={{
            padding: '8px 10px',
            background: '#0e0e11',
            borderTop: '1px solid #1f1f23',
            fontSize: '10px',
            fontFamily: "'Cascadia Code', monospace",
            color: '#a1a1aa',
            maxHeight: '120px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {toolCall.result}
        </div>
      )}
    </div>
  );
};
