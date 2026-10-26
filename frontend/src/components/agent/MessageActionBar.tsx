import React, { useState, useEffect } from 'react';
import {
  FileText,
  Terminal,
  FileCode,
  Image as ImageIcon,
  Chrome,
  Globe,
  FileDiff,
  ArrowLeft,
  ChevronDown,
  Check,
  X,
  Loader2,
  Square,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { Plan, PlanStep, ToolCall } from '../../types';
import { PermissionSelector, PermissionMode } from '../common/PermissionSelector';
import { ToolCallCard } from './ToolCallCard';
import { PlanCard } from './PlanCard';
import { StandardFileIcon } from '../common/StandardFileIcon';
import { WailsService } from '../../services/wailsBridge';

export function extractPlanFromText(text?: string): { steps: PlanStep[]; summaryText?: string } {
  if (!text) return { steps: [] };
  const lines = text.split('\n');
  const steps: PlanStep[] = [];
  let stepIdx = 1;
  const rePrefix = /^(?:(?:Đợt|Phase|Bước|Giai đoạn|Step)\s*\d+[\s:–—\.\-]*|\d+[\.\)]\s*)/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern 1: Checkbox markdown: - [ ] hoặc - [x]
    const checkMatch = line.match(/^[-*•]\s*\[([ xX])\]\s*(.+)/);
    if (checkMatch) {
      steps.push({
        id: stepIdx++,
        description: checkMatch[2].replace(rePrefix, '').trim(),
        status: checkMatch[1].toLowerCase() === 'x' ? 'success' : 'idle',
      });
      continue;
    }

    // Pattern 2: Đợt / Phase / Bước: e.g. "Đợt 1 (aiosqlite): ...", "- Đợt 1...", "- Ưu tiên cao nhất: Đợt 1..."
    const phaseMatch = line.match(/^(?:#{1,4}\s*)?(?:[-*•]\s*)?(?:(?:Ưu tiên[^:]*:\s*)?(?:Đợt|Phase|Bước|Giai đoạn|Step)\s*(\d+(?:[/-]\d+)?)[^:–—\n]*[:–—-]\s*)(.+)/i);
    if (phaseMatch) {
      steps.push({
        id: stepIdx++,
        description: phaseMatch[2].replace(rePrefix, '').trim(),
        status: 'idle',
      });
      continue;
    }

    // Pattern 3: Dòng bắt đầu bằng "Đợt X" hoặc "Bước X" hoặc "Phase X"
    const phaseShortMatch = line.match(/^(?:#{1,4}\s*)?(?:[-*•]\s*)?(Đợt\s*\d+|Bước\s*\d+|Phase\s*\d+|Giai đoạn\s*\d+)(.+)/i);
    if (phaseShortMatch && !line.includes('?') && !line.includes('bạn muốn')) {
      steps.push({
        id: stepIdx++,
        description: line.replace(/^(?:#{1,4}\s*)?(?:[-*•]\s*)?/, '').replace(rePrefix, '').trim(),
        status: 'idle',
      });
      continue;
    }

    // Pattern 4: Numbered list: "1. Tích hợp aiosqlite", "2. Viết module..."
    const numMatch = line.match(/^(\d+)[\.\)]\s+([A-ZÀ-Ỹa-zà-ỹ0-9_].+)/);
    if (numMatch && (text.includes('kế hoạch') || text.includes('plan') || text.includes('Đợt') || text.includes('Bước') || text.includes('nâng cấp') || text.includes('triển khai'))) {
      steps.push({
        id: stepIdx++,
        description: numMatch[2].replace(rePrefix, '').trim(),
        status: 'idle',
      });
      continue;
    }
  }

  return { steps };
}

export type MessageViewMode = 'all' | 'none' | 'plan' | 'cmd' | 'code' | 'web';

export interface MessageActionBarProps {
  plan?: Plan | null;
  toolCalls?: ToolCall[];
  messageContent?: string;
  hasPlan?: boolean;
  hasCmd?: boolean;
  hasCode?: boolean;
  hasWeb?: boolean;
  activeView: MessageViewMode;
  onToggleView: (view: MessageViewMode) => void;
  modifiedFiles?: string[];
  showReviewCard?: boolean;
  onToggleReviewCard?: () => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onCloseReview?: () => void;
  permissionMode?: PermissionMode;
  onSelectPermissionMode?: (mode: PermissionMode) => void;
  onSelectFile?: (file: string) => void;
  isExecuting?: boolean;
  liveStatus?: string | null;
  onExecutePlan?: () => void;
  onClearPlan?: () => void;
}

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  plan,
  toolCalls = [],
  messageContent,
  hasPlan: propHasPlan,
  hasCmd: propHasCmd,
  hasCode: propHasCode,
  hasWeb: propHasWeb,
  activeView,
  onToggleView,
  modifiedFiles = [],
  showReviewCard = false,
  onToggleReviewCard,
  onAcceptAll,
  onRejectAll,
  onCloseReview,
  permissionMode,
  onSelectPermissionMode,
  onSelectFile,
  isExecuting = false,
  liveStatus = null,
  onExecutePlan,
  onClearPlan,
}) => {
  const [isAccepted, setIsAccepted] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [hideErrors, setHideErrors] = useState<boolean>(() => localStorage.getItem('ttgide_hide_cmd_errors') === 'true');
  const [dismissedCmdIds, setDismissedCmdIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ttgide_dismissed_cmds') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleClearCmdsEvent = () => {
      const allIds = toolCalls.filter(isCmdTool).map((t, idx) => t.id || `${t.name}_${idx}_${t.arguments?.CommandLine || t.arguments?.command || ''}`);
      setDismissedCmdIds(allIds);
      localStorage.setItem('ttgide_dismissed_cmds', JSON.stringify(allIds));
    };
    window.addEventListener('ttgide:clear_cmds', handleClearCmdsEvent);
    return () => window.removeEventListener('ttgide:clear_cmds', handleClearCmdsEvent);
  }, [toolCalls]);

  useEffect(() => {
    // Tự động quét và phát hiện các task đã bị kill trong toàn bộ lịch sử tool calls
    toolCalls.forEach((tc) => {
      const res = tc.result || '';
      if (tc.name === 'manage_task' || res.includes('Da dung tien trinh') || res.includes('da ket thuc')) {
        const m = res.match(/Task:\s*["']?([^"'\s]+)["']?/i) || (tc.arguments?.task_id as string);
        const tId = typeof m === 'string' ? m : (m && m[1] ? m[1] : null);
        if (tId) {
          localStorage.setItem(`killed_task_${tId}`, 'true');
          window.dispatchEvent(new CustomEvent('ttgide:task_killed', { detail: { taskId: tId } }));
        }
      }
    });
  }, [toolCalls]);

  const extracted = (!plan || !plan.steps || plan.steps.length === 0) && messageContent
    ? extractPlanFromText(messageContent)
    : { steps: [] };

  const effectivePlan: Plan | null = (plan && plan.steps && plan.steps.length > 0)
    ? plan
    : extracted.steps.length > 0
    ? {
        id: plan?.id || 'plan_auto_extracted',
        goal: plan?.goal || 'Kế hoạch nâng cấp hệ thống',
        steps: extracted.steps,
        currentStep: 0,
        createdAt: plan?.createdAt || new Date().toISOString(),
      }
    : plan || null;

  const calculatedHasPlan = !!(effectivePlan && effectivePlan.steps && effectivePlan.steps.length > 0) || Boolean(messageContent && (messageContent.includes('kế hoạch') || messageContent.includes('Đợt') || messageContent.includes('Bước')));

  const isCmdTool = (t: ToolCall) =>
    t.name === 'run_command' ||
    Boolean(t.arguments?.command) ||
    Boolean(t.arguments?.CommandLine) ||
    t.name.includes('command') ||
    t.name.includes('terminal');

  const isCodeTool = (t: ToolCall) =>
    [
      'write_file',
      'edit_file',
      'modify_file',
      'create_file',
      'replace_file_content',
      'multi_replace_file_content',
      'write_to_file',
      'generate_image',
    ].includes(t.name) ||
    (t.name.includes('file') && !['view_file', 'read_file', 'list_files', 'list_dir'].includes(t.name));

  const isWebTool = (t: ToolCall) =>
    ['search_web', 'browser', 'fetch_web_request', 'read_url_content', 'browser_subagent'].includes(t.name) ||
    t.name.includes('web') ||
    t.name.includes('browser') ||
    t.name.includes('search');

  const cmdTools = toolCalls.filter(isCmdTool);
  const codeTools = toolCalls.filter(isCodeTool);
  const webTools = toolCalls.filter(isWebTool);

  const unDismissedCmdTools = cmdTools.filter((t, idx) => {
    const key = t.id || `${t.name}_${idx}_${t.arguments?.CommandLine || t.arguments?.command || ''}`;
    return !dismissedCmdIds.includes(key);
  });

  const hasActiveRunningTasks = isExecuting || Boolean(liveStatus) || unDismissedCmdTools.some((t) => {
    const res = t.result || '';
    const m = res.match(/TaskId:\s*["']?([^"'\s]+)["']?/);
    const tId = m ? m[1] : null;
    const isKilled = tId ? localStorage.getItem(`killed_task_${tId}`) === 'true' : false;
    return (res.includes('[TIEN TRINH CHAY NGAM]') || res.includes('TaskId:')) && !isKilled;
  });

  const handleDismissCmd = (cmdKey: string) => {
    setDismissedCmdIds((prev) => {
      const next = [...prev, cmdKey];
      localStorage.setItem('ttgide_dismissed_cmds', JSON.stringify(next));
      if (unDismissedCmdTools.length <= 1) {
        onToggleView('none');
      }
      return next;
    });
  };

  const handleClearAllCmds = () => {
    const allIds = cmdTools.map((t, idx) => t.id || `${t.name}_${idx}_${t.arguments?.CommandLine || t.arguments?.command || ''}`);
    setDismissedCmdIds(allIds);
    localStorage.setItem('ttgide_dismissed_cmds', JSON.stringify(allIds));
    onToggleView('none');
  };

  const [dismissedCodeFiles, setDismissedCodeFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ttgide_dismissed_code_files') || '[]');
    } catch {
      return [];
    }
  });

  const allDetectedCodeFiles = Array.from(
    new Set([
      ...codeTools.map((t) => t.arguments?.path || t.arguments?.targetFile || t.arguments?.TargetFile || t.arguments?.filePath || '').filter(Boolean),
      ...modifiedFiles,
    ])
  );

  const unDismissedCodeFiles = allDetectedCodeFiles.filter((f) => !dismissedCodeFiles.includes(f));

  const handleClearAllCodeFiles = () => {
    setDismissedCodeFiles(allDetectedCodeFiles);
    localStorage.setItem('ttgide_dismissed_code_files', JSON.stringify(allDetectedCodeFiles));
    onToggleView('none');
  };

  const handleAcceptAll = () => {
    setIsAccepted(true);
    setIsRejected(false);
    onAcceptAll?.();
    handleClearAllCodeFiles();
  };

  const handleRejectAll = async () => {
    setIsRejected(true);
    setIsAccepted(false);
    try {
      await onRejectAll?.();
    } finally {
      handleClearAllCodeFiles();
    }
  };

  const hasErrorsInCmd = unDismissedCmdTools.some(
    (t) => Boolean(t.isError) || (t.result || '').includes('ParserError') || (t.result || '').includes("The token '&&'") || (t.result || '').includes('SyntaxError')
  );
  const filteredCmdTools = hideErrors
    ? unDismissedCmdTools.filter(
        (t) => !t.isError && !(t.result || '').includes('ParserError') && !(t.result || '').includes("The token '&&'") && !(t.result || '').includes('SyntaxError')
      )
    : unDismissedCmdTools;

  const hasPlan = propHasPlan !== undefined ? propHasPlan : calculatedHasPlan;
  const hasCmd = unDismissedCmdTools.length > 0 || (isExecuting && Boolean(liveStatus));
  const hasCode = unDismissedCodeFiles.length > 0 && !isAccepted && !isRejected;
  const hasWeb = propHasWeb !== undefined ? propHasWeb : webTools.length > 0;

  const handleToggle = (target: MessageViewMode) => {
    if (activeView === target) {
      onToggleView('none');
    } else {
      onToggleView(target);
    }
  };

  const iconBtnStyle = (isActive: boolean, hasData: boolean): React.CSSProperties => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '5px',
    background: isActive ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.04)',
    border: isActive ? '1px solid #0284c7' : '1px solid rgba(255, 255, 255, 0.08)',
    color: isActive ? '#38bdf8' : hasData ? '#cbd5e1' : '#71717a',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  });

  const blueDotStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '0px',
    right: '0px',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#0284c7',
    border: '1px solid #141416',
    boxShadow: '0 0 4px #38bdf8',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '4px', userSelect: 'none' }}>
      {/* 1. TOP TOOLBAR: 4 Action Icons (Plan, CMD, Code, Web) matching user screenshot */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2px',
        }}
      >
        {/* Left: Action Icons (Plan, CMD, Code, Web) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* 1. Plan Icon (Document) */}
          <button
            type="button"
            onClick={() => handleToggle('plan')}
            style={iconBtnStyle(activeView === 'plan', hasPlan)}
            className="hover:bg-white/10 hover:text-white"
            title="Kế hoạch thực thi (Plan)"
          >
            <FileText size={13} strokeWidth={1.8} />
            {hasPlan && <div style={blueDotStyle} />}
          </button>

          {/* 2. CMD / Terminal Icon */}
          <button
            type="button"
            onClick={() => handleToggle('cmd')}
            style={iconBtnStyle(activeView === 'cmd', hasCmd)}
            className="hover:bg-white/10 hover:text-white"
            title="Lệnh Terminal AI đã chạy (CMD)"
          >
            <Terminal size={13} strokeWidth={1.8} />
            {hasCmd && <div style={blueDotStyle} />}
          </button>

          {/* 3. Media / Code / Artifacts Icon */}
          <button
            type="button"
            onClick={() => handleToggle('code')}
            style={iconBtnStyle(activeView === 'code', hasCode)}
            className="hover:bg-white/10 hover:text-white"
            title="Tệp tin, Code và Hình ảnh đã tạo"
          >
            <ImageIcon size={13} strokeWidth={1.8} />
            {hasCode && <div style={blueDotStyle} />}
          </button>

          {/* 4. Browser / Web Icon */}
          <button
            type="button"
            onClick={() => handleToggle('web')}
            style={iconBtnStyle(activeView === 'web', hasWeb)}
            className="hover:bg-white/10 hover:text-white"
            title="Thao tác Web / Trình duyệt"
          >
            <Chrome size={13} strokeWidth={1.8} />
            {hasWeb && <div style={blueDotStyle} />}
          </button>
        </div>
      </div>

      {/* 3. ACTIVE VIEW DRAWER: Hiển thị chi tiết khi bấm vào bất kỳ icon nào (Plan, CMD, Code, Web) */}
      {activeView !== 'all' && activeView !== 'none' && (
        <div
          style={{
            marginTop: '6px',
            background: '#131316',
            border: '1px solid #27272a',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            maxHeight: '320px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Header thanh chi tiết */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #222226',
              paddingBottom: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {activeView === 'plan' && <FileText size={14} color="#cbd5e1" />}
              {activeView === 'cmd' && <Terminal size={14} color="#cbd5e1" />}
              {activeView === 'code' && <FileCode size={14} color="#cbd5e1" />}
              {activeView === 'web' && <Globe size={14} color="#cbd5e1" />}
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5' }}>
                {activeView === 'plan' && `Kế hoạch (${(effectivePlan?.steps || []).length} bước)`}
                {activeView === 'cmd' && `PowerShell / CMD (${filteredCmdTools.length})`}
                {activeView === 'code' && `Thay đổi mã nguồn (${unDismissedCodeFiles.length})`}
                {activeView === 'web' && `Tìm kiếm & Duyệt web (${webTools.length})`}
              </span>

              {/* Nút hành động riêng cho CMD: Ẩn/Hiện lệnh lỗi */}
              {activeView === 'cmd' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {hasErrorsInCmd && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !hideErrors;
                        setHideErrors(next);
                        localStorage.setItem('ttgide_hide_cmd_errors', String(next));
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: hideErrors ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255, 255, 255, 0.05)',
                        border: hideErrors ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                        color: hideErrors ? '#f87171' : '#a1a1aa',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      className="hover:text-white"
                      title="Bật/Tắt ẩn các câu lệnh chạy bị lỗi trong bảng này"
                    >
                      <AlertTriangle size={11} color={hideErrors ? '#f87171' : '#a1a1aa'} />
                      <span>{hideErrors ? 'Đang ẩn lệnh lỗi' : 'Ẩn lệnh lỗi'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Nút Tắt / Đóng Drawer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {activeView === 'cmd' && hasActiveRunningTasks && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await WailsService.killAllBackgroundTasks();
                      window.dispatchEvent(new CustomEvent('ttgide:kill_all_tasks'));
                    } catch (e) {
                      console.warn(e);
                    } finally {
                      onToggleView('none');
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(239, 68, 68, 0.16)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    cursor: 'pointer',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                  className="hover:bg-red-500/25"
                  title="Dừng các tiến trình đang chạy ngầm, dọn thẻ và đóng giao diện"
                >
                  <Square size={10} fill="#f87171" />
                  <span>Dừng tiến trình</span>
                </button>
              )}

              {activeView === 'cmd' && unDismissedCmdTools.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllCmds}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 400,
                    transition: 'all 0.15s ease',
                  }}
                  className="hover:text-white hover:bg-white/5"
                  title="Xoá toàn bộ các thẻ lệnh terminal và tắt chấm xanh"
                >
                  <Trash2 size={11} />
                  <span>Xoá tất cả</span>
                </button>
              )}

              {activeView === 'code' && unDismissedCodeFiles.length > 0 && !isAccepted && !isRejected && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
                  <button
                    type="button"
                    onClick={handleRejectAll}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'transparent',
                      border: 'none',
                      color: '#a1a1aa',
                      cursor: 'pointer',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                    }}
                    className="hover:text-red-400 hover:bg-white/5"
                    title="Quay lại trạng thái file trước đó và xoá hiển thị này"
                  >
                    <span>Reject all</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: '#27272a',
                      border: '1px solid #3f3f46',
                      color: '#f4f4f5',
                      cursor: 'pointer',
                      padding: '2px 10px',
                      borderRadius: '4px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      transition: 'all 0.15s ease',
                    }}
                    className="hover:bg-zinc-700 hover:text-white"
                    title="Đồng ý lưu tất cả file và xoá hiển thị này"
                  >
                    <span>Accept all</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleView('none');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#1f1f23',
                  border: '1px solid #2e2e34',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                className="hover:text-white hover:bg-zinc-800"
                title="Đóng bảng chi tiết này"
              >
                <X size={12} />
                <span>Đóng</span>
              </button>
            </div>
          </div>

          {/* Chi tiết từng View */}
          {/* A. PLAN */}
          {activeView === 'plan' && (
            effectivePlan && effectivePlan.steps && effectivePlan.steps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <PlanCard
                  plan={effectivePlan}
                  isExecuting={isExecuting}
                  onExecutePlan={onExecutePlan}
                  onClearPlan={onClearPlan}
                />
                {messageContent && (
                  <div
                    style={{
                      background: '#101014',
                      border: '1px solid #222227',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: '#d4d4d8',
                      lineHeight: '1.6',
                      maxHeight: '320px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                      📋 Chi tiết kế hoạch & Khuyến nghị từ AI:
                    </div>
                    {messageContent}
                  </div>
                )}
              </div>
            ) : messageContent ? (
              <div
                style={{
                  background: '#101014',
                  border: '1px solid #222227',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: '#d4d4d8',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                  📋 Kế hoạch đề xuất:
                </div>
                {messageContent}
              </div>
            ) : isExecuting ? (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                <Loader2 size={22} className="animate-spin" color="#38bdf8" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontWeight: 500, color: '#f4f4f5' }}>Đang nghiên cứu dự án & xây dựng kế hoạch...</div>
                <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px' }}>AI đang khám phá cấu trúc codebase để phân chia các bước kế hoạch chi tiết.</div>
              </div>
            ) : (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                <FileText size={24} color="#38bdf8" style={{ margin: '0 auto 6px auto', opacity: 0.6 }} />
                <div>Chưa có kế hoạch (Plan) nào được tạo cho tác vụ này.</div>
              </div>
            )
          )}

          {/* B. CMD / TERMINAL */}
          {activeView === 'cmd' && (
            <div>
              {isExecuting && liveStatus && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    marginBottom: '8px',
                    fontSize: '11.5px',
                    color: '#38bdf8',
                  }}
                >
                  <Loader2 size={13} className="animate-spin" />
                  <span>Đang thực thi: <strong>{liveStatus}</strong></span>
                </div>
              )}

              {filteredCmdTools.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filteredCmdTools.map((tc, idx) => {
                    const key = tc.id || `${tc.name}_${idx}_${tc.arguments?.CommandLine || tc.arguments?.command || ''}`;
                    return (
                      <ToolCallCard
                        key={key}
                        toolCall={tc}
                        isExecuting={isExecuting && idx === filteredCmdTools.length - 1}
                        onDismiss={() => handleDismissCmd(key)}
                      />
                    );
                  })}
                </div>
              ) : cmdTools.length > 0 && hideErrors ? (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                  <AlertTriangle size={24} color="#f87171" style={{ margin: '0 auto 6px auto', opacity: 0.6 }} />
                  <div>Đã ẩn {cmdTools.length} lệnh bị lỗi theo thiết lập. Bấm nút "Ẩn lệnh lỗi" ở trên để xem lại.</div>
                </div>
              ) : (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                  <Terminal size={24} color="#38bdf8" style={{ margin: '0 auto 6px auto', opacity: 0.6 }} />
                  <div>Chưa có lệnh terminal nào được chạy trong phiên này.</div>
                </div>
              )}
            </div>
          )}

          {/* C. CODE / THAY ĐỔI MÃ NGUỒN */}
          {activeView === 'code' && (
            <div>
              {unDismissedCodeFiles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {unDismissedCodeFiles.map((filePath, idx) => {
                    const fileName = filePath.split(/[/\\]/).pop() || filePath;
                    const dirPath = filePath.includes('/') || filePath.includes('\\')
                      ? filePath.replace(/[/\\][^/\\]+$/, '')
                      : '';
                    return (
                      <div
                        key={idx}
                        onClick={() => onSelectFile?.(filePath)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        className="hover:bg-zinc-800 hover:border-zinc-600 group"
                        title={`Bấm để mở tệp ${fileName} trong editor`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <StandardFileIcon filename={fileName} size={15} />
                          <span style={{ fontSize: '12px', fontWeight: 500, color: '#f4f4f5' }} className="group-hover:text-sky-300">
                            {fileName}
                          </span>
                          {dirPath && (
                            <span style={{ fontSize: '11px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ({dirPath})
                            </span>
                          )}
                        </div>

                        <span style={{ fontSize: '11px', color: '#a1a1aa', flexShrink: 0 }}>
                          Xem tệp &gt;
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                  <ImageIcon size={24} color="#71717a" style={{ margin: '0 auto 6px auto', opacity: 0.6 }} />
                  <div>Không còn thay đổi mã nguồn nào chưa duyệt.</div>
                </div>
              )}
            </div>
          )}

          {/* D. WEB */}
          {activeView === 'web' && (
            <div>
              {webTools.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {webTools.map((tc, idx) => (
                    <ToolCallCard
                      key={tc.id || idx}
                      toolCall={tc}
                      isExecuting={isExecuting && idx === webTools.length - 1}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                  <Globe size={24} color="#38bdf8" style={{ margin: '0 auto 6px auto', opacity: 0.6 }} />
                  <div>Chưa có tác vụ duyệt web hay tìm kiếm nào trong phiên này.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
