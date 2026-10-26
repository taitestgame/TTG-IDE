import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Loader2,
  Sparkles,
  Terminal,
  Code2,
  Check,
  X,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Square,
  Bot,
} from 'lucide-react';
import { ToolCall, TrajectoryItem } from '../../types';
import { StandardFileIcon } from '../common/StandardFileIcon';
import { WailsService } from '../../services/wailsBridge';

interface TrajectoryStreamProps {
  trajectory?: TrajectoryItem[];
  toolCalls?: ToolCall[];
  thinking?: string | null;
  thinkingSeconds?: number | string;
  isLive?: boolean;
  liveStatus?: string | null;
  onOpenFile?: (path: string, lineOrRange?: any) => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onAcceptChange?: (filePath: string) => void;
}

export const getFileIcon = (filename: string, isFolder?: boolean): string => {
  if (isFolder) return '📁';
  if (!filename) return '📄';

  const clean = filename.trim().replace(/^[/\\]+|[/\\]+$/g, '');
  if (!clean || clean === '.' || clean === '..') return '📁';

  // Folder paths or paths ending in slash
  if (clean.endsWith('/') || clean.endsWith('\\')) return '📁';

  const base = clean.split(/[/\\]/).filter(Boolean).pop() || clean;
  const lowerBase = base.toLowerCase();

  // Known special files
  if (lowerBase === 'dockerfile') return '🐳';
  if (lowerBase === 'makefile') return '🛠️';
  if (lowerBase.startsWith('license')) return '📜';
  if (lowerBase.startsWith('.env')) return '⚙️';
  if (lowerBase === '.gitignore' || lowerBase === '.npmignore' || lowerBase === '.dockerignore') return '⚙️';

  // Directory without extension
  if (!base.includes('.') && !base.startsWith('.')) {
    return '📁';
  }

  const ext = base.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return '⚛️';
    case 'ts':
      return '🔷';
    case 'js':
    case 'mjs':
    case 'cjs':
      return '🟨';
    case 'go':
      return '🐹';
    case 'py':
    case 'pyw':
    case 'ipynb':
      return '🐍';
    case 'rs':
    case 'rlib':
      return '🦀';
    case 'java':
    case 'jar':
    case 'class':
      return '☕';
    case 'c':
    case 'h':
      return '🇨';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hxx':
      return '⚙️';
    case 'cs':
      return '🟣';
    case 'php':
      return '🐘';
    case 'rb':
    case 'erb':
      return '💎';
    case 'html':
    case 'htm':
      return '🌐';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return '🎨';
    case 'vue':
      return '🟢';
    case 'svelte':
      return '🟧';
    case 'dart':
      return '🎯';
    case 'swift':
      return '🐦';
    case 'kt':
    case 'kts':
      return '🟪';
    case 'lua':
      return '🌙';
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ps1':
    case 'bat':
    case 'cmd':
      return '💻';
    case 'sql':
    case 'sqlite':
    case 'db':
      return '🗄️';
    case 'json':
    case 'jsonc':
      return '📋';
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'xml':
      return '⚙️';
    case 'md':
    case 'markdown':
    case 'txt':
    case 'rst':
      return '📝';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return '🖼️';
    case 'zip':
    case 'tar':
    case 'gz':
    case '7z':
    case 'rar':
      return '📦';
    case 'pdf':
      return '📕';
    default:
      return '📄';
  }
};

interface ChangedFileSummary {
  name: string;
  path: string;
  additions: number;
  deletions: number;
  isNew: boolean;
}

export const TrajectoryStream: React.FC<TrajectoryStreamProps> = ({
  trajectory,
  toolCalls = [],
  thinking = null,
  thinkingSeconds = 7,
  isLive = false,
  liveStatus = null,
  onOpenFile,
  onAcceptAll,
  onRejectAll,
  onAcceptChange,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedCmds, setExpandedCmds] = useState<Record<string, boolean>>({});
  const [copiedCmds, setCopiedCmds] = useState<Record<string, boolean>>({});
  const [killedCmds, setKilledCmds] = useState<Record<string, boolean>>({});
  const [dismissedCmds, setDismissedCmds] = useState<Record<string, boolean>>({});
  const [acceptedEdits, setAcceptedEdits] = useState<Record<string, boolean>>({});
  const [isAccepted, setIsAccepted] = useState(false);
  const [isRejected, setIsRejected] = useState(false);

  // 1. Calculate diff stats for an edit tool call
  const getToolCallDiffStats = (tc: ToolCall) => {
    const args = tc.arguments || {};
    const name = tc.name;

    if (name === 'write_file' || name === 'create_file') {
      const content = args.content || args.CodeContent || '';
      const lines = content ? String(content).split('\n').length : 1;
      return { additions: lines, deletions: 0, isNew: true };
    }

    if (name === 'replace_file_content' || name === 'edit_file' || name === 'modify_file') {
      // 1. Check Cline search/replace diff block
      const diff = args.diff || '';
      if (typeof diff === 'string' && diff.includes('<<<<<<< SEARCH')) {
        const searchParts = diff.match(/<<<<<<< SEARCH[\r\n]+([\s\S]*?)=======/g) || [];
        const replaceParts = diff.match(/=======[\r\n]+([\s\S]*?)>>>>>>> REPLACE/g) || [];
        let del = 0;
        let add = 0;
        for (const sp of searchParts) {
          const body = sp.replace(/^<<<<<<< SEARCH[\r\n]+/, '').replace(/=======$/, '');
          del += body ? body.split('\n').length : 0;
        }
        for (const rp of replaceParts) {
          const body = rp.replace(/^=======[\r\n]+/, '').replace(/>>>>>>> REPLACE$/, '');
          add += body ? body.split('\n').length : 0;
        }
        return { additions: Math.max(add, 1), deletions: del, isNew: false };
      }

      // 2. Check replacements array
      const rawRepls = args.replacements || args.ReplacementChunks || [];
      if (Array.isArray(rawRepls) && rawRepls.length > 0) {
        let del = 0;
        let add = 0;
        for (const r of rawRepls) {
          const t = r.target || r.TargetContent || '';
          const rep = r.replacement || r.ReplacementContent || '';
          del += t ? String(t).split('\n').length : 0;
          add += rep ? String(rep).split('\n').length : 1;
        }
        return { additions: add || 1, deletions: del, isNew: false };
      }

      // 3. Check single target / replacement
      const target = args.TargetContent || args.targetContent || args.target || '';
      const replacement = args.ReplacementContent || args.replacementContent || args.replacement || args.content || '';
      const delLines = target ? String(target).split('\n').length : 0;
      const addLines = replacement ? String(replacement).split('\n').length : 1;
      return { additions: addLines, deletions: delLines, isNew: false };
    }

    if (name === 'multi_replace_file_content') {
      const chunks = args.ReplacementChunks || args.replacementChunks || [];
      let delLines = 0;
      let addLines = 0;
      if (Array.isArray(chunks)) {
        for (const c of chunks) {
          delLines += c.TargetContent ? String(c.TargetContent).split('\n').length : 0;
          addLines += c.ReplacementContent ? String(c.ReplacementContent).split('\n').length : 1;
        }
      }
      return { additions: addLines || 1, deletions: delLines, isNew: false };
    }

    return { additions: 1, deletions: 0, isNew: false };
  };

  // 2. Build chronological raw items list
  const rawItems: TrajectoryItem[] = [];
  if (trajectory && trajectory.length > 0) {
    rawItems.push(...trajectory);
  } else {
    // Fallback for legacy messages without trajectory field
    if (toolCalls && toolCalls.length > 0) {
      if (thinking && thinking.trim()) {
        rawItems.push({
          type: 'thought',
          id: 'fallback_thought',
          text: thinking.trim(),
          seconds: typeof thinkingSeconds === 'number' ? thinkingSeconds : parseInt(String(thinkingSeconds)) || 7,
        });
      }
      toolCalls.forEach((tc) => {
        rawItems.push({ type: 'tool', toolCall: tc });
      });
    } else if (thinking && thinking.trim()) {
      rawItems.push({
        type: 'thought',
        id: 'fallback_thought',
        text: thinking.trim(),
        seconds: typeof thinkingSeconds === 'number' ? thinkingSeconds : parseInt(String(thinkingSeconds)) || 7,
      });
    }
  }

  // 3. Normalize: Merge consecutive thoughts ("thingking thingking gộp chung")
  const normalized: TrajectoryItem[] = [];
  for (const item of rawItems) {
    if (item.type === 'thought') {
      const cleanText = (item.text || '').trim();
      if (!cleanText) continue;
      const last = normalized[normalized.length - 1];
      if (last && last.type === 'thought') {
        if (cleanText.startsWith(last.text) || cleanText.includes(last.text)) {
          last.text = cleanText;
          last.seconds = Math.max(last.seconds || 1, item.seconds || 1);
        } else if (last.text.includes(cleanText)) {
          // Đã có trong khối suy nghĩ trước đó
        } else {
          last.text = `${last.text}\n\n${cleanText}`;
          last.seconds = (last.seconds || 1) + (item.seconds || 1);
        }
      } else {
        normalized.push({
          type: 'thought',
          id: item.id || `th_${normalized.length}`,
          text: cleanText,
          seconds: item.seconds || 1,
        });
      }
    } else if (item.type === 'tool' && item.toolCall) {
      normalized.push(item);
    }
  }

  // 4. Group consecutive exploratory tools into sequential RenderBlocks
  type RenderBlock =
    | {
        type: 'explore';
        id: string;
        items: ToolCall[];
        fileCount: number;
        searchCount: number;
        isRunning?: boolean;
      }
    | {
        type: 'analyzed_single';
        id: string;
        tc: ToolCall;
      }
    | {
        type: 'thought';
        id: string;
        text: string;
        seconds: number;
        isLiveActive?: boolean;
      }
    | {
        type: 'edit';
        id: string;
        tc: ToolCall;
        diff: { additions: number; deletions: number; isNew: boolean };
      }
    | {
        type: 'cmd';
        id: string;
        tc: ToolCall;
      }
    | {
        type: 'other';
        id: string;
        tc: ToolCall;
      };

  const blocks: RenderBlock[] = [];
  let currentExplore: ToolCall[] = [];

  const flushExplore = (isRunning = false) => {
    if (currentExplore.length === 0) return;
    if (currentExplore.length === 1 && !isRunning) {
      // Một tệp duy nhất đứng độc lập -> hiển thị trực tiếp (khớp Ảnh 2: "Analyzed harness.go #L790-830")
      const tc = currentExplore[0];
      blocks.push({
        type: 'analyzed_single',
        id: tc.id || `single_${blocks.length}`,
        tc,
      });
    } else {
      // Từ 2 tệp/tìm kiếm trở lên -> Gộp khối thu gọn (khớp Ảnh 1: "Exploring 4 files ∨" và Ảnh 2: "Exploring 2 files, 2 searches ∨")
      const fileCount = currentExplore.filter((tc) =>
        ['view_file', 'read_file', 'list_dir', 'list_files', 'inspect_native_instruction', 'inspect_source'].includes(tc.name)
      ).length;
      const searchCount = currentExplore.filter((tc) =>
        ['grep_search', 'search_web', 'search_code', 'search_bytes', 'search_procedures'].includes(tc.name)
      ).length;

      blocks.push({
        type: 'explore',
        id: `explore_${blocks.length}_${currentExplore[0].id || Date.now()}`,
        items: [...currentExplore],
        fileCount: Math.max(fileCount, currentExplore.length - searchCount),
        searchCount,
        isRunning,
      });
    }
    currentExplore = [];
  };

  normalized.forEach((item, idx) => {
    if (item.type === 'thought') {
      flushExplore(false);
      const isLatest = idx === normalized.length - 1;
      blocks.push({
        type: 'thought',
        id: item.id || `th_${idx}`,
        text: item.text,
        seconds: item.seconds || 1,
        isLiveActive: isLive && isLatest,
      });
    } else if (item.type === 'tool') {
      const tc = item.toolCall;
      const isEdit = ['write_file', 'create_file', 'edit_file', 'replace_file_content', 'multi_replace_file_content', 'modify_file'].includes(tc.name);
      const isCmd = tc.name === 'run_command' || tc.arguments?.command || tc.arguments?.CommandLine;

      if (isEdit) {
        flushExplore(false);
        blocks.push({
          type: 'edit',
          id: tc.id || `edit_${idx}`,
          tc,
          diff: getToolCallDiffStats(tc),
        });
      } else if (isCmd) {
        flushExplore(false);
        blocks.push({
          type: 'cmd',
          id: tc.id || `cmd_${idx}`,
          tc,
        });
      } else {
        currentExplore.push(tc);
      }
    }
  });

  if (currentExplore.length > 0) {
    flushExplore(isLive);
  }

  // 3. Collect changed files for the bottom "Files With Changes" Card (Image 2)
  const changedFilesMap = new Map<string, ChangedFileSummary>();
  toolCalls.forEach((tc) => {
    const isEdit = ['write_file', 'create_file', 'edit_file', 'replace_file_content', 'multi_replace_file_content', 'modify_file'].includes(tc.name);
    if (!isEdit) return;

    const args = tc.arguments || {};
    const rawPath = args.path || args.targetFile || args.TargetFile || args.AbsolutePath || args.filePath || '';
    if (!rawPath) return;

    const filename = String(rawPath).split(/[/\\]/).filter(Boolean).pop() || rawPath;
    const stats = getToolCallDiffStats(tc);

    if (changedFilesMap.has(rawPath)) {
      const existing = changedFilesMap.get(rawPath)!;
      existing.additions += stats.additions;
      existing.deletions += stats.deletions;
    } else {
      changedFilesMap.set(rawPath, {
        name: filename,
        path: rawPath,
        additions: stats.additions,
        deletions: stats.deletions,
        isNew: stats.isNew,
      });
    }
  });

  const changedFiles = Array.from(changedFilesMap.values());

  // Render an individual Analyzed item (e.g. Read ⚛️ App.tsx #L725-780 or Explored 📁 src/components)
  const renderAnalyzedItem = (tc: ToolCall, idx: number, isStandalone = false) => {
    const args = tc.arguments || {};
    const rawPath =
      (args.DirectoryPath as string) ||
      (args.directoryPath as string) ||
      (args.path as string) ||
      (args.dirPath as string) ||
      (args.dir as string) ||
      (args.targetFile as string) ||
      (args.TargetFile as string) ||
      (args.AbsolutePath as string) ||
      (args.SearchPath as string) ||
      (args.filePath as string) ||
      (args.file as string) ||
      '';
    const isFolder =
      tc.name === 'list_dir' ||
      tc.name === 'list_files' ||
      (Boolean(rawPath) && !rawPath.includes('.') && !rawPath.startsWith('.'));
    const filename = rawPath ? String(rawPath).split(/[/\\]/).filter(Boolean).pop() || rawPath : '';
    let startLine = args.start_line || args.startLine || args.StartLine;
    let endLine = args.end_line || args.endLine || args.EndLine;
    if (!startLine && (tc.name === 'read_file' || tc.name === 'view_file')) {
      if (tc.result) {
        const matchRange = tc.result.match(/dong\s+(\d+)-(\d+)/i) || tc.result.match(/#L(\d+)-(\d+)/i);
        if (matchRange) {
          startLine = parseInt(matchRange[1]);
          endLine = parseInt(matchRange[2]);
        } else {
          const lineNums = Array.from(tc.result.matchAll(/^\s*(\d+)\s*\|/gm)).map((m) => parseInt(m[1]));
          if (lineNums.length > 0) {
            startLine = lineNums[0];
            endLine = lineNums[lineNums.length - 1];
          }
        }
      }
      if (!startLine) {
        startLine = 1;
        endLine = 100;
      }
    }
    const lineSuffix = startLine
      ? endLine && endLine !== startLine
        ? `:#L${startLine}-${endLine}`
        : `:#L${startLine}`
      : '';
    const query = args.query || args.Query;
    const padLeft = isStandalone ? '0px' : '14px';

    if (tc.name === 'spawn_subagent') {
      const subTask = (args.task as string) || (args.instructions as string) || 'Nhiệm vụ chuyên trách';
      return (
        <div
          key={tc.id || idx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#8e8e93',
            fontSize: '13px',
            paddingLeft: padLeft,
            paddingTop: '2px',
            paddingBottom: '2px',
          }}
        >
          <span style={{ fontWeight: 500 }}>Subtask:</span>
          <span style={{ color: '#f4f4f5', fontWeight: 500, maxWidth: '460px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subTask}
          </span>
        </div>
      );
    }

    if (query) {
      return (
        <div
          key={tc.id || idx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#a1a1aa',
            fontSize: '13px',
            paddingLeft: padLeft,
            paddingTop: '2px',
            paddingBottom: '2px',
          }}
        >
          <span>Searched</span>
          <span style={{ color: '#f4f4f5', fontFamily: "'Cascadia Code', monospace", fontSize: '12px' }}>
            "{query}"
          </span>
          {rawPath && <span style={{ color: '#71717a' }}>in {filename || rawPath}</span>}
        </div>
      );
    }

    if (isFolder) {
      const folderDisplay = rawPath
        ? rawPath.split(/[/\\]/).filter(Boolean).slice(-2).join('/') || rawPath
        : 'workspace';
      return (
        <div
          key={tc.id || idx}
          onClick={() => onOpenFile?.(rawPath)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#a1a1aa',
            fontSize: '13px',
            paddingLeft: padLeft,
            paddingTop: '2px',
            paddingBottom: '2px',
            cursor: onOpenFile ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          className="hover:text-white group"
          title={`Thư mục ${rawPath}`}
        >
          <span>Explored</span>
          <StandardFileIcon filename={folderDisplay} isFolder={true} size={15} />
          <span style={{ color: '#f4f4f5', fontWeight: 500 }} className="group-hover:underline">
            {folderDisplay}
          </span>
        </div>
      );
    }

    if (filename) {
      // Đứng độc lập giữa các thought -> "Analyzed" (Ảnh 2); trong danh sách explore -> "Read" (Ảnh 1)
      const verb = isStandalone ? (lineSuffix ? 'Analyzed' : 'Read') : 'Read';
      const startL = typeof startLine === 'number' ? startLine : 1;
      const endL = typeof endLine === 'number' ? endLine : (startL + 20);
      return (
        <div
          key={tc.id || idx}
          onClick={() => onOpenFile?.(rawPath, { startLine: startL, endLine: endL, id: tc.id })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#a1a1aa',
            fontSize: '13px',
            paddingLeft: padLeft,
            paddingTop: '2px',
            paddingBottom: '2px',
            cursor: onOpenFile ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          className="hover:text-white group"
          title={`Nhấn để mở và bôi đen ${rawPath} trong Editor`}
        >
          <span>{verb}</span>
          <StandardFileIcon filename={filename} size={15} />
          <span style={{ color: '#f4f4f5', fontWeight: 500 }} className="group-hover:underline">
            {filename}
          </span>
          {lineSuffix && (
            <span style={{ color: '#71717a', fontSize: '12px', fontFamily: "'Cascadia Code', monospace" }}>
              {lineSuffix}
            </span>
          )}
        </div>
      );
    }

    return (
      <div key={tc.id || idx} style={{ color: '#a1a1aa', fontSize: '13px', paddingLeft: padLeft }}>
        <span>Explored {tc.name}</span>
      </div>
    );
  };

  const renderThoughtText = (text: string) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <span
            key={i}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '4px',
              padding: '1px 5px',
              color: '#f4f4f5',
              fontSize: '12px',
              fontFamily: "'Cascadia Code', monospace",
            }}
          >
            {part.slice(1, -1)}
          </span>
        );
      }
      return part;
    });
  };

  const renderThoughtBlock = (chunk: string, key: string, seconds: number, isCurrentlyStreaming = false) => {
    const isExpanded = expandedGroups[key] ?? isCurrentlyStreaming;
    const label = isCurrentlyStreaming
      ? `Thinking for ${typeof thinkingSeconds === 'number' && thinkingSeconds > 0 ? thinkingSeconds : seconds}s`
      : `Thought for ${seconds}s`;

    return (
      <div
        key={key}
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: isExpanded ? 'rgba(255, 255, 255, 0.035)' : 'transparent',
          border: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid transparent',
          borderRadius: '8px',
          padding: isExpanded ? '8px 12px' : '2px 0',
          marginTop: '3px',
          marginBottom: '4px',
          transition: 'all 0.15s ease',
        }}
      >
        <div
          onClick={() =>
            setExpandedGroups((prev) => ({
              ...prev,
              [key]: !isExpanded,
            }))
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#a1a1aa',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            width: 'fit-content',
            userSelect: 'none',
          }}
          className="hover:text-white"
          title={isExpanded ? 'Thu gọn khối suy nghĩ' : 'Mở rộng xem toàn bộ quá trình suy nghĩ'}
        >
          <span>{label}</span>
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>

        {isExpanded && (
          <div
            style={{
              marginTop: '6px',
              color: '#d4d4d8',
              fontSize: '13px',
              lineHeight: '1.6',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '320px',
              overflowY: 'auto',
              userSelect: 'text',
            }}
          >
            {renderThoughtText(chunk)}
          </div>
        )}
      </div>
    );
  };

  const renderSegmentBody = (seg: RenderBlock, sIdx: number) => {
    // A. Collapsible Explore Group (e.g. Explored 14 files, 6 searches >)
    if (seg.type === 'explore') {
          // Mặc định luôn thu gọn gọn gàng 1 dòng để không tràn lan màn hình chat
          const isExpanded = expandedGroups[seg.id] ?? false;
          let label = '';
          if (seg.isRunning) {
            label = `Exploring ${seg.fileCount || 1} file${(seg.fileCount || 1) > 1 ? 's' : ''}`;
          } else {
            const parts: string[] = [];
            if (seg.fileCount > 0) parts.push(`${seg.fileCount} file${seg.fileCount > 1 ? 's' : ''}`);
            if (seg.searchCount > 0) parts.push(`${seg.searchCount} search${seg.searchCount > 1 ? 'es' : ''}`);
            label = `Explored ${parts.join(', ') || '1 file'}`;
          }

          return (
            <div
              key={seg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginTop: sIdx > 0 ? '10px' : '0px',
              }}
            >
              <div
                onClick={() =>
                  setExpandedGroups((prev) => ({
                    ...prev,
                    [seg.id]: !isExpanded,
                  }))
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#9ca3af',
                  fontSize: '13px',
                  cursor: 'pointer',
                  width: 'fit-content',
                  padding: '2px 0',
                }}
                className="hover:text-white"
                title={isExpanded ? 'Thu gọn danh sách đọc/tìm kiếm' : 'Mở rộng chi tiết tệp tin'}
              >
                <span>{label}</span>
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </div>

              {/* Khi đang chạy nhưng chưa mở rộng: chỉ hiện 1 dòng cho tệp tin đang đọc gần nhất */}
              {!isExpanded && seg.isRunning && seg.items.length > 0 && (
                <div style={{ marginLeft: '12px', marginTop: '2px', opacity: 0.85, fontSize: '12px' }}>
                  {renderAnalyzedItem(seg.items[seg.items.length - 1], seg.items.length - 1)}
                </div>
              )}

              {/* Expanded items inside explore group */}
              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px' }}>
                  {seg.items.map((tc, idx) => renderAnalyzedItem(tc, idx))}
                </div>
              )}
            </div>
          );
        }

        // B. File Edit Item (e.g. Edited ⚛️ MessageActionBar.tsx +1 -9)
        if (seg.type === 'edit') {
          const args = seg.tc.arguments || {};
          const rawPath = args.path || args.targetFile || args.TargetFile || args.AbsolutePath || args.filePath || '';
          const filename = rawPath ? String(rawPath).split(/[/\\]/).filter(Boolean).pop() || rawPath : 'file';

          let startLine = Number(args.StartLine || args.startLine) || 1;
          let endLine = Number(args.EndLine || args.endLine) || 0;
          if (endLine <= 0) {
            endLine = startLine + (seg.diff.additions || 1) - 1;
          }

          const isAcceptedForThis = acceptedEdits[seg.id] ?? false;

          return (
            <div
              key={seg.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '3px 0',
                marginTop: '3px',
                marginBottom: '2px',
                width: 'fit-content',
              }}
            >
              <div
                onClick={() => {
                  setAcceptedEdits((prev) => ({ ...prev, [seg.id]: false }));
                  onOpenFile?.(rawPath, { startLine, endLine, id: seg.id });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  cursor: onOpenFile ? 'pointer' : 'default',
                }}
                className="hover:text-white group"
                title={`Nhấn để mở và bôi đen đoạn mã trong Editor (${filename} L${startLine}-L${endLine})`}
              >
                <span style={{ color: '#9ca3af' }}>{seg.diff.isNew ? 'Created' : 'Edited'}</span>
                <StandardFileIcon filename={filename} size={15} />
                <span style={{ color: '#f4f4f5', fontWeight: 500 }} className="group-hover:underline">
                  {filename}
                </span>
                <div style={{ display: 'inline-flex', gap: '4px', fontSize: '12px', fontFamily: "'Cascadia Code', monospace" }}>
                  <span style={{ color: '#22c55e' }}>+{seg.diff.additions}</span>
                  <span style={{ color: '#ef4444' }}>-{seg.diff.deletions}</span>
                </div>
              </div>
            </div>
          );
        }

        // C. Command Item (e.g. Ran go test ./...)
        if (seg.type === 'cmd') {
          const cmd = String(seg.tc.arguments?.command || seg.tc.arguments?.CommandLine || seg.tc.arguments?.cmd || '').trim();
          const output = String(seg.tc.result || '').trim();
          const isCmdExecuting = isLive && !seg.tc.result && sIdx === blocks.length - 1;
          const hasError = Boolean(seg.tc.isError) || output.includes('ParserError') || output.includes("The token '&&'") || output.includes('SyntaxError');
          const isBackground = output.includes('[TIEN TRINH CHAY NGAM]') || output.includes('TaskId:');
          const isCmdExpanded = expandedCmds[seg.id] ?? hasError;
          const isCopied = copiedCmds[seg.id] ?? false;

          const taskIdMatch = output.match(/TaskId:\s*["']?([^"'\s]+)["']?/);
          const taskId = taskIdMatch ? taskIdMatch[1] : null;
          const isKilled = killedCmds[seg.id] ?? false;

          const handleCopyCmd = (e: React.MouseEvent) => {
            e.stopPropagation();
            navigator.clipboard.writeText(output ? `${cmd}\n\n${output}` : cmd);
            setCopiedCmds((prev) => ({ ...prev, [seg.id]: true }));
            setTimeout(() => {
              setCopiedCmds((prev) => ({ ...prev, [seg.id]: false }));
            }, 2000);
          };

          if (dismissedCmds[seg.id]) {
            return null;
          }

          const handleCloseOrKillCmd = async (e: React.MouseEvent) => {
            e.stopPropagation();
            try {
              if (!isKilled && (isBackground || isCmdExecuting || taskId)) {
                if (taskId) {
                  await WailsService.killTask(taskId);
                } else {
                  await WailsService.killAllBackgroundTasks();
                }
                setKilledCmds((prev) => ({ ...prev, [seg.id]: true }));
              }
            } catch (err) {
              console.error('Lỗi khi tắt lệnh:', err);
            }
            setDismissedCmds((prev) => ({ ...prev, [seg.id]: true }));
          };

          return (
            <div
              key={seg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginTop: sIdx > 0 ? '6px' : '2px',
                marginBottom: '4px',
                width: '100%',
              }}
            >
              {/* Command Pill Bar */}
              <div
                onClick={() => setExpandedCmds((prev) => ({ ...prev, [seg.id]: !isCmdExpanded }))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: isCmdExpanded ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.025)',
                  border: isKilled
                    ? '1px solid rgba(239, 68, 68, 0.45)'
                    : hasError
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : isBackground
                    ? '1px solid rgba(245, 158, 11, 0.35)'
                    : isCmdExpanded
                    ? '1px solid rgba(56, 189, 248, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.07)',
                  cursor: 'pointer',
                  width: 'fit-content',
                  maxWidth: '100%',
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
                className="hover:bg-white/10 group"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Terminal size={13} color={isKilled ? '#f87171' : hasError ? '#f87171' : isBackground ? '#fbbf24' : '#38bdf8'} style={{ flexShrink: 0 }} />
                  <span style={{ color: '#a1a1aa', fontSize: '12.5px', fontWeight: 500 }}>Ran</span>
                </div>

                <span
                  style={{
                    color: isKilled ? '#f87171' : hasError ? '#fca5a5' : '#f4f4f5',
                    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                    fontSize: '11.5px',
                    wordBreak: 'break-all',
                    maxWidth: '520px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={cmd}
                >
                  {cmd}
                </span>

                {/* Status chip */}
                {isKilled ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      color: '#f87171',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    <Square size={10} fill="#f87171" />
                    <span>Đã dừng</span>
                  </span>
                ) : isCmdExecuting ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#38bdf8',
                      fontSize: '11px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    <Loader2 size={10} className="animate-spin" />
                    <span>Đang chạy...</span>
                  </span>
                ) : hasError ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      color: '#ef4444',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'rgba(239, 68, 68, 0.12)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    <AlertTriangle size={10} />
                    <span>Lỗi</span>
                  </span>
                ) : isBackground ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      color: '#f59e0b',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'rgba(245, 158, 11, 0.12)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    <span>⏳ Chạy ngầm</span>
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      color: '#22c55e',
                      fontSize: '11px',
                      fontWeight: 500,
                      opacity: 0.9,
                    }}
                  >
                    <CheckCircle2 size={12} />
                  </span>
                )}

                {output ? (
                  isCmdExpanded ? <ChevronDown size={12} color="#71717a" /> : <ChevronRight size={12} color="#71717a" />
                ) : null}

                {/* Nút X để tắt tiến trình & đóng/ẩn khung lệnh này */}
                <button
                  type="button"
                  onClick={handleCloseOrKillCmd}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#a1a1aa',
                    borderRadius: '4px',
                    padding: '2px 4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    marginLeft: '2px',
                  }}
                  className="hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                  title="Tắt tiến trình & Đóng khung lệnh này (X)"
                >
                  <X size={11} />
                </button>
              </div>

              {/* Collapsible Inline Terminal Output Window */}
              {isCmdExpanded && (output || isCmdExecuting) && (
                <div
                  style={{
                    borderRadius: '7px',
                    background: '#09090c',
                    border: isKilled
                      ? '1px solid rgba(239, 68, 68, 0.45)'
                      : hasError
                      ? '1px solid rgba(239, 68, 68, 0.35)'
                      : isBackground
                      ? '1px solid rgba(245, 158, 11, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
                    maxWidth: '100%',
                    width: '100%',
                    marginTop: '2px',
                  }}
                >
                  {/* Console Header Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      background: '#121217',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: isKilled ? '#ef4444' : hasError ? '#ef4444' : isBackground ? '#f59e0b' : '#22c55e',
                        }}
                      />
                      <span style={{ color: '#d4d4d8', fontWeight: 600 }}>
                        {isKilled ? 'Đã tắt / dừng tiến trình' : hasError ? 'PowerShell (Parser / Execution Error)' : isBackground ? 'Tiến trình chạy ngầm (Background Task)' : 'PowerShell Console'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleCloseOrKillCmd}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#a1a1aa',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          transition: 'all 0.15s ease',
                        }}
                        className="hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                        title="Tắt tiến trình & Đóng khung này (X)"
                      >
                        <X size={12} />
                        <span>Tắt (X)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyCmd}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#1c1c22',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: isCopied ? '#22c55e' : '#a1a1aa',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                        className="hover:text-white"
                        title="Sao chép nội dung câu lệnh và output"
                      >
                        {isCopied ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
                        <span>{isCopied ? 'Đã chép' : 'Chép output'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Console Body */}
                  <div
                    style={{
                      padding: '10px 14px',
                      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                      fontSize: '11.5px',
                      lineHeight: '1.5',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      color: isKilled ? '#fca5a5' : hasError ? '#fca5a5' : isBackground ? '#fde68a' : '#e4e4e7',
                      userSelect: 'text',
                    }}
                  >
                    <div style={{ color: '#71717a', marginBottom: '6px' }}>PS &gt; {cmd}</div>
                    {output || (isCmdExecuting ? 'Đang thực thi lệnh trên hệ thống...' : '(Không có dữ liệu xuất ra)')}
                    {isKilled && (
                      <div style={{ color: '#f87171', marginTop: '6px', fontWeight: 600 }}>
                        [TIẾN TRÌNH ĐÃ ĐƯỢC TẮT / DỪNG THÀNH CÔNG THEO YÊU CẦU NGƯỜI DÙNG]
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        }

        return null;
  };

  if (blocks.length === 0 && !isLive) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        maxWidth: '96%',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        userSelect: 'none',
        marginBottom: '6px',
      }}
    >
      {/* Khối tuần tự được in ra theo đúng thứ tự luồng chạy (khớp hoàn toàn Ảnh 1 & Ảnh 2) */}
      {blocks.map((block, bIdx) => {
        if (block.type === 'thought') {
          return renderThoughtBlock(block.text, block.id, block.seconds, block.isLiveActive);
        }
        if (block.type === 'analyzed_single') {
          return renderAnalyzedItem(block.tc, bIdx, true);
        }
        return renderSegmentBody(block, bIdx);
      })}

      {/* Live Animated Agent Working indicator (Khớp Ảnh 1: Working...) */}
      {isLive && (
        <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px', userSelect: 'none' }}>
          <style>{`
            @keyframes dot-blink {
              0%, 20% { opacity: 0; }
              50% { opacity: 1; }
              80%, 100% { opacity: 0; }
            }
            .wd1 { animation: dot-blink 1.4s infinite 0s; }
            .wd2 { animation: dot-blink 1.4s infinite 0.2s; }
            .wd3 { animation: dot-blink 1.4s infinite 0.4s; }
          `}</style>
          <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: 500 }}>Working</span>
          <span className="wd1" style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: 700 }}>.</span>
          <span className="wd2" style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: 700 }}>.</span>
          <span className="wd3" style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: 700 }}>.</span>
        </div>
      )}
    </div>
  );
};
