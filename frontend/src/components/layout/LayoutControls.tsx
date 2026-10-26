import React, { useState, useRef, useEffect } from 'react';
import { PanelLeft, PanelBottom, PanelRight, PanelsTopLeft } from 'lucide-react';

interface LayoutControlsProps {
  showLeftSidebar?: boolean;
  onToggleLeftSidebar?: () => void;
  showTerminal?: boolean;
  onToggleTerminal?: () => void;
  showRightChat?: boolean;
  onToggleRightChat?: () => void;
  onResetLayout?: () => void;
}

export const LayoutControls: React.FC<LayoutControlsProps> = ({
  showLeftSidebar = true,
  onToggleLeftSidebar,
  showTerminal = true,
  onToggleTerminal,
  showRightChat = true,
  onToggleRightChat,
  onResetLayout,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const buttonBaseStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '24px',
    borderRadius: '4px',
    border: isActive ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid transparent',
    background: isActive ? 'rgba(255, 255, 255, 0.10)' : 'transparent',
    color: isActive ? '#f4f4f5' : '#71717a',
    cursor: 'pointer',
    padding: 0,
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', position: 'relative' }}>
      {/* 1. Customize Layout Button */}
      <button
        type="button"
        style={buttonBaseStyle(showMenu)}
        onClick={() => setShowMenu((prev) => !prev)}
        title="Tùy chỉnh bố cục (Customize Layout)"
        className="hover:text-white hover:bg-white/10"
      >
        <PanelsTopLeft size={15} strokeWidth={1.8} />
      </button>

      {/* 2. Toggle Primary Side Bar (Left) */}
      <button
        type="button"
        style={buttonBaseStyle(showLeftSidebar)}
        onClick={onToggleLeftSidebar}
        title={showLeftSidebar ? "Ẩn thanh bên trái (Ctrl+B)" : "Hiện thanh bên trái (Ctrl+B)"}
        className="hover:text-white hover:bg-white/10"
      >
        <PanelLeft size={15} strokeWidth={1.8} />
      </button>

      {/* 3. Toggle Panel (Bottom Terminal) */}
      <button
        type="button"
        style={buttonBaseStyle(showTerminal)}
        onClick={onToggleTerminal}
        title={showTerminal ? "Ẩn bảng điều khiển Terminal (Ctrl+`)" : "Hiện bảng điều khiển Terminal (Ctrl+`)"}
        className="hover:text-white hover:bg-white/10"
      >
        <PanelBottom size={15} strokeWidth={1.8} />
      </button>

      {/* 4. Toggle Secondary Side Bar (Right AI Chat) */}
      <button
        type="button"
        style={buttonBaseStyle(showRightChat)}
        onClick={onToggleRightChat}
        title={showRightChat ? "Ẩn trợ lý AI bên phải (Ctrl+L)" : "Hiện trợ lý AI bên phải (Ctrl+L)"}
        className="hover:text-white hover:bg-white/10"
      >
        <PanelRight size={15} strokeWidth={1.8} />
      </button>

      {/* Dropdown Menu for Customize Layout */}
      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '30px',
            right: 0,
            background: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            padding: '4px 0',
            minWidth: '220px',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            onClick={() => {
              onToggleLeftSidebar?.();
              setShowMenu(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#f4f4f5',
              cursor: 'pointer',
            }}
            className="hover:bg-white/10"
          >
            <span>Thanh bên trái (Primary Sidebar)</span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{showLeftSidebar ? '✓ Bật' : 'Tắt'}</span>
          </div>

          <div
            onClick={() => {
              onToggleTerminal?.();
              setShowMenu(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#f4f4f5',
              cursor: 'pointer',
            }}
            className="hover:bg-white/10"
          >
            <span>Bảng điều khiển Terminal</span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{showTerminal ? '✓ Bật' : 'Tắt'}</span>
          </div>

          <div
            onClick={() => {
              onToggleRightChat?.();
              setShowMenu(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#f4f4f5',
              cursor: 'pointer',
            }}
            className="hover:bg-white/10"
          >
            <span>Thanh AI Assistant bên phải</span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{showRightChat ? '✓ Bật' : 'Tắt'}</span>
          </div>

          <div style={{ height: '1px', background: '#27272a', margin: '4px 0' }} />

          <div
            onClick={() => {
              if (onResetLayout) {
                onResetLayout();
              } else {
                if (!showLeftSidebar) onToggleLeftSidebar?.();
                if (!showTerminal) onToggleTerminal?.();
                if (!showRightChat) onToggleRightChat?.();
              }
              setShowMenu(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#38bdf8',
              cursor: 'pointer',
            }}
            className="hover:bg-white/10"
          >
            <span>↺ Đặt lại bố cục đầy đủ (Reset Layout)</span>
          </div>
        </div>
      )}
    </div>
  );
};
