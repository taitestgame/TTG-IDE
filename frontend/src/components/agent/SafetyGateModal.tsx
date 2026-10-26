import React from 'react';
import { ShieldAlert, Check, X, AlertTriangle } from 'lucide-react';

interface SafetyGateModalProps {
  command: string;
  reason: string;
  onApprove: () => void;
  onDeny: () => void;
}

export const SafetyGateModal: React.FC<SafetyGateModalProps> = ({
  command,
  reason,
  onApprove,
  onDeny,
}) => {
  return (
    <div
      style={{
        margin: '12px 0',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        background: 'linear-gradient(180deg, rgba(30, 10, 18, 0.95) 0%, rgba(18, 6, 12, 0.98) 100%)',
        border: '1px solid rgba(255, 42, 95, 0.5)',
        boxShadow: '0 0 30px rgba(255, 42, 95, 0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <ShieldAlert size={18} color="var(--rose)" />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 800,
            color: 'var(--rose)',
            letterSpacing: '0.5px',
          }}
        >
          CẢNH BÁO SAFETY GATE (LỆNH NGUY HIỂM)
        </span>
      </div>

      <p style={{ fontSize: '12px', color: '#fecdd3', marginBottom: '10px', lineHeight: '1.5' }}>
        {reason || 'Agent đang yêu cầu thực thi một lệnh có khả năng phá hủy hoặc thay đổi hệ thống ngoài ý muốn.'}
      </p>

      <div
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 42, 95, 0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          fontFamily: "'Fira Code', monospace",
          fontSize: '12px',
          color: '#fda4af',
          marginBottom: '14px',
          wordBreak: 'break-all',
        }}
      >
        <code>$ {command}</code>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button
          onClick={onDeny}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-medium)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <X size={14} />
          Từ chối (Hủy lệnh)
        </button>

        <button
          onClick={onApprove}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 18px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, var(--rose) 0%, #e11d48 100%)',
            border: 'none',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 0 15px rgba(255, 42, 95, 0.4)',
          }}
        >
          <Check size={14} />
          Duyệt & Cho phép chạy
        </button>
      </div>
    </div>
  );
};
