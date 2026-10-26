import React, { useState, useEffect } from 'react';
import {
  Layers,
  Play,
  Square,
  Plus,
  ArrowDown,
  RotateCcw,
  Copy,
  ChevronDown,
  ChevronUp,
  Brain,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  FileCode,
  Download,
  Trash2,
  ArrowUp,
  ArrowDown as ArrowDownIcon,
  Copy as DuplicateIcon,
  Cpu,
  Split,
  Eye,
  Check,
} from 'lucide-react';
import {
  MultiAINode,
  MultiAIStrategy,
  MultiAIRole,
  MultiAIConfig,
} from '../../types';
import { WailsService } from '../../services/wailsBridge';

interface MultiAIModeProps {
  workspace?: string;
  activeFile?: string;
  onApplyToEditor?: (content: string) => void;
  onOpenSettings?: () => void;
}

export const MultiAIMode: React.FC<MultiAIModeProps> = ({
  workspace,
  activeFile,
  onApplyToEditor,
  onOpenSettings,
}) => {
  const [sharedPrompt, setSharedPrompt] = useState(
    'Hãy phân tích dự án, tìm lỗi, đề xuất kiến trúc, triển khai sửa lỗi, viết test và đánh giá bảo mật.'
  );
  const [strategy, setStrategy] = useState<MultiAIStrategy>('sequential');
  const [isRunning, setIsRunning] = useState(false);
  const [activeModelConfigs, setActiveModelConfigs] = useState<MultiAIConfig[]>([]);

  // Default Pipeline Nodes (4-stage vertical pipeline)
  const [nodes, setNodes] = useState<MultiAINode[]>([
    {
      id: 'node-1',
      name: 'AI Planner (Lập kế hoạch & Kiến trúc)',
      role: 'planner',
      provider: 'OpenCode Free Bridge',
      model: 'glm-5.3-flash-free',
      systemInstruction:
        'Bạn là Principal Software Architect. Hãy phân tích yêu cầu, xác định phạm vi dự án, chia nhỏ thành các bước thực thi rõ ràng, xác định rủi ro và tiêu chí nghiệm thu.',
      contextSource: 'shared',
      status: 'idle',
      enabled: true,
    },
    {
      id: 'node-2',
      name: 'AI Implementer (Lập trình & Viết mã nguồn)',
      role: 'implementer',
      provider: 'OpenCode Free Bridge',
      model: 'deepseek-v4.1-flash-free',
      systemInstruction:
        'Bạn là Senior Full-Stack Engineer. Dựa trên kế hoạch đã lập, viết mã nguồn sạch sẽ, xử lý triệt để lỗi và tuân thủ các quy tắc trong dự án.',
      contextSource: 'previous',
      status: 'idle',
      enabled: true,
    },
    {
      id: 'node-3',
      name: 'AI Reviewer (Đánh giá mã & Bảo mật)',
      role: 'reviewer',
      provider: 'OpenCode Free Bridge',
      model: 'big-pickle',
      systemInstruction:
        'Bạn là Senior Code Reviewer và Security Auditor. Kiểm tra kỹ lưỡng mã nguồn đã viết, phát hiện các điểm nghẽn, lỗ hổng bảo mật hoặc ca biên chưa được xử lý.',
      contextSource: 'previous',
      status: 'idle',
      enabled: true,
    },
    {
      id: 'node-4',
      name: 'AI Final Synthesizer (Tổng hợp tối ưu)',
      role: 'synthesizer',
      provider: 'OpenCode Free Bridge',
      model: 'nemotron-3.5-lightning-free',
      systemInstruction:
        'Bạn là Lead Integrator. Hãy tổng hợp toàn bộ các phân tích, mã nguồn và phản biện trên thành một giải pháp hoàn chỉnh, sẵn sàng đưa vào áp dụng.',
      contextSource: 'shared',
      status: 'idle',
      enabled: true,
    },
  ]);

  // Collapsible nodes state
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'node-1': true,
    'node-2': true,
    'node-3': true,
    'node-4': true,
  });

  // Collapsible thinking tags state
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});

  // Comparison Modal state
  const [showComparison, setShowComparison] = useState(false);
  const [finalSynthesis, setFinalSynthesis] = useState<string>('');
  const [notification, setNotification] = useState<string | null>(null);

  // Load models from backend
  useEffect(() => {
    const loadModels = async () => {
      try {
        const m = await WailsService.getAIModels();
        setActiveModelConfigs(m);
      } catch (e) {
        console.error('Lỗi khi nạp models:', e);
      }
    };
    loadModels();
  }, []);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const toggleExpand = (id: string) => {
    setNodes((prev) => prev); // trigger render
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Helper to isolate <think> tags
  const extractThinking = (text: string) => {
    const match = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (match) {
      const thinking = match[1].trim();
      const clean = text.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
      return { thinking, clean };
    }
    return { thinking: '', clean: text };
  };

  // Run a single node
  const executeNode = async (nodeIndex: number, overrideInputContext?: string) => {
    const targetNode = nodes[nodeIndex];
    if (!targetNode || !targetNode.enabled) return '';

    // Update status to running
    setNodes((prev) =>
      prev.map((n, idx) =>
        idx === nodeIndex
          ? { ...n, status: 'running', error: undefined, durationMs: undefined }
          : n
      )
    );

    const startTime = Date.now();

    // Determine prompt input context
    let promptToSend = sharedPrompt;
    if (targetNode.contextSource === 'previous') {
      const prevNode = nodes[nodeIndex - 1];
      const prevOutput = overrideInputContext !== undefined ? overrideInputContext : prevNode?.output || '';
      promptToSend = `[Shared Prompt]:\n${sharedPrompt}\n\n[Dữ liệu ngữ cảnh từ bước trước (${prevNode?.name || 'Previous'})]:\n${prevOutput}`;
    } else if (targetNode.contextSource === 'custom' && targetNode.customContext) {
      promptToSend = `[Shared Prompt]:\n${sharedPrompt}\n\n[Ngữ cảnh bổ sung]:\n${targetNode.customContext}`;
    }

    try {
      const cfg: MultiAIConfig = {
        id: targetNode.model,
        name: targetNode.name,
        baseUrl: 'http://127.0.0.1:5050/v1',
        apiKey: 'free',
        model: targetNode.model,
      };

      const rawResponse = await WailsService.callAIModel(
        cfg,
        targetNode.systemInstruction || '',
        promptToSend
      );

      const duration = Date.now() - startTime;
      const { thinking, clean } = extractThinking(rawResponse);
      const estimatedTokens = Math.round(rawResponse.length / 3.8);

      setNodes((prev) =>
        prev.map((n, idx) =>
          idx === nodeIndex
            ? {
                ...n,
                status: 'completed',
                output: clean,
                thinking,
                durationMs: duration,
                tokensEstimated: estimatedTokens,
              }
            : n
        )
      );

      return clean;
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errMsg = err?.message || String(err);
      setNodes((prev) =>
        prev.map((n, idx) =>
          idx === nodeIndex
            ? {
                ...n,
                status: 'failed',
                error: errMsg,
                durationMs: duration,
              }
            : n
        )
      );
      throw err;
    }
  };

  // Run the whole pipeline according to chosen strategy
  const handleRunAll = async () => {
    if (isRunning) return;
    setIsRunning(true);
    showToast(`Bắt đầu thực thi Multi-AI theo chiến lược: ${strategy.toUpperCase()}`);

    // Reset status of enabled nodes
    setNodes((prev) =>
      prev.map((n) => (n.enabled ? { ...n, status: 'waiting', output: undefined, error: undefined } : n))
    );

    try {
      if (strategy === 'sequential' || strategy === 'implement_fix') {
        let previousOutput = '';
        for (let i = 0; i < nodes.length; i++) {
          if (!nodes[i].enabled) continue;
          try {
            previousOutput = await executeNode(i, previousOutput);
          } catch (e) {
            console.error(`Lỗi tại node ${nodes[i].name}:`, e);
            // In sequential, if one node fails, subsequent wait nodes become skipped
            setNodes((prev) =>
              prev.map((n, idx) =>
                idx > i && n.status === 'waiting' ? { ...n, status: 'skipped' } : n
              )
            );
            break;
          }
        }
      } else if (strategy === 'parallel' || strategy === 'consensus') {
        // Run enabled nodes concurrently
        const activeNodes = nodes
          .map((n, idx) => ({ n, idx }))
          .filter((item) => item.n.enabled);

        await Promise.allSettled(
          activeNodes.map((item) => executeNode(item.idx))
        );
      } else if (strategy === 'pipeline') {
        // Simple DAG: run root nodes first, then dependents
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].enabled) {
            await executeNode(i);
          }
        }
      }

      // Auto-generate Final Synthesis
      generateSynthesis();
      showToast('Hoàn thành toàn bộ quy trình Multi-AI!');
    } catch (e) {
      console.error('Lỗi quy trình Multi-AI:', e);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopAll = () => {
    setIsRunning(false);
    setNodes((prev) =>
      prev.map((n) => (n.status === 'running' || n.status === 'waiting' ? { ...n, status: 'idle' } : n))
    );
    showToast('Đã dừng toàn bộ tiến trình Multi-AI.');
  };

  // Generate Final Synthesis from completed node outputs
  const generateSynthesis = () => {
    const completed = nodes.filter((n) => n.enabled && n.output && n.status === 'completed');
    if (completed.length === 0) return;

    let syn = `# BẢN TỔNG HỢP MULTI-AI SOLUTION (Dự án: ${workspace?.split(/[/\\]/).pop() || 'Taitestgame IDE'})\n\n`;
    syn += `**Thời gian**: ${new Date().toLocaleString()}\n`;
    syn += `**Chiến lược**: ${strategy.toUpperCase()}\n`;
    syn += `**Prompt chung**: "${sharedPrompt}"\n\n`;
    syn += `---\n\n`;

    completed.forEach((n) => {
      syn += `### ✦ ${n.name} [Model: ${n.model}]\n\n`;
      syn += `${n.output}\n\n`;
      syn += `---\n\n`;
    });

    syn += `### 💡 KẾT LUẬN TỐI ƯU & HƯỚNG TRIỂN KHAI\n\n`;
    syn += `Các đề xuất từ các mô hình đã được đồng bộ. Giải pháp trên đã kết hợp tối ưu giữa kế hoạch kiến trúc, mã nguồn thực thi và quy chuẩn kiểm thử.\n`;

    setFinalSynthesis(syn);

    // Save run to SQLite database
    WailsService.saveMultiAIRun(
      `run_${Date.now()}`,
      sharedPrompt,
      strategy,
      JSON.stringify(nodes),
      JSON.stringify(completed.map((c) => ({ id: c.id, output: c.output }))),
      syn
    ).catch((err) => console.warn('Lỗi lưu SQLite run:', err));
  };

  const handleAddNode = () => {
    const newIdx = nodes.length + 1;
    const newNode: MultiAINode = {
      id: `node-${Date.now()}`,
      name: `AI Chuyên biệt 0${newIdx}`,
      role: 'custom',
      provider: 'OpenCode Free Bridge',
      model: 'glm-5.3-flash-free',
      systemInstruction: 'Bạn là chuyên gia tư vấn kỹ thuật. Đóng góp góc nhìn chuyên sâu cho bài toán.',
      contextSource: 'previous',
      status: 'idle',
      enabled: true,
    };
    setNodes([...nodes, newNode]);
    setExpandedNodes((prev) => ({ ...prev, [newNode.id]: true }));
    showToast(`Đã thêm node: ${newNode.name}`);
  };

  const handleDeleteNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    showToast(`Đã xóa node`);
  };

  const handleMoveNode = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= nodes.length) return;
    const updated = [...nodes];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setNodes(updated);
  };

  const handleDuplicateNode = (node: MultiAINode) => {
    const dup: MultiAINode = {
      ...node,
      id: `node-${Date.now()}`,
      name: `${node.name} (Copy)`,
      status: 'idle',
      output: undefined,
      thinking: undefined,
    };
    setNodes([...nodes, dup]);
    setExpandedNodes((prev) => ({ ...prev, [dup.id]: true }));
    showToast(`Đã nhân bản node: ${dup.name}`);
  };

  const handleApplySolutionToEditor = () => {
    if (!finalSynthesis) {
      generateSynthesis();
    }
    const textToApply = finalSynthesis || (nodes.find((n) => n.output)?.output || '');
    if (textToApply && onApplyToEditor) {
      onApplyToEditor(textToApply);
      showToast(`Đã đưa giải pháp vào Editor của tệp: ${activeFile || 'tệp đang mở'}`);
    }
  };

  const handleExportMarkdown = () => {
    if (!finalSynthesis) generateSynthesis();
    const blob = new Blob([finalSynthesis], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multi_ai_synthesis_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất báo cáo Markdown thành công!');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 35px)',
        width: '100vw',
        background: '#121214',
        color: '#f4f4f5',
        overflow: 'hidden',
      }}
    >
      {/* 1. TOP CONTROL DECK */}
      <div
        style={{
          background: '#18181b',
          borderBottom: '1px solid #27272a',
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.5px', color: '#ffffff' }}>
                MULTI-AI WORKSPACE & PIPELINE
              </div>
              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                Hệ thống điều phối đa mô hình AI theo hàng dọc • Kết nối Free API Bridge (Port 5050)
              </div>
            </div>
          </div>

          {/* Strategy & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Strategy Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Chiến lược:</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as MultiAIStrategy)}
                style={{
                  background: '#27272a',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#f4f4f5',
                  fontSize: '12px',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="sequential">Sequential (Tuần tự trên xuống)</option>
                <option value="parallel">Parallel (Song song đồng thời)</option>
                <option value="pipeline">Pipeline / DAG (Đồ thị phụ thuộc)</option>
                <option value="consensus">Consensus (Đối chiếu đồng thuận)</option>
                <option value="implement_fix">Implement → Review → Fix</option>
              </select>
            </div>

            {/* Run All / Stop Button */}
            {!isRunning ? (
              <button
                onClick={handleRunAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)',
                }}
              >
                <Play size={14} fill="#ffffff" />
                <span>Run All Nodes</span>
              </button>
            ) : (
              <button
                onClick={handleStopAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Square size={14} fill="#ffffff" />
                <span>Stop Pipeline</span>
              </button>
            )}

            {/* Add AI Node Button */}
            <button
              onClick={handleAddNode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: '#27272a',
                border: '1px solid #3f3f46',
                color: '#f4f4f5',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              <span>Thêm AI</span>
            </button>
          </div>
        </div>

        {/* Shared Prompt Input Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8' }}>
              ✦ Shared Prompt (Câu lệnh dùng chung cho toàn bộ Pipeline)
            </label>
            {/* Quick Template Chips */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { label: 'Phân tích & Tối ưu', prompt: 'Hãy phân tích mã nguồn codebase hiện tại, phát hiện các điểm nghẽn hiệu năng và đề xuất giải pháp tối ưu.' },
                { label: 'Kiến trúc & Kế hoạch', prompt: 'Thiết kế kiến trúc hệ thống chuẩn moduler, định hình các interface và lập kế hoạch triển khai từng bước.' },
                { label: 'Review Bảo mật', prompt: 'Kiểm toán an ninh mã nguồn, tìm kiếm các lỗ hổng path traversal, injection và kiểm tra quyền thực thi an toàn.' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => setSharedPrompt(chip.prompt)}
                  style={{
                    background: '#27272a',
                    border: '1px solid #3f3f46',
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    color: '#d4d4d8',
                    cursor: 'pointer',
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={sharedPrompt}
            onChange={(e) => setSharedPrompt(e.target.value)}
            rows={2}
            placeholder="Nhập yêu cầu bài toán... Các AI sẽ phối hợp thực thi theo chuỗi"
            style={{
              width: '100%',
              background: '#202024',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#f4f4f5',
              fontSize: '13px',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* 2. MAIN VERTICAL PIPELINE LIST (HÀNG DỌC BẮT BUỘC THEO MỤC 4) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 30px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {nodes.map((node, index) => {
            const isExpanded = !!expandedNodes[node.id];
            const isThinkingExpanded = !!expandedThinking[node.id];
            const isLast = index === nodes.length - 1;

            return (
              <React.Fragment key={node.id}>
                {/* Node Card Container */}
                <div
                  style={{
                    background: '#18181b',
                    border: `1px solid ${
                      node.status === 'running'
                        ? '#38bdf8'
                        : node.status === 'completed'
                        ? '#22c55e'
                        : node.status === 'failed'
                        ? '#ef4444'
                        : '#27272a'
                    }`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    boxShadow: node.status === 'running' ? '0 0 20px rgba(56, 189, 248, 0.2)' : '0 4px 14px rgba(0,0,0,0.4)',
                    transition: 'all 0.2s ease',
                    opacity: node.enabled ? 1 : 0.6,
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      padding: '12px 16px',
                      background: '#1f1f23',
                      borderBottom: isExpanded ? '1px solid #27272a' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Node Index Badge */}
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          background: node.status === 'completed' ? '#166534' : node.status === 'running' ? '#0369a1' : '#27272a',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        0{index + 1}
                      </div>

                      {/* Node Title & Role */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5' }}>{node.name}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: '#27272a',
                              color: '#38bdf8',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                            }}
                          >
                            {node.role}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                          Model: <span style={{ color: '#bae6fd', fontWeight: 500 }}>{node.model}</span> • Context:{' '}
                          <span style={{ color: '#d4d4d8' }}>
                            {node.contextSource === 'previous'
                              ? `Từ node trước (0${index})`
                              : node.contextSource === 'shared'
                              ? 'Prompt chung'
                              : 'Custom'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Quick Action Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Status Indicator */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background:
                            node.status === 'completed'
                              ? 'rgba(34, 197, 94, 0.15)'
                              : node.status === 'running'
                              ? 'rgba(56, 189, 248, 0.15)'
                              : node.status === 'failed'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : '#27272a',
                          color:
                            node.status === 'completed'
                              ? '#4ade80'
                              : node.status === 'running'
                              ? '#38bdf8'
                              : node.status === 'failed'
                              ? '#f87171'
                              : '#a1a1aa',
                        }}
                      >
                        {node.status === 'completed' && <CheckCircle2 size={12} />}
                        {node.status === 'running' && <Clock size={12} className="animate-spin" />}
                        {node.status === 'failed' && <AlertCircle size={12} />}
                        <span style={{ textTransform: 'capitalize' }}>{node.status}</span>
                      </div>

                      {/* Duration & Tokens */}
                      {node.durationMs !== undefined && (
                        <span style={{ fontSize: '11px', color: '#71717a' }}>
                          {(node.durationMs / 1000).toFixed(1)}s • ~{node.tokensEstimated || 0} tok
                        </span>
                      )}

                      {/* Individual Run Button */}
                      <button
                        onClick={() => executeNode(index)}
                        disabled={isRunning}
                        style={{
                          background: '#27272a',
                          border: '1px solid #3f3f46',
                          color: '#d4d4d8',
                          borderRadius: '5px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Chạy riêng node này"
                      >
                        <Play size={11} />
                        Run
                      </button>

                      {/* Move Up / Down */}
                      <button
                        onClick={() => handleMoveNode(index, 'up')}
                        disabled={index === 0}
                        style={{ background: 'none', border: 'none', color: index === 0 ? '#444' : '#a1a1aa', cursor: 'pointer', padding: '2px' }}
                        title="Di chuyển lên"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        onClick={() => handleMoveNode(index, 'down')}
                        disabled={isLast}
                        style={{ background: 'none', border: 'none', color: isLast ? '#444' : '#a1a1aa', cursor: 'pointer', padding: '2px' }}
                        title="Di chuyển xuống"
                      >
                        <ArrowDownIcon size={13} />
                      </button>

                      {/* Duplicate */}
                      <button
                        onClick={() => handleDuplicateNode(node)}
                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '2px' }}
                        title="Nhân bản node"
                      >
                        <DuplicateIcon size={13} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteNode(node.id)}
                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '2px' }}
                        title="Xóa node này"
                      >
                        <Trash2 size={13} />
                      </button>

                      {/* Expand / Collapse Accordion */}
                      <button
                        onClick={() => toggleExpand(node.id)}
                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '2px' }}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Card Expanded Content */}
                  {isExpanded && (
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Configuration Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>
                            Model AI (Free Port 5050):
                          </label>
                          <select
                            value={node.model}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNodes((prev) =>
                                prev.map((n) => (n.id === node.id ? { ...n, model: val } : n))
                              );
                            }}
                            style={{
                              width: '100%',
                              background: '#202024',
                              border: '1px solid #3f3f46',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              color: '#f4f4f5',
                              fontSize: '12px',
                            }}
                          >
                            <option value="glm-5.3-flash-free">GLM-5.3 Flash (Free - Đa Năng)</option>
                            <option value="deepseek-v4.1-flash-free">DeepSeek V4.1 Flash (Free - Coding)</option>
                            <option value="nemotron-3.5-lightning-free">Nemotron 3.5 Lightning (Free - Siêu Tốc)</option>
                            <option value="big-pickle">Big Pickle (Free - Reasoning Suy Luận)</option>
                            <option value="beam-free">Beam Free (Gọn nhẹ)</option>
                            <option value="longcat-2.5-preview-free">LongCat 2.5 Preview (Ngữ Cảnh Dài)</option>
                            <option value="mimo-v2.6-flash-free">MiMo-V2.6 Flash (Free)</option>
                            <option value="nemotron-3.5-super-vl-free">Nemotron 3.5 Super VL (Free)</option>
                            <option value="nemotron-3-ultra-free">Nemotron 3 Ultra (Free)</option>
                            <option value="minimax-m3.1-flash-free">MiniMax M3.1 Flash (Free)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>
                            Vai trò (Role):
                          </label>
                          <select
                            value={node.role}
                            onChange={(e) => {
                              const val = e.target.value as MultiAIRole;
                              setNodes((prev) =>
                                prev.map((n) => (n.id === node.id ? { ...n, role: val } : n))
                              );
                            }}
                            style={{
                              width: '100%',
                              background: '#202024',
                              border: '1px solid #3f3f46',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              color: '#f4f4f5',
                              fontSize: '12px',
                            }}
                          >
                            <option value="planner">AI Planner (Lập kế hoạch)</option>
                            <option value="implementer">AI Implementer (Viết code)</option>
                            <option value="reviewer">AI Reviewer (Đánh giá & Audit)</option>
                            <option value="verifier">AI Verifier (Kiểm thử)</option>
                            <option value="synthesizer">AI Synthesizer (Tổng hợp)</option>
                            <option value="custom">Custom Role</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>
                            Nguồn Context (Input Mapping):
                          </label>
                          <select
                            value={node.contextSource}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setNodes((prev) =>
                                prev.map((n) => (n.id === node.id ? { ...n, contextSource: val } : n))
                              );
                            }}
                            style={{
                              width: '100%',
                              background: '#202024',
                              border: '1px solid #3f3f46',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              color: '#f4f4f5',
                              fontSize: '12px',
                            }}
                          >
                            <option value="previous">Từ Node trước đó</option>
                            <option value="shared">Chỉ Prompt dùng chung</option>
                            <option value="custom">Ngữ cảnh tùy biến</option>
                          </select>
                        </div>
                      </div>

                      {/* System Instruction */}
                      <div>
                        <label style={{ fontSize: '11px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>
                          Chỉ dẫn hệ thống riêng (Node System Instruction):
                        </label>
                        <input
                          type="text"
                          value={node.systemInstruction || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNodes((prev) =>
                              prev.map((n) => (n.id === node.id ? { ...n, systemInstruction: val } : n))
                            );
                          }}
                          style={{
                            width: '100%',
                            background: '#202024',
                            border: '1px solid #3f3f46',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#d4d4d8',
                            fontSize: '12px',
                          }}
                        />
                      </div>

                      {/* Node Output Display */}
                      {node.error && (
                        <div
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '12px',
                            color: '#fca5a5',
                          }}
                        >
                          Lỗi thực thi: {node.error}
                        </div>
                      )}

                      {/* Reasoning / Thinking Accordion */}
                      {node.thinking && (
                        <div
                          style={{
                            background: '#161618',
                            border: '1px solid #2e2e34',
                            borderRadius: '6px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            onClick={() => toggleThinking(node.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: '#1c1c20',
                              cursor: 'pointer',
                              fontSize: '11px',
                              color: '#a855f7',
                              fontWeight: 600,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Brain size={13} />
                              <span>Quá trình suy luận CoT (&lt;think&gt;)</span>
                            </div>
                            {isThinkingExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </div>
                          {isThinkingExpanded && (
                            <pre
                              style={{
                                padding: '10px',
                                margin: 0,
                                fontSize: '11px',
                                color: '#d8b4fe',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: '180px',
                                overflowY: 'auto',
                              }}
                            >
                              {node.thinking}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Main Output Box */}
                      {node.output && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ade80' }}>
                              Kết quả phản hồi (Node Output):
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(node.output || '');
                                showToast('Đã copy kết quả node vào Clipboard');
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#a1a1aa',
                                cursor: 'pointer',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Copy size={11} />
                              Copy
                            </button>
                          </div>
                          <div
                            style={{
                              background: '#161618',
                              border: '1px solid #2e2e34',
                              borderRadius: '6px',
                              padding: '10px 12px',
                              fontSize: '12px',
                              color: '#e4e4e7',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: '260px',
                              overflowY: 'auto',
                              fontFamily: 'Consolas, monospace',
                              lineHeight: '1.5',
                            }}
                          >
                            {node.output}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Downward Arrow Connector (Trực quan hóa luồng HÀNG DỌC) */}
                {!isLast && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '24px',
                      color: '#0284c7',
                    }}
                  >
                    <ArrowDown size={18} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 3. BOTTOM SYNTHESIS & COMPARISON DECK */}
      <div
        style={{
          background: '#18181b',
          borderTop: '1px solid #27272a',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowComparison(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#27272a',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Split size={14} color="#38bdf8" />
            <span>So sánh Kết quả (Side-by-side)</span>
          </button>

          <button
            onClick={generateSynthesis}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#27272a',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} color="#a855f7" />
            <span>Tạo bản tổng hợp (Final Synthesis)</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 1-Click Apply to Monaco Editor */}
          <button
            onClick={handleApplySolutionToEditor}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
            }}
            title="Đưa trực tiếp mã nguồn giải pháp vào Monaco Editor"
          >
            <FileCode size={14} />
            <span>Áp dụng vào Editor (Apply to Monaco)</span>
          </button>

          {/* Export Report */}
          <button
            onClick={handleExportMarkdown}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: '#27272a',
              border: '1px solid #3f3f46',
              color: '#d4d4d8',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Download size={13} />
            <span>Xuất Markdown</span>
          </button>
        </div>
      </div>

      {/* 4. MODAL SO SÁNH KẾT QUẢ (Side-by-side Comparison) */}
      {showComparison && (
        <div
          onClick={() => setShowComparison(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90vw',
              maxWidth: '1200px',
              height: '80vh',
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                height: '46px',
                background: '#141416',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
                <Split size={16} color="#38bdf8" />
                <span>So sánh Kết quả Đa Mô hình (Side-by-side Output Matrix)</span>
              </div>
              <button
                onClick={() => setShowComparison(false)}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Columns */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                overflowX: 'auto',
                gap: '12px',
                padding: '16px',
                background: '#121214',
              }}
            >
              {nodes
                .filter((n) => n.enabled && n.output)
                .map((node) => (
                  <div
                    key={node.id}
                    style={{
                      flex: 1,
                      minWidth: '320px',
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#1f1f23',
                        borderBottom: '1px solid #27272a',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5' }}>{node.name}</div>
                        <div style={{ fontSize: '11px', color: '#38bdf8' }}>{node.model}</div>
                      </div>
                      <span style={{ fontSize: '10px', color: '#71717a' }}>{(node.durationMs || 0) / 1000}s</span>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        padding: '12px',
                        overflowY: 'auto',
                        fontSize: '12px',
                        lineHeight: '1.5',
                        color: '#d4d4d8',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                      }}
                    >
                      {node.output}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#1f1f23',
            border: '1px solid #0284c7',
            color: '#f4f4f5',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 99999,
          }}
        >
          {notification}
        </div>
      )}
    </div>
  );
};
