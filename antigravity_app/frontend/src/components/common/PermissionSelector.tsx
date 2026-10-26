import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type PermissionMode = 'full' | 'ask' | 'plan';

interface PermissionOption {
  id: PermissionMode;
  label: string;
  desc: string;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    id: 'full',
    label: 'Auto-Approve',
    desc: 'Automatically edit files and run commands without prompting',
  },
  {
    id: 'ask',
    label: 'Prompt for Approval',
    desc: 'Ask for confirmation before writing files or running terminal commands',
  },
  {
    id: 'plan',
    label: 'Plan Only',
    desc: 'Analyze codebase and design step-by-step plans without modifying code',
  },
];

interface PermissionSelectorProps {
  mode: PermissionMode;
  onChangeMode: (mode: PermissionMode) => void;
  direction?: 'up' | 'down';
}

export const PermissionSelector: React.FC<PermissionSelectorProps> = ({
  mode,
  onChangeMode,
  direction = 'up',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = PERMISSION_OPTIONS.find((opt) => opt.id === mode) || PERMISSION_OPTIONS[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Pill Button - iOS Clean Style */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: '9999px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#f4f4f5',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        title={`Chế độ cấp quyền: ${currentOption.label} - ${currentOption.desc}`}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{currentOption.label}</span>
        <ChevronDown size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      {/* Dropdown Menu - iOS Squircle Sheet */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            [direction === 'up' ? 'bottom' : 'top']: 'calc(100% + 8px)',
            left: 0,
            width: '270px',
            background: 'rgba(28, 28, 30, 0.96)',
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            padding: '8px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          <div
            style={{
              padding: '6px 10px 8px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#8e8e93',
              letterSpacing: '0.04em',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '4px',
            }}
          >
            Execution Permissions
          </div>

          {PERMISSION_OPTIONS.map((opt) => {
            const isSelected = opt.id === mode;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  onChangeMode(opt.id);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  transition: 'background 0.12s ease',
                }}
                className="hover:bg-white/5"
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: '#f4f4f5' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '2px', lineHeight: 1.35 }}>
                    {opt.desc}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ flexShrink: 0 }}>
                    <Check size={15} color="#f4f4f5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
