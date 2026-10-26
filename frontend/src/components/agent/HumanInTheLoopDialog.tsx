import React, { useState } from 'react';
import { HelpCircle, Send, Check } from 'lucide-react';

interface QuestionOption {
  text: string;
  recommended?: boolean;
}

interface HumanInTheLoopDialogProps {
  question: string;
  options?: string[];
  onSubmit: (answer: string) => void;
  onCancel?: () => void;
}

export const HumanInTheLoopDialog: React.FC<HumanInTheLoopDialogProps> = ({
  question,
  options = [],
  onSubmit,
  onCancel,
}) => {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [customAnswer, setCustomAnswer] = useState<string>('');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalAnswer = selectedOption || customAnswer;
    if (!finalAnswer.trim()) return;
    onSubmit(finalAnswer.trim());
  };

  return (
    <div
      style={{
        margin: '12px 0',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.95) 0%, rgba(10, 15, 26, 0.98) 100%)',
        border: '1px solid rgba(0, 240, 255, 0.4)',
        boxShadow: '0 0 25px rgba(0, 240, 255, 0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <HelpCircle size={18} color="var(--cyan)" />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--cyan)',
            letterSpacing: '0.3px',
          }}
        >
          AI AGENT CẦN BẠN XÁC NHẬN (HUMAN-IN-THE-LOOP)
        </span>
      </div>

      <p style={{ fontSize: '13px', color: '#f1f5f9', marginBottom: '14px', lineHeight: '1.5' }}>
        {question}
      </p>

      {/* Danh sách lựa chọn gợi ý */}
      {options && options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {options.map((opt, idx) => {
            const isSelected = selectedOption === opt;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSelectedOption(opt);
                  setCustomAnswer('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected ? '1px solid var(--cyan)' : '1px solid var(--border-subtle)',
                  color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span>{opt}</span>
                {isSelected && <Check size={14} color="var(--cyan)" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Ô nhập câu trả lời tùy biến */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={customAnswer}
          onChange={(e) => {
            setCustomAnswer(e.target.value);
            setSelectedOption('');
          }}
          placeholder="Hoặc nhập câu trả lời tùy chỉnh của bạn tại đây..."
          style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#ffffff',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!selectedOption && !customAnswer.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, var(--cyan) 0%, #3b82f6 100%)',
            border: 'none',
            color: '#000000',
            fontWeight: 700,
            fontSize: '12px',
            cursor: !selectedOption && !customAnswer.trim() ? 'not-allowed' : 'pointer',
            opacity: !selectedOption && !customAnswer.trim() ? 0.5 : 1,
          }}
        >
          <Send size={13} />
          Gửi
        </button>
      </form>
    </div>
  );
};
