import React, { useState } from 'react';
import {
  CheckCircle2,
  Sparkles,
  XCircle,
  Clock,
  ListTodo,
  FileCode,
  Terminal,
  FolderSearch,
  Play,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { Plan } from '../../types';

export function cleanStepText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^(?:(?:Đợt|Phase|Bước|Giai đoạn|Step)\s*\d+[\s:–—\.\-]*|\d+[\.\)]\s*)/i, '')
    .trim();
}

interface PlanCardProps {
  plan: Plan;
  isExecuting?: boolean;
  onExecutePlan?: () => void;
  onClearPlan?: () => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isExecuting = false,
  onExecutePlan,
  onClearPlan,
}) => {
  const [hideCompleted, setHideCompleted] = useState(false);

  if (!plan || !plan.steps || plan.steps.length === 0) return null;

  const completedSteps = plan.steps.filter((s) => s.status === 'success').length;
  const totalSteps = plan.steps.length;

  const getToolIcon = (tool?: string) => {
    if (!tool) return null;
    if (tool.includes('file') || tool.includes('write') || tool.includes('read') || tool.includes('edit')) {
      return <FileCode size={11} color="#38bdf8" />;
    }
    if (tool.includes('command') || tool.includes('terminal')) {
      return <Terminal size={11} color="#a855f7" />;
    }
    if (tool.includes('list') || tool.includes('search') || tool.includes('grep')) {
      return <FolderSearch size={11} color="#eab308" />;
    }
    return null;
  };

  return (
    <div
      style={{
        background: '#16161a',
        border: '1px solid #27272a',
        borderRadius: '8px',
        padding: '12px 14px',
        margin: '6px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #222226',
          paddingBottom: '8px',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ListTodo size={15} color="#38bdf8" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5' }}>
            {plan.goal || 'Kế hoạch triển khai'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {completedSteps > 0 && (
            <button
              type="button"
              onClick={() => setHideCompleted(!hideCompleted)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#a1a1aa',
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              className="hover:text-white"
              title="Ẩn / Hiện các câu lệnh hoặc bước đã hoàn tất"
            >
              {hideCompleted ? <Eye size={11} /> : <EyeOff size={11} />}
              <span>{hideCompleted ? 'Hiện đã xong' : 'Ẩn bước đã xong'}</span>
            </button>
          )}

          <span
            style={{
              fontSize: '11px',
              color: isExecuting ? '#38bdf8' : completedSteps === totalSteps ? '#22c55e' : '#a1a1aa',
              background: isExecuting ? 'rgba(56, 189, 248, 0.12)' : completedSteps === totalSteps ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: isExecuting ? '1px solid rgba(56, 189, 248, 0.28)' : '1px solid transparent',
              padding: '2px 8px',
              borderRadius: '6px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isExecuting && <span className="animate-pulse" style={{ color: '#38bdf8' }}>●</span>}
            {isExecuting
              ? `Đang chạy: Bước ${Math.min((plan.currentStep || 0) + 1, totalSteps)}/${totalSteps} (${completedSteps}/${totalSteps} xong)`
              : `${completedSteps}/${totalSteps} bước hoàn tất`}
          </span>
        </div>
      </div>

      {/* Collapsed completed steps separator */}
      {hideCompleted && completedSteps > 0 && (
        <div
          onClick={() => setHideCompleted(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '6px 12px',
            margin: '2px 0 4px 0',
            borderRadius: '6px',
            background: 'rgba(34, 197, 94, 0.06)',
            border: '1px dashed rgba(34, 197, 94, 0.3)',
            color: '#86efac',
            fontSize: '11px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          className="hover:bg-green-500/10"
          title="Nhấn để hiện lại toàn bộ các bước đã hoàn tất"
        >
          <span>------</span>
          <CheckCircle2 size={13} color="#22c55e" />
          <span>Đã hoàn thành {completedSteps} bước trước (Nhấn để hiện lại)</span>
          <span>------</span>
        </div>
      )}

      {/* Steps List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {plan.steps.map((st, idx) => {
          const isDone = st.status === 'success';
          if (hideCompleted && isDone) return null;

          const isCurrent = st.status === 'executing' || (isExecuting && idx === plan.currentStep);
          const isFailed = st.status === 'failed';
          const cleanDesc = cleanStepText(st.description);

          return (
            <div
              key={st.id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '5px',
                background: isCurrent ? '#1f1f26' : isDone ? 'rgba(34, 197, 94, 0.04)' : '#121215',
                border: isCurrent ? '1px solid #3f3f46' : isDone ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid #202025',
                borderLeft: isCurrent ? '3px solid #38bdf8' : isDone ? '3px solid #22c55e' : '3px solid transparent',
                fontSize: '12px',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                <span
                  style={{
                    color: '#71717a',
                    fontWeight: 600,
                    fontSize: '11.5px',
                    minWidth: '18px',
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}.
                </span>
                {isDone ? (
                  <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
                ) : isCurrent ? (
                  <Sparkles size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
                ) : isFailed ? (
                  <XCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                ) : (
                  <Clock size={14} color="#71717a" style={{ flexShrink: 0 }} />
                )}
                <span
                  style={{
                    color: isCurrent ? '#ffffff' : isDone ? '#d4d4d8' : '#a1a1aa',
                    fontWeight: isCurrent ? 500 : isDone ? 500 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cleanDesc}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {isCurrent && (
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: '#38bdf8',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontWeight: 500,
                      fontSize: '10.5px',
                    }}
                  >
                    Đang làm
                  </span>
                )}

                {st.tool && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      color: '#94a3b8',
                      fontFamily: "'Cascadia Code', monospace",
                      fontSize: '10px',
                    }}
                  >
                    {getToolIcon(st.tool)}
                    <span>{st.tool}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nút hành động Bắt đầu thực thi kế hoạch này */}
      {onExecutePlan && completedSteps < totalSteps && !isExecuting && (
        <button
          type="button"
          onClick={onExecutePlan}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '4px',
            padding: '7px 12px',
            background: '#0284c7',
            border: 'none',
            borderRadius: '5px',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          className="hover:bg-sky-600"
          title="Tự động bắt đầu thực thi lần lượt các bước này"
        >
          <Play size={12} fill="#ffffff" />
          <span>Bắt đầu thực thi kế hoạch</span>
        </button>
      )}
    </div>
  );
};
