import React, { useEffect, useState } from 'react';
import {
  Target,
  Clock,
  ListOrdered,
  HelpCircle,
  BookOpen,
  Cpu,
  CheckCircle2,
  RotateCcw,
  Server,
  Sparkles,
} from 'lucide-react';

export interface SlashCommandItem {
  id: string;
  command: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'goal',
    command: '/goal',
    title: '/goal',
    description: 'Chạy tác vụ dài hạn tự động (autonomous) cho đến khi đạt mục tiêu hoàn chỉnh.',
    icon: <Target size={15} color="#94a3b8" />,
    badge: 'Superpower',
  },
  {
    id: 'plan',
    command: '/plan',
    title: '/plan',
    description: 'Lập kế hoạch từng bước chi tiết (step-by-step) trước khi thực thi.',
    icon: <ListOrdered size={15} color="#94a3b8" />,
    badge: 'Architect',
  },
  {
    id: 'schedule',
    command: '/schedule',
    title: '/schedule',
    description: 'Lên lịch hẹn giờ chạy ngầm (Timer đếm ngược hoặc Cron định kỳ).',
    icon: <Clock size={15} color="#94a3b8" />,
    badge: 'Scheduler',
  },
  {
    id: 'grill-me',
    command: '/grill-me',
    title: '/grill-me',
    description: 'Phỏng vấn hỏi đáp làm rõ thiết kế, kiến trúc và quyết định quan trọng.',
    icon: <HelpCircle size={15} color="#94a3b8" />,
  },
  {
    id: 'learn',
    command: '/learn',
    title: '/learn',
    description: 'Ghi nhớ bài học, lỗi sửa được hoặc tùy chỉnh hành vi lâu dài.',
    icon: <BookOpen size={15} color="#94a3b8" />,
  },
  {
    id: 'reverse-engineer',
    command: '/reverse-engineer-anything',
    title: '/reverse-engineer-anything',
    description: 'Bóc tách, dịch ngược cấu trúc và cơ chế vận hành từ mã nguồn bất kỳ.',
    icon: <Cpu size={15} color="#94a3b8" />,
    badge: 'Elite',
  },
  {
    id: 'test',
    command: '/test',
    title: '/test',
    description: 'Chạy bộ kiểm thử tự động (tests) và tự động sửa các lỗi phát sinh.',
    icon: <CheckCircle2 size={15} color="#94a3b8" />,
  },
  {
    id: 'rollback',
    command: '/rollback',
    title: '/rollback',
    description: 'Khôi phục nhanh mã nguồn về Checkpoint an toàn gần nhất.',
    icon: <RotateCcw size={15} color="#94a3b8" />,
  },
  {
    id: 'mcp',
    command: '/mcp',
    title: '/mcp',
    description: 'Quản lý, liệt kê tài nguyên và gọi công cụ từ MCP Servers.',
    icon: <Server size={15} color="#94a3b8" />,
    badge: 'Protocol',
  },
];

interface SlashCommandsMenuProps {
  query: string;
  onSelect: (cmd: SlashCommandItem) => void;
  onClose: () => void;
}

export const SlashCommandsMenu: React.FC<SlashCommandsMenuProps> = ({
  query,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const cleanQuery = query.toLowerCase().trim();
  const filtered = SLASH_COMMANDS.filter((c) => {
    if (!cleanQuery || cleanQuery === '/') return true;
    return (
      c.command.toLowerCase().includes(cleanQuery) ||
      c.title.toLowerCase().includes(cleanQuery) ||
      c.description.toLowerCase().includes(cleanQuery)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0) {
          e.preventDefault();
          onSelect(filtered[selectedIndex] || filtered[0]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: '8px',
        background: '#141416',
        border: '1px solid #27272a',
        borderRadius: '10px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        zIndex: 50,
        overflow: 'hidden',
        maxHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#71717a',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#a1a1aa', fontWeight: 600 }}>
          <Sparkles size={13} color="#a1a1aa" />
          <span>Lệnh tắt (Slash Commands & Plugins)</span>
        </span>
        <span>Dùng ↑ ↓ và Enter để chọn</span>
      </div>

      <div style={{ overflowY: 'auto', padding: '4px' }}>
        {filtered.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: isSelected ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                transition: 'all 0.1s ease',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: isSelected ? '#27272a' : '#1f1f23',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: isSelected ? '#ffffff' : '#e4e4e7', fontFamily: 'monospace' }}>
                    {item.title}
                  </span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: '#27272a',
                        border: '1px solid #3f3f46',
                        color: '#a1a1aa',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '11.5px',
                    color: isSelected ? '#cbd5e1' : '#71717a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '2px',
                  }}
                >
                  {item.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
