import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { MultiAIConfig, AIProviderConfig } from '../../types';
import { WailsService } from '../../services/wailsBridge';
import { getProviderNameForModel } from '../../services/providerUtils';

interface ModelSelectorProps {
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  direction?: 'up' | 'down';
  onOpenSettings?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId,
  onSelectModel,
  direction = 'down',
  onOpenSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<MultiAIConfig[]>([]);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [list, provs] = await Promise.all([
        WailsService.getAIModels(),
        WailsService.getAIProviders(),
      ]);
      setModels(list);
      setProviders(provs);
    } catch (e) {
      console.error('Lỗi nạp model:', e);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('ttgide_models_updated', handleUpdate);
    return () => window.removeEventListener('ttgide_models_updated', handleUpdate);
  }, []);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModel = useMemo(() => {
    if (!selectedModelId) return models[0] || { id: '', name: 'Chọn Model AI' };
    const found = models.find((m) => m.id === selectedModelId || m.model === selectedModelId);
    if (found) return found;
    return {
      id: selectedModelId,
      name: selectedModelId,
    };
  }, [models, selectedModelId]);

  // Gom nhóm models theo Provider
  const groupedModels = useMemo(() => {
    const groups = new Map<string, { providerName: string; list: MultiAIConfig[] }>();
    models.forEach((m) => {
      const pName = getProviderNameForModel(m, providers);
      if (!groups.has(pName)) {
        groups.set(pName, {
          providerName: pName,
          list: [],
        });
      }
      groups.get(pName)!.list.push(m);
    });
    return Array.from(groups.values());
  }, [models, providers]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button - iOS Pill Style */}
      <button
        type="button"
        onClick={() => {
          if (!isOpen) loadData();
          setIsOpen(!isOpen);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '9999px',
          padding: '5px 12px',
          color: '#f4f4f5',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        className="hover:bg-white/10"
      >
        <span style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentModel.name}
        </span>
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {/* Custom Popover Menu - iOS Rounded Squircle Sheet */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            [direction === 'up' ? 'bottom' : 'top']: 'calc(100% + 8px)',
            left: 0,
            width: '290px',
            background: 'rgba(28, 28, 30, 0.96)',
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '18px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            padding: '8px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              padding: '6px 10px 8px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#8e8e93',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '4px',
            }}
          >
            Mô hình AI
          </div>

          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {groupedModels.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '12px', color: '#8e8e93', textAlign: 'center' }}>
                Chưa có model nào trong IDE
              </div>
            ) : (
              groupedModels.map((grp) => (
                <div key={grp.providerName} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {/* Tên nhà cung cấp theo nhóm iOS */}
                  <div
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#8e8e93',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{grp.providerName}</span>
                    <span style={{ fontSize: '10px', color: '#636366' }}>{grp.list.length}</span>
                  </div>

                  {grp.list.map((m) => {
                    const isSelected = m.id === selectedModelId || m.model === selectedModelId;
                    const isFree = m.baseUrl?.includes('5050') || m.apiKey === 'free' || m.apiKey === 'dummy' || m.id.includes('free');
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          try {
                            localStorage.setItem('ttgide_selected_model', m.id);
                          } catch (_) {}
                          onSelectModel(m.id);
                          setIsOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                          color: '#f4f4f5',
                          fontSize: '12.5px',
                          transition: 'background 0.1s ease',
                        }}
                        className="hover:bg-white/5"
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: isSelected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {m.name}
                            </span>
                            {isFree && (
                              <span style={{ fontSize: '9.5px', background: 'rgba(255, 255, 255, 0.08)', color: '#8e8e93', padding: '1px 6px', borderRadius: '9999px', fontWeight: 500 }}>
                                Free
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '10.5px', color: '#8e8e93', fontFamily: 'monospace' }}>{m.model}</span>
                        </div>
                        {isSelected && <Check size={14} color="#f4f4f5" />}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Link to Settings to add new models */}
          {onOpenSettings && (
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', marginTop: '4px', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#8e8e93',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.12s ease',
                }}
                className="hover:text-white hover:bg-white/5"
              >
                <span>Quản lý & Thêm API trong Cài đặt...</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
