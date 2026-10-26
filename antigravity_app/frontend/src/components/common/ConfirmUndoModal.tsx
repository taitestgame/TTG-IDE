import React, { useEffect } from 'react';
import { X, CornerDownLeft, RotateCcw, AlertCircle } from 'lucide-react';

interface ConfirmUndoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  modifiedFiles?: string[];
  createdFiles?: string[];
  isLoading?: boolean;
}

export const ConfirmUndoModal: React.FC<ConfirmUndoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  modifiedFiles = [],
  createdFiles = [],
  isLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  const totalFiles = (modifiedFiles?.length || 0) + (createdFiles?.length || 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#18181b',
          border: '1px solid #2e2e36',
          borderRadius: '12px',
          width: '92%',
          maxWidth: '460px',
          padding: '16px 20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RotateCcw size={16} color="#38bdf8" />
            <span style={{ fontWeight: 600, fontSize: '15px', color: '#f4f4f5' }}>
              Confirm Undo
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
            className="hover:text-white hover:bg-white/5"
            title="Đóng (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        {totalFiles === 0 ? (
          <div
            style={{
              color: '#a1a1aa',
              fontSize: '13px',
              lineHeight: '1.5',
              padding: '6px 0',
            }}
          >
            This undo action will not make any code changes.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: '#d4d4d8', fontSize: '13px' }}>
              Thao tác này sẽ hoàn tác đoạn chat và khôi phục các tệp sau:
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                maxHeight: '180px',
                overflowY: 'auto',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #27272a',
              }}
            >
              {modifiedFiles.map((file, i) => (
                <div
                  key={`mod_${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#eab308',
                      background: 'rgba(234, 179, 8, 0.15)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    Đã sửa
                  </span>
                  <span
                    style={{
                      color: '#f4f4f5',
                      fontFamily: "'Cascadia Code', monospace",
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={file}
                  >
                    {file}
                  </span>
                </div>
              ))}
              {createdFiles.map((file, i) => (
                <div
                  key={`cre_${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#ef4444',
                      background: 'rgba(239, 68, 68, 0.15)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    Tạo mới (sẽ xóa)
                  </span>
                  <span
                    style={{
                      color: '#f4f4f5',
                      fontFamily: "'Cascadia Code', monospace",
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={file}
                  >
                    {file}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '13px',
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            className="hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              background: '#0284c7',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isLoading ? 0.7 : 1,
            }}
            className="hover:bg-sky-600"
          >
            <span>Confirm</span>
            <CornerDownLeft size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
