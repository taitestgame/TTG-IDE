import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Sliders,
  Palette,
  FileCode,
  Shield,
  Layers,
  Wrench,
  Terminal,
  GitBranch,
  Database,
  Keyboard,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  Server,
  Globe,
  Radio,
  Download,
  Zap,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Star,
  Sparkles,
  Filter,
} from 'lucide-react';
import { MultiAIConfig, AIProviderConfig } from '../../types';
import { WailsService } from '../../services/wailsBridge';
import { getProviderNameForModel } from '../../services/providerUtils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshModels?: () => void;
  selectedModel?: string;
  onSelectModel?: (modelId: string) => void;
}

type SettingsTab =
  | 'providers'
  | 'mcp'
  | 'general'
  | 'appearance'
  | 'editor'
  | 'agent'
  | 'multi_ai'
  | 'tools'
  | 'terminal'
  | 'git'
  | 'storage'
  | 'shortcuts';

const PRESET_PROVIDERS = [
  {
    name: 'OpenCode Free Bridge (:5050)',
    baseUrl: 'http://127.0.0.1:5050/v1',
    apiKey: 'free',
    desc: 'Bridge AI miễn phí tích hợp sẵn trong TTG IDE (Local port 5050)',
  },
  {
    name: 'OpenRouter Gateway',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    desc: 'Cổng đa mô hình toàn cầu (DeepSeek, Claude, Llama, Gemini, Qwen)',
  },
  {
    name: 'Ollama Local (:11434)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    desc: 'Mô hình offline chạy trực tiếp trên PC qua Ollama',
  },
  {
    name: 'DeepSeek Official API',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    desc: 'DeepSeek V3 / R1 (Yêu cầu API key của DeepSeek)',
  },
  {
    name: 'OpenAI API Official',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    desc: 'GPT-4o, GPT-4o-mini, o1, o3-mini (Yêu cầu OpenAI API key)',
  },
  {
    name: 'Groq Cloud LPU',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    desc: 'Llama 3.3, Mixtral tốc độ suy luận siêu tốc 500+ tokens/s',
  },
  {
    name: 'Custom Endpoint',
    baseUrl: 'http://',
    apiKey: '',
    desc: 'Tùy chỉnh bất kỳ endpoint OpenAI-compatible (vLLM, LMStudio, v.v.)',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onRefreshModels,
  selectedModel,
  onSelectModel,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');

  // AI Providers & Models State
  const [models, setModels] = useState<MultiAIConfig[]>([]);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('active_models'); // 'active_models' or provider.id

  // Search & Filter in Models Pane
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState<'all' | 'free' | 'added' | 'not_added'>('all');

  // Scanning State (per provider)
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scannedMap, setScannedMap] = useState<Record<string, string[]>>({});
  const [scanErrorMap, setScanErrorMap] = useState<Record<string, string>>({});

  // Add / Edit Provider Modal State
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingProviderObj, setEditingProviderObj] = useState<AIProviderConfig | null>(null);
  const [providerPreset, setProviderPreset] = useState(PRESET_PROVIDERS[0].name);
  const [provName, setProvName] = useState(PRESET_PROVIDERS[0].name);
  const [provBaseUrl, setProvBaseUrl] = useState(PRESET_PROVIDERS[0].baseUrl);
  const [provApiKey, setProvApiKey] = useState(PRESET_PROVIDERS[0].apiKey);
  const [provDesc, setProvDesc] = useState(PRESET_PROVIDERS[0].desc);

  // Edit Provider Name State
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editProvName, setEditProvName] = useState('');

  // Add Manual Model Form State
  const [showAddManualModel, setShowAddManualModel] = useState(false);

  // MCP Servers State
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('uvx');
  const [newMcpArgs, setNewMcpArgs] = useState('mcp-server-sqlite --db-path ./antigravity.db');
  const [newMcpEnv, setNewMcpEnv] = useState('');
  const [mcpLoading, setMcpLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      WailsService.getMCPServers().then((res) => {
        if (res && Array.isArray(res)) setMcpServers(res);
      }).catch(console.error);
    }
  }, [isOpen]);

  const handleSaveMcpServer = async () => {
    if (!newMcpName.trim() || !newMcpCommand.trim()) return;
    setMcpLoading(true);
    try {
      const argsArray = newMcpArgs.trim() ? newMcpArgs.trim().split(/\s+/) : [];
      const envMap: Record<string, string> = {};
      if (newMcpEnv.trim()) {
        newMcpEnv.split('\n').forEach((line) => {
          const parts = line.split('=');
          if (parts.length >= 2) envMap[parts[0].trim()] = parts.slice(1).join('=').trim();
        });
      }
      await WailsService.saveMCPServer(newMcpName.trim(), newMcpCommand.trim(), argsArray, envMap);
      const updated = await WailsService.getMCPServers();
      setMcpServers(updated);
      setNewMcpName('');
      setNewMcpArgs('');
      setNewMcpEnv('');
    } catch (e) {
      console.error(e);
    } finally {
      setMcpLoading(false);
    }
  };

  const handleDeleteMcpServer = async (name: string) => {
    try {
      await WailsService.deleteMCPServer(name);
      const updated = await WailsService.getMCPServers();
      setMcpServers(updated);
    } catch (e) {
      console.error(e);
    }
  };
  const [manualModelName, setManualModelName] = useState('');
  const [manualDisplayName, setManualDisplayName] = useState('');
  const [manualModelId, setManualModelId] = useState('');

  // General Settings
  const [startupMode, setStartupMode] = useState('vibe');
  const [tabSize, setTabSize] = useState('2');
  const [wordWrap, setWordWrap] = useState('on');
  const [multiAIStrategy, setMultiAIStrategy] = useState('sequential');
  const [concurrencyLimit, setConcurrencyLimit] = useState('3');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [isTestingBridge, setIsTestingBridge] = useState(false);
  const [vibeToolbarEnabled, setVibeToolbarEnabled] = useState<boolean>(() => {
    return localStorage.getItem('ttgide_show_vibe_toolbar') !== 'false';
  });

  // Load models, providers & settings on mount / open
  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      try {
        const [loadedModels, loadedProviders] = await Promise.all([
          WailsService.getAIModels(),
          WailsService.getAIProviders(),
        ]);
        setModels(loadedModels);
        setProviders(loadedProviders);

        // Load cached scanned models from localStorage
        const cachedScans = localStorage.getItem('ttgide_scanned_models');
        if (cachedScans) {
          try {
            setScannedMap(JSON.parse(cachedScans));
          } catch (e) {}
        }

        const savedMode = await WailsService.getSetting('startup_mode');
        if (savedMode) setStartupMode(savedMode);

        const savedStrat = await WailsService.getSetting('multi_ai_strategy');
        if (savedStrat) setMultiAIStrategy(savedStrat);

        const savedConc = await WailsService.getSetting('concurrency_limit');
        if (savedConc) setConcurrencyLimit(savedConc);
      } catch (e) {
        console.error('Lỗi nạp cài đặt:', e);
      }
    };

    loadSettings();
  }, [isOpen]);

  if (!isOpen) return null;

  const notifySave = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 3500);
  };

  // Test OpenCode local bridge connection (:5050)
  const handleTestBridge = async () => {
    setIsTestingBridge(true);
    try {
      const fetched = await WailsService.fetchAvailableModels('http://127.0.0.1:5050/v1');
      notifySave(`✅ Kết nối thành công! Nhận diện ${fetched.length} model từ Free Bridge (:5050)`);
    } catch (e: any) {
      notifySave(`❌ Lỗi kết nối Bridge: ${e?.message || e}`);
    } finally {
      setIsTestingBridge(false);
    }
  };

  // Preset Selection for Add Provider
  const handleSelectPreset = (presetName: string) => {
    setProviderPreset(presetName);
    const p = PRESET_PROVIDERS.find((item) => item.name === presetName);
    if (p) {
      setProvName(p.name);
      setProvBaseUrl(p.baseUrl);
      setProvApiKey(p.apiKey);
      setProvDesc(p.desc);
    }
  };

  // Open Edit Provider Modal
  const handleOpenEditProvider = (p: AIProviderConfig) => {
    setEditingProviderObj(p);
    setProvName(p.name);
    setProvBaseUrl(p.baseUrl);
    setProvApiKey(p.apiKey && p.apiKey !== 'free' ? p.apiKey : '');
    setProvDesc(p.description || '');
    setShowAddProvider(true);
  };

  // Save new or edited Provider
  const handleSaveProvider = async (scanAfterSave: boolean = true) => {
    if (!provName.trim() || !provBaseUrl.trim()) {
      notifySave('⚠️ Vui lòng nhập tên Provider và Base URL');
      return;
    }

    const sanitizedBaseUrl = provBaseUrl.trim().replace(/\/+$/, '').replace(/\/models\/?$/i, '');
    let targetProv: AIProviderConfig;

    if (editingProviderObj) {
      targetProv = {
        ...editingProviderObj,
        name: provName.trim(),
        baseUrl: sanitizedBaseUrl,
        apiKey: provApiKey.trim() || 'free',
        description: provDesc.trim(),
      };
      const updated = providers.map((p) => (p.id === editingProviderObj.id ? targetProv : p));
      setProviders(updated);
      await WailsService.saveAIProviders(updated);
      notifySave(`Đã cập nhật Provider: ${targetProv.name}`);
    } else {
      targetProv = {
        id: `prov_${Date.now()}`,
        name: provName.trim(),
        baseUrl: sanitizedBaseUrl,
        apiKey: provApiKey.trim() || 'free',
        description: provDesc.trim(),
      };
      const updated = [...providers.filter((p) => p.baseUrl !== targetProv.baseUrl), targetProv];
      setProviders(updated);
      await WailsService.saveAIProviders(updated);
      notifySave(`Đã thêm Provider: ${targetProv.name}`);
    }

    setShowAddProvider(false);
    setSelectedProviderId(targetProv.id);
    setEditingProviderObj(null);

    if (scanAfterSave) {
      handleScanProvider(targetProv);
    }
  };

  // Rename Provider
  const handleSaveRenameProvider = async (providerId: string) => {
    if (!editProvName.trim()) return;
    const updated = providers.map((p) => (p.id === providerId ? { ...p, name: editProvName.trim() } : p));
    setProviders(updated);
    await WailsService.saveAIProviders(updated);
    setEditingProviderId(null);
    notifySave('Đã đổi tên Provider thành công!');
  };

  // Delete Provider
  const handleDeleteProvider = async (id: string) => {
    const provToDelete = providers.find((p) => p.id === id);
    const updated = providers.filter((p) => p.id !== id);
    setProviders(updated);
    await WailsService.saveAIProviders(updated);

    // Xóa toàn bộ model thuộc về Provider đã xóa này để không bị rác danh sách
    if (provToDelete) {
      const remainingModels = models.filter(
        (m) =>
          m.providerId !== id &&
          (!m.baseUrl || m.baseUrl.replace(/\/+$/, '') !== provToDelete.baseUrl.replace(/\/+$/, ''))
      );
      if (remainingModels.length !== models.length) {
        await WailsService.saveAIModels(remainingModels);
        setModels(remainingModels);
        onRefreshModels?.();
      }
    }

    if (selectedProviderId === id) {
      setSelectedProviderId('active_models');
    }
    notifySave(`Đã xóa Provider: ${provToDelete?.name || id}`);
  };

  // Scan models from a Provider endpoint
  const handleScanProvider = async (provider: AIProviderConfig) => {
    setScanningId(provider.id);
    setScanErrorMap((prev) => ({ ...prev, [provider.id]: '' }));
    try {
      const cleanUrl = provider.baseUrl.trim().replace(/\/+$/, '').replace(/\/models\/?$/i, '');
      const fetched = await WailsService.fetchAvailableModels(cleanUrl, provider.apiKey);
      if (!fetched || fetched.length === 0) {
        setScanErrorMap((prev) => ({ ...prev, [provider.id]: 'Không tìm thấy model nào từ API endpoint này.' }));
      } else {
        const nextScanned = { ...scannedMap, [provider.id]: fetched };
        setScannedMap(nextScanned);
        localStorage.setItem('ttgide_scanned_models', JSON.stringify(nextScanned));
        notifySave(`Đã quét được ${fetched.length} model từ ${provider.name}!`);
      }
    } catch (err: any) {
      setScanErrorMap((prev) => ({ ...prev, [provider.id]: `Lỗi: ${err?.message || err}` }));
    } finally {
      setScanningId(null);
    }
  };

  // Import single model from scanned list (tạo ID riêng theo Provider để không bị đè nhau)
  const handleImportSingleModel = async (provider: AIProviderConfig, modelName: string) => {
    const cleanModel = modelName.trim();
    const cleanUrl = provider.baseUrl.trim().replace(/\/+$/, '').replace(/\/models\/?$/i, '');
    const uniqueId = `${provider.id}_${cleanModel}`;
    const cfg: MultiAIConfig = {
      id: uniqueId,
      name: `${cleanModel} (${provider.name})`,
      baseUrl: cleanUrl,
      apiKey: provider.apiKey || 'free',
      model: cleanModel,
      providerId: provider.id,
      providerName: provider.name,
    };

    const updated = await WailsService.addAIModel(cfg);
    setModels(updated);
    notifySave(`Đã thêm model: ${cleanModel} từ ${provider.name}`);
    onRefreshModels?.();
  };

  // Import all filtered/scanned models from provider
  const handleImportModelsList = async (provider: AIProviderConfig, list: string[]) => {
    if (list.length === 0) return;

    const cleanUrl = provider.baseUrl.trim().replace(/\/+$/, '').replace(/\/models\/?$/i, '');
    const newItems: MultiAIConfig[] = list.map((mName) => {
      const cleanModel = mName.trim();
      return {
        id: `${provider.id}_${cleanModel}`,
        name: `${cleanModel} (${provider.name})`,
        baseUrl: cleanUrl,
        apiKey: provider.apiKey || 'free',
        model: cleanModel,
        providerId: provider.id,
        providerName: provider.name,
      };
    });

    const map = new Map<string, MultiAIConfig>();
    models.forEach((m) => map.set(m.id, m));
    newItems.forEach((m) => map.set(m.id, m));
    const merged = Array.from(map.values());

    const updated = await WailsService.saveAIModels(merged);
    setModels(updated);
    notifySave(`Đã thêm ${newItems.length} model từ ${provider.name} vào IDE!`);
    onRefreshModels?.();
  };

  // Manual Add Model (with autofill)
  const handleManualModelChange = (raw: string) => {
    setManualModelName(raw);
    if (!manualDisplayName || manualDisplayName === manualModelName) {
      setManualDisplayName(raw);
    }
    if (!manualModelId || manualModelId === manualModelName.replace(/[^a-zA-Z0-9_-]/g, '-')) {
      setManualModelId(raw.replace(/[^a-zA-Z0-9_-]/g, '-'));
    }
  };

  const handleSaveManualModel = async () => {
    if (!manualModelName.trim()) {
      notifySave('⚠️ Vui lòng nhập tên Model');
      return;
    }

    const currentProv = providers.find((p) => p.id === selectedProviderId) || providers[0] || {
      id: 'default',
      baseUrl: 'http://127.0.0.1:5050/v1',
      apiKey: 'free',
      name: 'Bridge',
    };

    const finalId = (manualModelId.trim() || manualModelName.trim()).replace(/[^a-zA-Z0-9_-]/g, '-');
    const finalName = manualDisplayName.trim() || manualModelName.trim();

    const cfg: MultiAIConfig = {
      id: finalId,
      name: finalName,
      baseUrl: currentProv.baseUrl,
      apiKey: currentProv.apiKey || 'free',
      model: manualModelName.trim(),
      providerId: currentProv.id,
    };

    const updated = await WailsService.addAIModel(cfg);
    setModels(updated);
    setShowAddManualModel(false);
    setManualModelName('');
    setManualDisplayName('');
    setManualModelId('');
    notifySave(`Đã thêm model: ${cfg.name}`);
    onRefreshModels?.();
  };

  // Delete model
  const handleDeleteModel = async (id: string) => {
    const updated = await WailsService.removeAIModel(id);
    setModels(updated);
    notifySave(`Đã gỡ model khỏi IDE`);
    onRefreshModels?.();
  };

  // General Settings Save
  const handleSaveGeneralSetting = async (key: string, val: string) => {
    await WailsService.saveSetting(key, val);
    notifySave(`Đã lưu thiết lập ${key}`);
  };

  // Currently selected Provider in left sub-list
  const activeProvider = providers.find((p) => p.id === selectedProviderId);
  const activeScannedList = activeProvider ? scannedMap[activeProvider.id] || [] : [];
  const activeScanError = activeProvider ? scanErrorMap[activeProvider.id] : '';
  const isCurrentlyScanning = activeProvider ? scanningId === activeProvider.id : false;

  // Filtered Scanned Models
  const filteredScannedModels = activeScannedList.filter((mId) => {
    const q = modelSearchQuery.toLowerCase();
    const matchesSearch = !q || mId.toLowerCase().includes(q);
    const isAdded = models.some((m) => m.id === mId || m.model === mId);
    const isFree = mId.toLowerCase().includes(':free') || mId.toLowerCase().includes('free');

    if (modelTypeFilter === 'added') return matchesSearch && isAdded;
    if (modelTypeFilter === 'not_added') return matchesSearch && !isAdded;
    if (modelTypeFilter === 'free') return matchesSearch && isFree;
    return matchesSearch;
  });

  // Filtered Active Models
  const filteredActiveModels = models.filter((m) => {
    const q = modelSearchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      m.baseUrl.toLowerCase().includes(q);

    const isFree = m.baseUrl.includes('5050') || m.apiKey === 'free' || m.id.includes('free');
    if (modelTypeFilter === 'free') return matchesSearch && isFree;
    return matchesSearch;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: '980px',
          maxWidth: '96vw',
          height: '690px',
          maxHeight: '94vh',
          background: 'rgba(28, 28, 30, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f4f4f5',
          backdropFilter: 'blur(30px)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(22, 22, 24, 0.5)',
          }}
        >
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: '#f5f5f7', letterSpacing: '-0.2px' }}>
            Cài đặt
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#8e8e93',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            className="hover:text-white hover:bg-white/15"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Main Left Sidebar */}
          <div
            style={{
              width: '190px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(20, 20, 22, 0.6)',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              overflowY: 'auto',
            }}
          >
            {[
              { id: 'providers', label: 'AI Providers & Models', badge: `${models.length}` },
              { id: 'mcp', label: 'MCP Servers', badge: 'Protocol' },
              { id: 'multi_ai', label: 'Multi-AI Pipeline' },
              { id: 'general', label: 'Khởi động & Hành vi' },
              { id: 'editor', label: 'Monaco Editor' },
              { id: 'shortcuts', label: 'Phím tắt' },
              { id: 'storage', label: 'Storage & SQLite' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    color: isActive ? '#ffffff' : '#8e8e93',
                    fontSize: '12.5px',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease',
                  }}
                  className="hover:bg-white/5"
                >
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#8e8e93',
                        padding: '1px 7px',
                        borderRadius: '9999px',
                        fontWeight: 500,
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Content Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#18181b' }}>
            {savedNotice && (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid #22c55e',
                  color: '#4ade80',
                  padding: '7px 14px',
                  margin: '12px 16px 0 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Check size={14} />
                <span>{savedNotice}</span>
              </div>
            )}

            {/* TAB: AI PROVIDERS & MODELS (2-PANE WORKSPACE) */}
            {activeTab === 'providers' && (
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* 1. Left Sub-Pane: List of Providers & Active Category */}
                <div
                  style={{
                    width: '270px',
                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(24, 24, 26, 0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top Action: Add Provider */}
                  <div style={{ padding: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setEditingProviderObj(null);
                        setProvName(PRESET_PROVIDERS[0].name);
                        setProvBaseUrl(PRESET_PROVIDERS[0].baseUrl);
                        setProvApiKey(PRESET_PROVIDERS[0].apiKey);
                        setShowAddProvider(true);
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#f4f4f5',
                        borderRadius: '9999px',
                        padding: '7px 12px',
                        fontSize: '11.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      className="hover:bg-white/15"
                    >
                      <Plus size={13} />
                      Thêm Provider API
                    </button>
                    <button
                      onClick={handleTestBridge}
                      disabled={isTestingBridge}
                      title="Kiểm tra kết nối OpenCode Bridge port 5050"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f4f4f5',
                        borderRadius: '9999px',
                        padding: '7px 11px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      className="hover:bg-white/10"
                    >
                      <RefreshCw size={13} className={isTestingBridge ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  {/* List of Provider Buttons */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
                    {/* Item 1: Active Models in IDE */}
                    <div
                      onClick={() => {
                        setSelectedProviderId('active_models');
                        setModelSearchQuery('');
                        setModelTypeFilter('all');
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        marginBottom: '10px',
                        background: selectedProviderId === 'active_models' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${selectedProviderId === 'active_models' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                      }}
                      className="hover:border-white/20"
                    >
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#f4f4f5' }}>Models Trong IDE</div>
                        <div style={{ fontSize: '11px', color: '#8e8e93', marginTop: '1px' }}>Đang dùng trong chat & agent</div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.12)',
                          color: '#f4f4f5',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                        }}
                      >
                        {models.length}
                      </span>
                    </div>

                    <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '6px 6px 4px' }}>
                      Cổng API Providers ({providers.length})
                    </div>

                    {/* Providers Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {providers.map((p) => {
                        const isSelected = selectedProviderId === p.id;
                        const count = (scannedMap[p.id] || []).length;
                        const isEditing = editingProviderId === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedProviderId(p.id);
                              setModelSearchQuery('');
                              setModelTypeFilter('all');
                            }}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '12px',
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                              border: '1px solid transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'all 0.12s ease',
                            }}
                            className="hover:bg-white/5"
                          >
                            <div style={{ overflow: 'hidden' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editProvName}
                                    onChange={(e) => setEditProvName(e.target.value)}
                                    style={{ width: '120px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: '11px', padding: '3px 6px', borderRadius: '6px' }}
                                  />
                                  <button
                                    onClick={() => handleSaveRenameProvider(p.id)}
                                    style={{ background: 'rgba(255, 255, 255, 0.15)', border: 'none', color: '#fff', fontSize: '10px', padding: '3px 8px', borderRadius: '9999px', cursor: 'pointer' }}
                                  >
                                    Lưu
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#ffffff' : '#d4d4d8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {p.name}
                                  </div>
                                  <div style={{ fontSize: '10.5px', color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
                                    {p.baseUrl}
                                  </div>
                                </>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              {count > 0 && (
                                <span style={{ fontSize: '10px', color: '#8e8e93', background: 'rgba(255, 255, 255, 0.08)', padding: '1px 6px', borderRadius: '9999px' }}>
                                  {count}
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditProvider(p);
                                }}
                                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '3px' }}
                                title="Chỉnh sửa Provider"
                                className="hover:text-white"
                              >
                                <Edit2 size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProvider(p.id);
                                }}
                                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '3px' }}
                                title={`Xóa Provider ${p.name}`}
                                className="hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. Right Sub-Pane: Search & Models View */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px' }}>
                  {/* Top Bar of Right Pane */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      {selectedProviderId === 'active_models' ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={17} color="#a1a1aa" />
                            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Models Trong IDE ({models.length})</h3>
                          </div>
                          <p style={{ fontSize: '11.5px', color: '#a1a1aa', margin: '3px 0 0' }}>
                            Các model đang được nạp vào IDE để bạn chọn và sử dụng trong cửa sổ chat / Agent.
                          </p>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Server size={17} color="#38bdf8" />
                            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{activeProvider?.name}</h3>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '3px 0 0' }}>
                            <div style={{ fontSize: '11.5px', color: '#71717a', fontFamily: 'monospace' }}>
                              Endpoint: <span style={{ color: '#38bdf8' }}>{activeProvider?.baseUrl}</span>
                            </div>
                            <button
                              onClick={() => activeProvider && handleOpenEditProvider(activeProvider)}
                              style={{
                                background: 'rgba(56, 189, 248, 0.1)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38bdf8',
                                borderRadius: '4px',
                                padding: '1px 7px',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              className="hover:bg-sky-500/20"
                              title="Chỉnh sửa URL hoặc API Key"
                            >
                              <Edit2 size={10} /> Sửa URL / API Key
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {selectedProviderId === 'active_models' ? (
                        <button
                          onClick={() => setShowAddManualModel(true)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            color: '#f4f4f5',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '11.5px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                          className="hover:bg-white/10"
                        >
                          <Plus size={13} />
                          Thêm Model Thủ Công
                        </button>
                      ) : (
                        activeProvider && (
                          <>
                            <button
                              onClick={() => handleScanProvider(activeProvider)}
                              disabled={isCurrentlyScanning}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: isCurrentlyScanning ? '#27272a' : '#0284c7',
                                border: 'none',
                                color: '#ffffff',
                                borderRadius: '6px',
                                padding: '6px 14px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: isCurrentlyScanning ? 'default' : 'pointer',
                              }}
                              className={isCurrentlyScanning ? '' : 'hover:bg-sky-600'}
                            >
                              <RefreshCw size={13} className={isCurrentlyScanning ? 'animate-spin' : ''} />
                              {isCurrentlyScanning ? 'Đang kết nối API...' : 'Quét Models từ API'}
                            </button>
                            {activeScannedList.length > 0 && (
                              <button
                                onClick={() => handleImportModelsList(activeProvider, filteredScannedModels)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  background: '#27272a',
                                  border: '1px solid #3f3f46',
                                  color: '#38bdf8',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                className="hover:bg-sky-500/10"
                              >
                                <Download size={13} />
                                Kéo {filteredScannedModels.length} model về IDE
                              </button>
                            )}
                          </>
                        )
                      )}
                    </div>
                  </div>

                  {/* Quick Provider Configuration Bar */}
                  {selectedProviderId !== 'active_models' && activeProvider && (
                    <div
                      style={{
                        background: 'rgba(24, 24, 27, 0.8)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '180px' }}>
                          <span style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Endpoint / Base URL</span>
                          <span style={{ fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={activeProvider.baseUrl}>
                            {activeProvider.baseUrl || '(Chưa cấu hình URL)'}
                          </span>
                        </div>
                        <div style={{ width: '1px', height: '24px', background: '#27272a' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>API Key</span>
                          <span style={{ fontSize: '12px', color: activeProvider.apiKey ? '#4ade80' : '#f87171', fontFamily: 'monospace' }}>
                            {activeProvider.apiKey ? '••••••••••••••••' : '(Trống - Nhấn Sửa để nhập)'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenEditProvider(activeProvider)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          color: '#38bdf8',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        className="hover:bg-sky-500/25 transition-colors"
                      >
                        <Edit2 size={12} /> Cấu Hình API Key & URL
                      </button>
                    </div>
                  )}

                  {/* PROMINENT SEARCH BAR & FILTERS */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#71717a' }} />
                      <input
                        type="text"
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        placeholder={
                          selectedProviderId === 'active_models'
                            ? '🔍 Tìm kiếm model theo tên, ID, provider... (VD: nemotron, glm, deepseek)'
                            : `🔍 Tìm kiếm trong ${activeScannedList.length} model từ API... (VD: free, deepseek, claude, llama, gpt)`
                        }
                        style={{
                          width: '100%',
                          background: '#141416',
                          border: '1px solid #27272a',
                          borderRadius: '6px',
                          padding: '7px 10px 7px 32px',
                          color: '#f4f4f5',
                          fontSize: '12.5px',
                        }}
                      />
                      {modelSearchQuery && (
                        <button
                          onClick={() => setModelSearchQuery('')}
                          style={{ position: 'absolute', right: '8px', top: '7px', background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Filter Pills */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => setModelTypeFilter('all')}
                        style={{
                          background: modelTypeFilter === 'all' ? '#27272a' : '#141416',
                          border: `1px solid ${modelTypeFilter === 'all' ? '#38bdf8' : '#27272a'}`,
                          color: modelTypeFilter === 'all' ? '#38bdf8' : '#a1a1aa',
                          borderRadius: '6px',
                          padding: '0 10px',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Tất cả
                      </button>
                      <button
                        onClick={() => setModelTypeFilter('free')}
                        style={{
                          background: modelTypeFilter === 'free' ? 'rgba(34, 197, 94, 0.15)' : '#141416',
                          border: `1px solid ${modelTypeFilter === 'free' ? '#22c55e' : '#27272a'}`,
                          color: modelTypeFilter === 'free' ? '#4ade80' : '#a1a1aa',
                          borderRadius: '6px',
                          padding: '0 10px',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Chỉ Free
                      </button>
                      {selectedProviderId !== 'active_models' && (
                        <>
                          <button
                            onClick={() => setModelTypeFilter('added')}
                            style={{
                              background: modelTypeFilter === 'added' ? '#27272a' : '#141416',
                              border: `1px solid ${modelTypeFilter === 'added' ? '#38bdf8' : '#27272a'}`,
                              color: modelTypeFilter === 'added' ? '#38bdf8' : '#a1a1aa',
                              borderRadius: '6px',
                              padding: '0 10px',
                              fontSize: '11px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Đã có
                          </button>
                          <button
                            onClick={() => setModelTypeFilter('not_added')}
                            style={{
                              background: modelTypeFilter === 'not_added' ? '#27272a' : '#141416',
                              border: `1px solid ${modelTypeFilter === 'not_added' ? '#38bdf8' : '#27272a'}`,
                              color: modelTypeFilter === 'not_added' ? '#38bdf8' : '#a1a1aa',
                              borderRadius: '6px',
                              padding: '0 10px',
                              fontSize: '11px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Chưa thêm
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Scan Error Message */}
                  {activeScanError && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#fca5a5', marginBottom: '10px' }}>
                      {activeScanError}
                    </div>
                  )}

                  {/* CONTENT: ACTIVE MODELS LIST (If active_models tab) */}
                  {selectedProviderId === 'active_models' && (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>
                      {filteredActiveModels.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', background: '#141416', border: '1px dashed #27272a', borderRadius: '8px', color: '#71717a' }}>
                          <Zap size={22} style={{ margin: '0 auto 6px', opacity: 0.5 }} />
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>Không tìm thấy model nào</div>
                          <div style={{ fontSize: '11.5px', marginTop: '4px' }}>
                            Chọn một Provider ở cột bên trái để quét và kéo thêm model về IDE!
                          </div>
                        </div>
                      ) : (
                        (() => {
                          // Gom nhóm theo Nhà cung cấp (Provider)
                          const groupsMap = new Map<string, { providerName: string; baseUrl?: string; list: MultiAIConfig[] }>();
                          filteredActiveModels.forEach((m) => {
                            const pName = getProviderNameForModel(m, providers);
                            if (!groupsMap.has(pName)) {
                              groupsMap.set(pName, {
                                providerName: pName,
                                baseUrl: m.baseUrl,
                                list: [],
                              });
                            }
                            groupsMap.get(pName)!.list.push(m);
                          });

                          return Array.from(groupsMap.values()).map((grp) => (
                            <div key={grp.providerName} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {/* Tiêu đề in tên nhà cung cấp trên cùng mỗi bộ model */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 12px',
                                  background: 'rgba(39, 39, 42, 0.7)',
                                  borderRadius: '6px',
                                  borderLeft: '4px solid #0284c7',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Server size={14} color="#a1a1aa" />
                                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f4f4f5' }}>
                                    {grp.providerName}
                                  </span>
                                  {grp.baseUrl && (
                                    <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                                      ({grp.baseUrl})
                                    </span>
                                  )}
                                </div>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    color: '#a1a1aa',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid #27272a',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontWeight: 500,
                                  }}
                                >
                                  {grp.list.length} model
                                </span>
                              </div>

                              {/* Danh sách các model thuộc nhà cung cấp này */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' }}>
                                {grp.list.map((m) => {
                                  const isSelected = selectedModel === m.id || selectedModel === m.model;
                                  const isFree = m.baseUrl.includes('5050') || m.apiKey === 'free' || m.id.includes('free');
                                  return (
                                    <div
                                      key={m.id}
                                      style={{
                                        background: isSelected ? 'rgba(255, 255, 255, 0.04)' : '#202024',
                                        border: `1px solid ${isSelected ? '#3f3f46' : '#27272a'}`,
                                        borderRadius: '8px',
                                        padding: '9px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                      }}
                                      className="hover:border-zinc-500"
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>{m.name}</span>
                                          {isFree && (
                                            <span style={{ fontSize: '9.5px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#a1a1aa', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }}>
                                              Free Bridge
                                            </span>
                                          )}
                                          {isSelected && (
                                            <span style={{ fontSize: '9.5px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid #3f3f46', color: '#f4f4f5', padding: '1px 5px', borderRadius: '4px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                              <CheckCircle2 size={10} /> Đang dùng trong Chat
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                                          ID: <span style={{ color: '#a1a1aa' }}>{m.id}</span> | Model: <span style={{ color: '#a1a1aa' }}>{m.model}</span> | Endpoint: <span style={{ color: '#a1a1aa' }}>{m.baseUrl}</span>
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {!isSelected && onSelectModel && (
                                          <button
                                            onClick={() => {
                                              onSelectModel(m.id);
                                              notifySave(`Đã kích hoạt model: ${m.name}`);
                                            }}
                                            style={{
                                              background: '#27272a',
                                              border: '1px solid #3f3f46',
                                              color: '#f4f4f5',
                                              borderRadius: '4px',
                                              padding: '4px 10px',
                                              fontSize: '11px',
                                              cursor: 'pointer',
                                            }}
                                            className="hover:border-sky-500"
                                          >
                                            Dùng model này
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleDeleteModel(m.id)}
                                          style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '5px' }}
                                          className="hover:text-red-400"
                                          title="Gỡ model này khỏi IDE"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  )}

                  {/* CONTENT: SCANNED MODELS OF SELECTED PROVIDER */}
                  {selectedProviderId !== 'active_models' && activeProvider && (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {activeScannedList.length === 0 ? (
                        <div style={{ padding: '36px', textAlign: 'center', background: '#141416', border: '1px dashed #27272a', borderRadius: '8px', color: '#71717a' }}>
                          <Server size={24} style={{ margin: '0 auto 8px', color: '#38bdf8', opacity: 0.8 }} />
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#d4d4d8' }}>Chưa quét danh sách model từ API này</div>
                          <div style={{ fontSize: '11.5px', marginTop: '6px', color: '#a1a1aa' }}>
                            Nhấn nút <strong>"Quét Models từ API"</strong> ở góc trên bên phải để kết nối tới{' '}
                            <code>{activeProvider.baseUrl.trim().replace(/\/+$/, '').replace(/\/models\/?$/i, '')}/models</code> và tải về danh sách model.
                          </div>
                          <button
                            onClick={() => handleScanProvider(activeProvider)}
                            disabled={isCurrentlyScanning}
                            style={{
                              margin: '14px auto 0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#0284c7',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <RefreshCw size={13} className={isCurrentlyScanning ? 'animate-spin' : ''} />
                            Quét Models Ngay
                          </button>
                        </div>
                      ) : filteredScannedModels.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                          Không tìm thấy model nào khớp với bộ lọc "{modelSearchQuery}". Hãy thử từ khóa khác!
                        </div>
                      ) : (
                        filteredScannedModels.map((mName) => {
                          const existingModel = models.find(
                            (m) =>
                              (m.providerId === activeProvider.id ||
                                (m.baseUrl &&
                                  activeProvider.baseUrl &&
                                  m.baseUrl.replace(/\/+$/, '') === activeProvider.baseUrl.replace(/\/+$/, ''))) &&
                              (m.model === mName || m.id === `${activeProvider.id}_${mName}`)
                          );
                          const isAdded = Boolean(existingModel);
                          const isFree = mName.toLowerCase().includes(':free') || mName.toLowerCase().includes('free');
                          return (
                            <div
                              key={mName}
                              style={{
                                background: isAdded ? 'rgba(34, 197, 94, 0.05)' : '#202024',
                                border: `1px solid ${isAdded ? 'rgba(34, 197, 94, 0.3)' : '#27272a'}`,
                                borderRadius: '6px',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                              className="hover:border-zinc-500"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '12.5px', color: isAdded ? '#86efac' : '#f4f4f5' }}>
                                  {mName}
                                </span>
                                {isFree && (
                                  <span style={{ fontSize: '9px', background: 'rgba(34, 197, 94, 0.18)', color: '#4ade80', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                                    Free
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                {isAdded ? (
                                  <>
                                    <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <CheckCircle2 size={12} /> Đã có trong IDE
                                    </span>
                                    {onSelectModel && selectedModel !== (existingModel?.id || mName) && (
                                      <button
                                        onClick={() => {
                                          const targetId = existingModel ? existingModel.id : mName;
                                          onSelectModel(targetId);
                                          notifySave(`Đã kích hoạt model: ${existingModel?.name || mName}`);
                                        }}
                                        style={{
                                          background: '#27272a',
                                          border: '1px solid #3f3f46',
                                          color: '#f4f4f5',
                                          borderRadius: '4px',
                                          padding: '3px 8px',
                                          fontSize: '10.5px',
                                          cursor: 'pointer',
                                        }}
                                        className="hover:border-sky-500"
                                      >
                                        Dùng ngay
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleImportSingleModel(activeProvider, mName)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#0284c7',
                                      border: 'none',
                                      color: '#ffffff',
                                      borderRadius: '4px',
                                      padding: '4px 10px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                    className="hover:bg-sky-600"
                                  >
                                    <Plus size={12} />
                                    Thêm vào IDE
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: MCP SERVERS (MODEL CONTEXT PROTOCOL) */}
            {activeTab === 'mcp' && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Server size={18} color="#06b6d4" />
                      <span>Model Context Protocol (MCP) Servers</span>
                    </h3>
                    <p style={{ fontSize: '12px', color: '#a1a1aa', margin: 0 }}>
                      Mở rộng năng lực của Antigravity Agent thông qua kết nối MCP tiêu chuẩn (Stdio JSON-RPC).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      WailsService.getMCPServers().then((res) => {
                        if (res && Array.isArray(res)) setMcpServers(res);
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#27272a',
                      color: '#e4e4e7',
                      border: '1px solid #3f3f46',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                    className="hover:bg-zinc-700"
                  >
                    <RefreshCw size={13} />
                    <span>Làm mới</span>
                  </button>
                </div>

                {/* Preset MCP Servers */}
                <div style={{ background: '#1c1c20', border: '1px solid #27272a', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8', marginBottom: '10px' }}>
                    Thêm nhanh mẫu MCP Server phổ biến:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      { name: 'sqlite', cmd: 'uvx', args: 'mcp-server-sqlite --db-path ./antigravity.db' },
                      { name: 'figma', cmd: 'npx', args: '-y @modelcontextprotocol/server-figma' },
                      { name: 'github', cmd: 'npx', args: '-y @modelcontextprotocol/server-github' },
                      { name: 'postgres', cmd: 'npx', args: '-y @modelcontextprotocol/server-postgres postgresql://localhost/mydb' },
                    ].map((pre) => (
                      <button
                        key={pre.name}
                        onClick={() => {
                          setNewMcpName(pre.name);
                          setNewMcpCommand(pre.cmd);
                          setNewMcpArgs(pre.args);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          background: '#27272a',
                          border: '1px solid #3f3f46',
                          color: '#f4f4f5',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                        className="hover:bg-sky-950 hover:border-sky-500"
                      >
                        + {pre.name.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add new MCP Server form */}
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '12px' }}>
                    Cấu hình MCP Server Mới
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Server Name</label>
                      <input
                        value={newMcpName}
                        onChange={(e) => setNewMcpName(e.target.value)}
                        placeholder="ví dụ: sqlite, figma, rea"
                        style={{
                          width: '100%',
                          background: '#121214',
                          border: '1px solid #3f3f46',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          color: '#ffffff',
                          fontSize: '12px',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Command executable</label>
                      <input
                        value={newMcpCommand}
                        onChange={(e) => setNewMcpCommand(e.target.value)}
                        placeholder="npx, uvx, node, python"
                        style={{
                          width: '100%',
                          background: '#121214',
                          border: '1px solid #3f3f46',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          color: '#ffffff',
                          fontSize: '12px',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11.5px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Arguments (cách nhau bởi dấu cách)</label>
                    <input
                      value={newMcpArgs}
                      onChange={(e) => setNewMcpArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-figma"
                      style={{
                        width: '100%',
                        background: '#121214',
                        border: '1px solid #3f3f46',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        color: '#ffffff',
                        fontSize: '12px',
                        outline: 'none',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '11.5px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Environment Variables (Mỗi dòng một cặp KEY=VALUE)</label>
                    <textarea
                      value={newMcpEnv}
                      onChange={(e) => setNewMcpEnv(e.target.value)}
                      placeholder="FIGMA_PERSONAL_ACCESS_TOKEN=xxx"
                      rows={2}
                      style={{
                        width: '100%',
                        background: '#121214',
                        border: '1px solid #3f3f46',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        color: '#ffffff',
                        fontSize: '11.5px',
                        outline: 'none',
                        fontFamily: 'monospace',
                        resize: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSaveMcpServer}
                    disabled={mcpLoading || !newMcpName.trim() || !newMcpCommand.trim()}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '6px',
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: (!newMcpName.trim() || !newMcpCommand.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (!newMcpName.trim() || !newMcpCommand.trim()) ? 0.6 : 1,
                    }}
                  >
                    {mcpLoading ? 'Đang lưu...' : '+ Lưu MCP Server'}
                  </button>
                </div>

                {/* List of active servers */}
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginBottom: '10px' }}>
                  Danh sách MCP Servers Đã Đăng Ký ({mcpServers.length})
                </h4>
                {mcpServers.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '12px', background: '#141416', borderRadius: '8px', border: '1px dashed #27272a' }}>
                    Chưa có MCP server nào được đăng ký. Bạn có thể chọn mẫu phía trên để thêm nhanh.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {mcpServers.map((s: any) => (
                      <div
                        key={s.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#141416',
                          border: '1px solid #27272a',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                              {s.name}
                            </span>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: '#27272a', color: '#a1a1aa' }}>
                              {s.status || 'configured'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                            {s.command} {Array.isArray(s.args) ? s.args.join(' ') : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteMcpServer(s.name)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                          className="hover:bg-red-950"
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: MULTI-AI PIPELINE */}
            {activeTab === 'multi_ai' && (
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Cấu hình Multi-AI Orchestrator</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '16px' }}>
                  Thiết lập chiến lược thực thi và giới hạn tài nguyên cho Multi-AI Workspace.
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    Chiến lược mặc định (Default Execution Strategy)
                  </label>
                  <select
                    value={multiAIStrategy}
                    onChange={(e) => {
                      setMultiAIStrategy(e.target.value);
                      handleSaveGeneralSetting('multi_ai_strategy', e.target.value);
                    }}
                    style={{ background: '#202024', border: '1px solid #3f3f46', borderRadius: '6px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', width: '100%' }}
                  >
                    <option value="sequential">Sequential — Chạy tuần tự từ trên xuống dưới (Kèm truyền context)</option>
                    <option value="parallel">Parallel — Chạy song song độc lập với Concurrency Limit</option>
                    <option value="pipeline">Pipeline / DAG — Giải quyết đồ thị phụ thuộc (Dependency Resolution)</option>
                    <option value="consensus">Consensus / Review — Đối chiếu đồng thuận & mâu thuẫn</option>
                    <option value="implement_fix">Implement → Review → Fix (Quy trình khép kín tự sửa lỗi)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    Giới hạn số AI chạy song song (Concurrency Limit)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={concurrencyLimit}
                    onChange={(e) => {
                      setConcurrencyLimit(e.target.value);
                      handleSaveGeneralSetting('concurrency_limit', e.target.value);
                    }}
                    style={{ background: '#202024', border: '1px solid #3f3f46', borderRadius: '6px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', width: '100px' }}
                  />
                  <span style={{ fontSize: '11px', color: '#71717a', marginLeft: '10px' }}>
                    Khuyến nghị 2 - 4 luồng đồng thời để bảo đảm hiệu năng API bridge.
                  </span>
                </div>
              </div>
            )}

            {/* TAB: GENERAL */}
            {activeTab === 'general' && (
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Cấu hình Chung</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '16px' }}>Tùy biến hành vi khởi động ứng dụng TTG IDE.</p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    Chế độ khởi động mặc định (Startup Mode)
                  </label>
                  <select
                    value={startupMode}
                    onChange={(e) => {
                      setStartupMode(e.target.value);
                      handleSaveGeneralSetting('startup_mode', e.target.value);
                    }}
                    style={{ background: '#202024', border: '1px solid #3f3f46', borderRadius: '6px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', width: '100%' }}
                  >
                    <option value="vibe">AI Workspace (Giao diện Antigravity Conversation)</option>
                    <option value="ide">IDE Workspace (Giao diện VS Code Full Editor)</option>
                    <option value="multi-ai">Multi-AI Workspace (Multi-Agent Vertical Pipeline)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px', padding: '14px', background: '#18181b', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label style={{ fontSize: '13px', color: '#f4f4f5', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                      Thanh công cụ tác vụ trong Vibe Coding (Plan, CMD, Code, Browser)
                    </label>
                    <span style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
                      Bật hoặc ẩn thanh theo dõi tiến độ kế hoạch và lệnh chạy ở dưới khung chat màn hình Vibe Coding.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = localStorage.getItem('ttgide_show_vibe_toolbar') !== 'false';
                      const next = !current;
                      localStorage.setItem('ttgide_show_vibe_toolbar', String(next));
                      window.dispatchEvent(new Event('ttgide_toggle_toolbar'));
                      setVibeToolbarEnabled(next);
                    }}
                    style={{
                      background: vibeToolbarEnabled ? '#0284c7' : '#27272a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginLeft: '12px',
                    }}
                  >
                    {vibeToolbarEnabled ? 'Đang Bật' : 'Đang Ẩn'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: EDITOR */}
            {activeTab === 'editor' && (
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Monaco Code Editor</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '16px' }}>Tùy chỉnh font chữ, tab size và chế độ cuộn trang.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Tab Size</label>
                    <select
                      value={tabSize}
                      onChange={(e) => {
                        setTabSize(e.target.value);
                        handleSaveGeneralSetting('editor_tab_size', e.target.value);
                      }}
                      style={{ background: '#202024', border: '1px solid #3f3f46', borderRadius: '6px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', width: '100%' }}
                    >
                      <option value="2">2 Spaces</option>
                      <option value="4">4 Spaces</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Word Wrap</label>
                    <select
                      value={wordWrap}
                      onChange={(e) => {
                        setWordWrap(e.target.value);
                        handleSaveGeneralSetting('editor_word_wrap', e.target.value);
                      }}
                      style={{ background: '#202024', border: '1px solid #3f3f46', borderRadius: '6px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', width: '100%' }}
                    >
                      <option value="on">Bật (Wrap dòng tự động)</option>
                      <option value="off">Tắt (Thanh cuộn ngang)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SHORTCUTS */}
            {activeTab === 'shortcuts' && (
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Bảng Phím Tắt Toàn Cục</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '16px' }}>Tăng tốc độ làm việc với các tổ hợp phím tắt chuẩn.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'Ctrl + M', desc: 'Chuyển đổi tức thì giữa IDE ↔ AI Workspace ↔ Multi-AI' },
                    { key: 'Ctrl + 1 / 2 / 3', desc: 'Chuyển trực tiếp tới IDE (1), AI Workspace (2), Multi-AI (3)' },
                    { key: 'Ctrl + Shift + P', desc: 'Mở Command Palette tìm kiếm lệnh nhanh' },
                    { key: 'Ctrl + ,', desc: 'Mở Cài đặt hệ thống & AI Providers' },
                    { key: 'Ctrl + O', desc: 'Mở thư mục dự án (Open Workspace Folder)' },
                    { key: 'Ctrl + S', desc: 'Lưu tệp tin hiện tại' },
                    { key: 'Ctrl + Enter', desc: 'Gửi prompt hoặc Chạy toàn bộ pipeline Multi-AI' },
                    { key: 'Ctrl + Z', desc: 'Khôi phục về Checkpoint gần nhất (1-Click Rollback)' },
                  ].map((sc) => (
                    <div
                      key={sc.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: '#202024',
                        border: '1px solid #27272a',
                        borderRadius: '6px',
                      }}
                    >
                      <span style={{ fontSize: '13px', color: '#d4d4d8' }}>{sc.desc}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#141416', border: '1px solid #333338', padding: '3px 8px', borderRadius: '4px', color: '#38bdf8' }}>
                        {sc.key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: STORAGE */}
            {activeTab === 'storage' && (
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Cơ sở dữ liệu SQLite & Lưu trữ</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '16px' }}>Dữ liệu lưu trữ cục bộ tại <code>.ttgide/ttgide.db</code> và cấu hình toàn cục tại <code>%APPDATA%\TaitestgameIDE</code>.</p>
                <div style={{ background: '#202024', border: '1px solid #27272a', borderRadius: '8px', padding: '14px', fontSize: '12px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ color: '#71717a' }}>Vị trí SQLite: </span>
                    <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>.ttgide/ttgide.db</span>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ color: '#71717a' }}>Cấu hình Toàn Cục: </span>
                    <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>%APPDATA%/TaitestgameIDE/models.json</span>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ color: '#71717a' }}>Trạng thái: </span>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>Active & Synchronized</span>
                  </div>
                  <div style={{ color: '#71717a' }}>
                    Tự động lưu toàn bộ AI models, providers, phiên hội thoại, lịch sử Multi-AI runs, checkpoints, và memory dự án.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODAL OVERLAY: Thêm Provider API Mới */}
        {showAddProvider && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            <div
              style={{
                width: '460px',
                background: '#1a1a20',
                border: '1px solid #38bdf8',
                borderRadius: '10px',
                padding: '18px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={16} color="#38bdf8" />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#f4f4f5' }}>
                    {editingProviderObj ? `Chỉnh sửa Cổng API: ${editingProviderObj.name}` : 'Kết nối Cổng API Provider'}
                  </span>
                </div>
                <button onClick={() => setShowAddProvider(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                  <X size={15} />
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Chọn mẫu API có sẵn (Preset)</label>
                <select
                  value={providerPreset}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  style={{ width: '100%', background: '#141416', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px 10px', color: '#f4f4f5', fontSize: '12px' }}
                >
                  {PRESET_PROVIDERS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Tên hiển thị Provider (Đặt tên tùy ý)</label>
                <input
                  type="text"
                  value={provName}
                  onChange={(e) => setProvName(e.target.value)}
                  placeholder="ví dụ: OpenRouter Gateway"
                  style={{ width: '100%', background: '#141416', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px 10px', color: '#f4f4f5', fontSize: '12px' }}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Base URL (OpenAI-compatible)</label>
                <input
                  type="text"
                  value={provBaseUrl}
                  onChange={(e) => setProvBaseUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  style={{ width: '100%', background: '#141416', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px 10px', color: '#f4f4f5', fontSize: '12px' }}
                />
                <div style={{ fontSize: '10.5px', color: '#71717a', marginTop: '3px' }}>
                  💡 <strong>Lưu ý:</strong> Chỉ nhập đến <code>/v1</code> hoặc <code>/api/v1</code> (không cần thêm <code>/models</code> ở cuối).
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>API Key (Bỏ qua hoặc nhập 'free' nếu là local bridge / Ollama)</label>
                <input
                  type="password"
                  value={provApiKey}
                  onChange={(e) => setProvApiKey(e.target.value)}
                  placeholder="sk-... hoặc để trống"
                  style={{ width: '100%', background: '#141416', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px 10px', color: '#f4f4f5', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => setShowAddProvider(false)} style={{ background: '#27272a', border: 'none', color: '#a1a1aa', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>
                  Hủy
                </button>
                <button
                  onClick={() => handleSaveProvider(true)}
                  style={{ background: '#0284c7', border: 'none', color: '#ffffff', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={13} />
                  Lưu & Quét Model Ngay
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL OVERLAY: Thêm Model Lẻ Thủ Công */}
        {showAddManualModel && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            <div
              style={{
                width: '440px',
                background: '#1a1a20',
                border: '1px solid #38bdf8',
                borderRadius: '10px',
                padding: '18px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} color="#38bdf8" />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#f4f4f5' }}>Thêm Model Lẻ Vào IDE</span>
                </div>
                <button onClick={() => setShowAddManualModel(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                  <X size={15} />
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>
                  Mã Model (Model API Name) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={manualModelName}
                  onChange={(e) => handleManualModelChange(e.target.value)}
                  placeholder="ví dụ: deepseek-chat hoặc llama3.2"
                  style={{ width: '100%', background: '#141416', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px 10px', color: '#f4f4f5', fontSize: '12px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Tên hiển thị trong IDE (Tự động điền)</label>
                <input
                  type="text"
                  value={manualDisplayName}
                  onChange={(e) => setManualDisplayName(e.target.value)}
                  placeholder="ví dụ: DeepSeek Chat (V3)"
                  style={{ width: '100%', background: '#141416', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px 10px', color: '#f4f4f5', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => setShowAddManualModel(false)} style={{ background: '#27272a', border: 'none', color: '#a1a1aa', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>
                  Hủy
                </button>
                <button
                  onClick={handleSaveManualModel}
                  style={{ background: '#0284c7', border: 'none', color: '#ffffff', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Lưu Model Vào IDE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
