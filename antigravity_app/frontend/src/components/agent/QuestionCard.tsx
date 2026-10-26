import React, { useState } from 'react';
import { HelpCircle, Check, Plus, X, CornerDownLeft } from 'lucide-react';

export interface PendingQuestionData {
  question: string;
  options: string[];
  allowCustom?: boolean;
  isMultiSelect?: boolean;
}

interface QuestionCardProps {
  questionData: PendingQuestionData;
  onSelectOption: (option: string) => void;
  onFillInput?: (text: string) => void;
  onDismiss?: () => void;
}

export function cleanOptionText(val: string): string {
  if (!val) return '';
  let clean = val.replace(/^#+\s*/, '');
  clean = clean.replace(/^(?:[-*•–—]\s*)?(?:[a-zA-Z0-9]+[\.\:\)]|\([a-zA-Z0-9]+\))\s*/, '');
  clean = clean.replace(/[*_]{1,3}/g, '');
  clean = clean.replace(/^[`'"]+|[`'"]+$/g, '');
  clean = clean.replace(/[\.\,\;\:\?]+$/, '');
  return clean.trim();
}

/**
 * Trích xuất các lựa chọn CHỈ KHI có câu hỏi yêu cầu người dùng chọn phương án cụ thể ở cuối
 */
export function extractOptionsFromText(text: string): string[] {
  if (!text) return [];
  const lowerAll = text.toLowerCase();
  if (
    lowerAll.includes('system prompt') ||
    lowerAll.includes('tool environment') ||
    lowerAll.includes('important details') ||
    lowerAll.includes('constraints:')
  ) {
    return [];
  }

  const lines = text.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (
      l.includes('vui lòng chọn') ||
      l.includes('chọn phương án') ||
      l.includes('bạn chọn phương án') ||
      l.includes('chọn một trong các') ||
      l.includes('lựa chọn bên dưới:') ||
      l.includes('bước tiếp theo bạn muốn')
    ) {
      startIdx = i;
      break;
    }
  }

  // Không tự ý biến các danh sách bullet point bình thường thành câu hỏi
  if (startIdx === -1) {
    return [];
  }

  const searchLines = lines.slice(startIdx);
  const searchText = searchLines.join('\n');
  const results: string[] = [];

  // Pattern: (1) abc (2) def hoặc (A) abc (B) def
  const parenMatches = Array.from(searchText.matchAll(/\(([0-9a-zA-Z]{1,2})\)\s*([^,;()\n]+)/g));
  if (parenMatches.length >= 2) {
    for (const m of parenMatches) {
      const val = cleanOptionText(m[2]);
      if (val.length >= 3 && val.length <= 160 && !results.includes(val)) {
        results.push(val);
      }
    }
    if (results.length >= 2) return results;
  }

  // Pattern: 1. abc hoặc A. abc hoặc - abc
  const lineMatches = Array.from(searchText.matchAll(/(?:^|\n)\s*(?:[0-9]{1,2}[\.\)]|[a-zA-Z][\.\)]|[-*•])\s+([^\n\r]+)/g));
  if (lineMatches.length >= 2) {
    for (const m of lineMatches) {
      const val = cleanOptionText(m[1]);
      if (val.length >= 3 && val.length <= 160 && !results.includes(val)) {
        results.push(val);
      }
    }
    if (results.length >= 2) return results;
  }

  return [];
}

export function extractQuestionPrompt(text: string): string {
  if (!text) return 'Chọn bước tiếp theo bạn muốn thực hiện:';
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l.endsWith('?') || l.toLowerCase().includes('chọn') || l.endsWith(':')) {
      return cleanOptionText(l);
    }
  }
  return 'Chọn phương án phù hợp:';
}

/**
 * QuestionCard: Thiết kế Antigravity tối giản, tinh gọn, chèn ngay trên thanh chat
 * - Nút: [Skip] và [Submit] (KHÔNG dùng Reject all / Accept all)
 * - Tùy chọn gọn gàng, hỗ trợ chọn đơn / đa lựa chọn và nhập phản hồi riêng
 */
export const QuestionCard: React.FC<QuestionCardProps> = ({
  questionData,
  onSelectOption,
  onFillInput,
  onDismiss,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  if (!questionData || !questionData.question) return null;

  const isMultiSelect = questionData.isMultiSelect ?? true;

  let rawOptions = Array.isArray(questionData.options) && questionData.options.length > 0
    ? questionData.options
    : extractOptionsFromText(questionData.question);

  let options = rawOptions.map(cleanOptionText).filter((o) => o.length > 0);

  if (options.length === 0) {
    options = [
      'Đồng ý, tiến hành theo phương án tối ưu',
      'Làm từng bước và xin xác nhận trước',
    ];
  }

  const handleToggleOption = (idx: number) => {
    if (!isMultiSelect) {
      setSelectedIndices([idx]);
      return;
    }
    setSelectedIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleConfirmSubmit = () => {
    const parts: string[] = [];
    if (selectedIndices.length > 0) {
      const chosen = selectedIndices.map((i) => options[i]);
      parts.push(chosen.join(' + '));
    }
    if (customText.trim()) {
      parts.push(customText.trim());
    }
    if (parts.length === 0) return;

    onSelectOption(parts.join(' | '));
    setSelectedIndices([]);
    setCustomText('');
  };

  const hasSelection = selectedIndices.length > 0 || customText.trim().length > 0;

  return (
    <div
      style={{
        width: '100%',
        background: '#161619',
        border: '1px solid #2a2a30',
        borderRadius: '10px',
        padding: '12px 14px',
        margin: '0 0 8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        animation: 'fadeIn 0.18s ease-out',
      }}
    >
      {/* Tiêu đề câu hỏi + Nút đóng nhanh */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1 }}>
          <HelpCircle size={15} color="#38bdf8" style={{ flexShrink: 0 }} />
          <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: 600, lineHeight: '1.4' }}>
            {cleanOptionText(questionData.question)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onDismiss?.()}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#71717a',
            padding: '3px',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="hover:text-zinc-200"
          title="Bỏ qua (Skip)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Danh sách các lựa chọn dạng Compact Chips/Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {options.map((opt, idx) => {
          const isSelected = selectedIndices.includes(idx);
          return (
            <div
              key={idx}
              onClick={() => handleToggleOption(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: isSelected ? 'rgba(56, 189, 248, 0.12)' : '#1f1f24',
                border: isSelected ? '1px solid #38bdf8' : '1px solid #292930',
                color: isSelected ? '#ffffff' : '#d4d4d8',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="hover:border-sky-500/60"
            >
              <div
                style={{
                  width: '15px',
                  height: '15px',
                  borderRadius: isMultiSelect ? '3px' : '50%',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid #52525b',
                  background: isSelected ? '#0284c7' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isSelected && <Check size={10} color="#ffffff" strokeWidth={3} />}
              </div>
              <span style={{ flex: 1, lineHeight: '1.35' }}>{opt}</span>
            </div>
          );
        })}
      </div>

      {/* Nhập câu trả lời riêng */}
      {!showCustomInput ? (
        <button
          type="button"
          onClick={() => setShowCustomInput(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 0',
            alignSelf: 'flex-start',
          }}
          className="hover:text-sky-400"
        >
          <Plus size={11} />
          <span>Nhập câu trả lời riêng...</span>
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmSubmit();
              }
            }}
            placeholder="Nhập câu trả lời hoặc yêu cầu khác của bạn..."
            style={{
              flex: 1,
              background: '#121215',
              border: '1px solid #333338',
              borderRadius: '5px',
              padding: '5px 8px',
              color: '#f4f4f5',
              fontSize: '11.5px',
              outline: 'none',
            }}
            className="focus:border-sky-500"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setCustomText('');
              setShowCustomInput(false);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              padding: '3px',
            }}
            className="hover:text-zinc-200"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Footer Hành Động: [Skip] và [Submit] chuẩn Antigravity */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          paddingTop: '6px',
          borderTop: '1px solid #222227',
        }}
      >
        <button
          type="button"
          onClick={() => onDismiss?.()}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#a1a1aa',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: '5px',
            transition: 'color 0.15s ease',
          }}
          className="hover:text-white"
        >
          Skip
        </button>

        <button
          type="button"
          onClick={handleConfirmSubmit}
          disabled={!hasSelection}
          style={{
            background: hasSelection ? '#0284c7' : '#27272a',
            border: 'none',
            color: hasSelection ? '#ffffff' : '#71717a',
            fontSize: '12px',
            fontWeight: 500,
            padding: '5px 14px',
            borderRadius: '5px',
            cursor: hasSelection ? 'pointer' : 'default',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            boxShadow: hasSelection ? '0 1px 3px rgba(2, 132, 199, 0.4)' : 'none',
          }}
          className={hasSelection ? 'hover:bg-sky-600' : ''}
        >
          <span>Submit {selectedIndices.length > 1 ? `(${selectedIndices.length})` : ''}</span>
          <CornerDownLeft size={12} />
        </button>
      </div>
    </div>
  );
};
