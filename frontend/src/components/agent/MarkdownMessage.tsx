import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { StandardFileIcon } from '../common/StandardFileIcon';

interface MarkdownMessageProps {
  content: string;
  onOpenFile?: (path: string, line?: number) => void;
  sender?: 'user' | 'agent';
}

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = (language || 'code').trim().toUpperCase();

  return (
    <div
      style={{
        margin: '10px 0',
        borderRadius: '6px',
        border: '1px solid #27272a',
        background: '#121215',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Code Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: '#18181b',
          borderBottom: '1px solid #27272a',
          fontSize: '11px',
          fontWeight: 600,
          color: '#a1a1aa',
          userSelect: 'none',
        }}
      >
        <span>{displayLang}</span>
        <button
          onClick={handleCopy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: copied ? '#22c55e' : '#a1a1aa',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'all 0.15s ease',
          }}
          className="hover:bg-zinc-800 hover:text-white"
          title="Sao chép đoạn mã"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
        </button>
      </div>

      {/* Code Content */}
      <pre
        className="selectable-text"
        style={{
          margin: 0,
          padding: '12px 14px',
          overflowX: 'auto',
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
          fontSize: '12.5px',
          lineHeight: '1.55',
          color: '#e4e4e7',
          background: '#121215',
          userSelect: 'text',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, onOpenFile, sender = 'agent' }) => {
  if (!content) return null;

  // Loại bỏ các thẻ <tool_call>...</tool_call> thô nếu model in ra text
  let raw = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
  if (!raw && content.includes('<tool_call>')) {
    return null;
  }

  // Clean scratchpad headers if any, without replacing with hardcoded text
  if (sender === 'agent' && (raw.includes('Objective') || raw.includes('Work State') || raw.includes('Important Details') || raw.includes('Relevant Files'))) {
    const useful: string[] = [];
    let skip = false;
    for (const l of raw.split('\n')) {
      const t = l.trim();
      const cleanHead = t.replace(/^#+\s*|\*+\s*|-\s*|•\s*/g, '').toLowerCase();
      if (
        cleanHead.startsWith('objective') || cleanHead.startsWith('work state') || cleanHead.startsWith('next move') ||
        cleanHead.startsWith('important details') || cleanHead.startsWith('relevant files') ||
        cleanHead.startsWith('completed') || cleanHead.startsWith('active') || cleanHead.startsWith('blocked')
      ) {
        skip = true;
        continue;
      }
      if (t.startsWith('## ') && !t.includes('Objective') && !t.includes('Work State') && !t.includes('Details') && !t.includes('Files')) {
        skip = false;
      }
      if (!skip) useful.push(l);
    }
    const filtered = useful.join('\n').trim();
    if (filtered.length > 0) {
      raw = filtered;
    }
  }

  // Helper to check if string looks like a source / project file
  const isFilePath = (str: string): boolean => {
    const s = str.trim();
    if (!s || s.includes(' ') || s.length < 3) return false;
    return /\.(?:py|go|ts|tsx|js|jsx|html|css|json|md|txt|sql|yaml|yml|toml|sh|bat|rs|c|cpp|h|png|jpg|jpeg|svg|lua|proto)$/i.test(s);
  };

  // Parse inline elements (bold, inline code, @filename, URLs, file badges)
  const renderInline = (text: string): React.ReactNode => {
    // Regex matches: @file.ext, `code`, **bold**, [text](url), raw URLs, standalone file.ext
    const tokenRegex = /(@[a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+|`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\)]+\)|https?:\/\/[^\s<>"]+|\b[a-zA-Z0-9_\-/\\]+\.(?:py|go|ts|tsx|js|jsx|html|css|json|md|txt|sql|yaml|yml|toml|sh|bat|rs|c|cpp|h)\b)/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (!part) return null;

      // Clickable raw HTTP / HTTPS URLs (e.g. http://localhost:5173/ or https://...)
      if (/^https?:\/\//i.test(part)) {
        return (
          <a
            key={idx}
            href={part}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const w = window as any;
              if (w.runtime && w.runtime.BrowserOpenURL) {
                w.runtime.BrowserOpenURL(part);
              } else {
                window.open(part, '_blank');
              }
            }}
            style={{
              color: '#38bdf8',
              textDecoration: 'underline',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              verticalAlign: 'middle',
              fontWeight: 500,
            }}
            className="hover:text-sky-300"
            title={`Mở liên kết trong trình duyệt: ${part}`}
          >
            <span>{part}</span>
            <ExternalLink size={12} style={{ verticalAlign: 'middle', flexShrink: 0 }} />
          </a>
        );
      }

      // Clickable @filename badge with standard file icon
      if (part.startsWith('@') && part.includes('.')) {
        const cleanName = part.slice(1);
        return (
          <span
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile?.(cleanName);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#1f1f23',
              border: '1px solid #2e2e34',
              borderRadius: '4px',
              padding: '1px 6px',
              color: '#e4e4e7',
              fontFamily: "'Cascadia Code', monospace",
              fontWeight: 500,
              fontSize: '12px',
              cursor: onOpenFile ? 'pointer' : 'default',
              margin: '0 2px',
              verticalAlign: 'middle',
              transition: 'all 0.15s ease',
            }}
            className="hover:bg-zinc-800 hover:border-zinc-600 group"
            title={`Nhấn để mở ${cleanName} trong editor`}
          >
            <StandardFileIcon filename={cleanName} size={13} />
            <span className="group-hover:underline">@{cleanName}</span>
          </span>
        );
      }

      // Inline code `code` (e.g. `filemmmm.py` or code snippets)
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        const rawCode = part.slice(1, -1).trim();
        if (isFilePath(rawCode)) {
          const fileName = rawCode.split(/[/\\]/).pop() || rawCode;
          return (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile?.(rawCode);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#1f1f23',
                border: '1px solid #2e2e34',
                borderRadius: '5px',
                padding: '1.5px 7px',
                fontFamily: "'Cascadia Code', monospace",
                fontSize: '12px',
                fontWeight: 500,
                color: '#e4e4e7',
                cursor: onOpenFile ? 'pointer' : 'default',
                margin: '0 2px',
                verticalAlign: 'middle',
                transition: 'all 0.15s ease',
              }}
              className="hover:bg-zinc-800 hover:border-zinc-600 group"
              title={`Nhấn để mở tệp ${rawCode} trong trình soạn thảo`}
            >
              <StandardFileIcon filename={fileName} size={14} />
              <span className="group-hover:underline">{rawCode}</span>
            </span>
          );
        }

        return (
          <code
            key={idx}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '4px',
              padding: '1.5px 5px',
              fontFamily: "'Cascadia Code', monospace",
              fontSize: '12px',
              color: '#38bdf8',
              margin: '0 2px',
              wordBreak: 'break-all',
              overflowWrap: 'break-word',
            }}
          >
            {rawCode}
          </code>
        );
      }

      // Standalone filename match without backticks (e.g. filemmmm.py or src/App.tsx)
      if (isFilePath(part.trim())) {
        const cleanFile = part.trim();
        const fileName = cleanFile.split(/[/\\]/).pop() || cleanFile;
        return (
          <span
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile?.(cleanFile);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '5px',
              padding: '1.5px 7px',
              fontFamily: "'Cascadia Code', monospace",
              fontSize: '12px',
              fontWeight: 600,
              color: '#38bdf8',
              cursor: onOpenFile ? 'pointer' : 'default',
              margin: '0 2px',
              verticalAlign: 'middle',
              transition: 'all 0.15s ease',
            }}
            className="hover:bg-sky-500/20 hover:border-sky-400 group"
            title={`Nhấn để mở tệp ${cleanFile} trong trình soạn thảo`}
          >
            <StandardFileIcon filename={fileName} size={14} />
            <span className="group-hover:underline">{cleanFile}</span>
          </span>
        );
      }

      // Bold **bold text**
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={idx} style={{ fontWeight: 600, color: '#ffffff' }}>
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Markdown links [label](url)
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        const label = linkMatch[1];
        const target = linkMatch[2];
        const isFile =
          target.startsWith('file://') ||
          isFilePath(target.replace(/^file:\/\/\/?/, '').split('#')[0]) ||
          isFilePath(label);

        if (isFile) {
          const cleanPath = target.replace(/^file:\/\/\/?/, '').split('#')[0] || label;
          const lineMatch = target.match(/#L(\d+)/);
          const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
          return (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile?.(cleanPath, lineNum);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#1f1f23',
                border: '1px solid #2e2e34',
                borderRadius: '5px',
                padding: '1.5px 7px',
                color: '#e4e4e7',
                fontFamily: "'Cascadia Code', monospace",
                fontWeight: 500,
                fontSize: '12px',
                cursor: onOpenFile ? 'pointer' : 'default',
                margin: '0 2px',
                verticalAlign: 'middle',
                transition: 'all 0.15s ease',
              }}
              className="hover:bg-zinc-800 hover:border-zinc-600 group"
              title={`Nhấn để mở tệp ${cleanPath} trong trình soạn thảo`}
            >
              <StandardFileIcon filename={cleanPath} size={14} />
              <span className="group-hover:underline">{label}</span>
            </span>
          );
        }

        return (
          <a
            key={idx}
            href={target}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const w = window as any;
              if (w.runtime && w.runtime.BrowserOpenURL) {
                w.runtime.BrowserOpenURL(target);
              } else {
                window.open(target, '_blank');
              }
            }}
            style={{
              color: '#38bdf8',
              textDecoration: 'underline',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              verticalAlign: 'middle',
              fontWeight: 500,
            }}
            className="hover:text-sky-300"
            title={`Mở liên kết trong trình duyệt: ${target}`}
          >
            <span>{label}</span>
            <ExternalLink size={12} style={{ verticalAlign: 'middle', flexShrink: 0 }} />
          </a>
        );
      }

      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  // Split content by code blocks ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_\-\+]*)\r?\n([\s\S]*?)```/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const processTextBlocks = (text: string, keyPrefix: string) => {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const pText = currentParagraph.join('\n');
        nodes.push(
          <div
            key={`${keyPrefix}_p_${nodes.length}`}
            style={{
              margin: sender === 'user' ? '0' : '4px 0',
              lineHeight: '1.65',
              whiteSpace: 'pre-wrap',
            }}
          >
            {renderInline(pText)}
          </div>
        );
        currentParagraph = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Highlighted Status Line (e.g. ✅, ⚡, ❌, 🎉)
      if (trimmed.startsWith('✅') || trimmed.startsWith('⚡') || trimmed.startsWith('❌') || trimmed.startsWith('🎉')) {
        flushParagraph();
        nodes.push(
          <div
            key={`${keyPrefix}_status_${i}`}
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: '#ffffff',
              margin: '8px 0 4px 0',
              lineHeight: '1.6',
            }}
          >
            {renderInline(trimmed)}
          </div>
        );
        continue;
      }

      // Heading 1 (# ...)
      if (trimmed.startsWith('# ')) {
        flushParagraph();
        nodes.push(
          <h1
            key={`${keyPrefix}_h1_${i}`}
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#ffffff',
              margin: '12px 0 6px 0',
              paddingBottom: '4px',
              borderBottom: '1px solid #27272a',
            }}
          >
            {renderInline(trimmed.slice(2))}
          </h1>
        );
        continue;
      }

      // Heading 2 (## ...)
      if (trimmed.startsWith('## ')) {
        flushParagraph();
        nodes.push(
          <h2
            key={`${keyPrefix}_h2_${i}`}
            style={{
              fontSize: '14.5px',
              fontWeight: 600,
              color: '#ffffff',
              margin: '10px 0 4px 0',
            }}
          >
            {renderInline(trimmed.slice(3))}
          </h2>
        );
        continue;
      }

      // Heading 3 (### ...)
      if (trimmed.startsWith('### ')) {
        flushParagraph();
        nodes.push(
          <h3
            key={`${keyPrefix}_h3_${i}`}
            style={{
              fontSize: '13.5px',
              fontWeight: 600,
              color: '#f4f4f5',
              margin: '8px 0 3px 0',
            }}
          >
            {renderInline(trimmed.slice(4))}
          </h3>
        );
        continue;
      }

      // Markdown Table: detects | Header 1 | Header 2 | followed by |---|---|
      const isTableRow = (str: string) => {
        const s = str.trim();
        return s.startsWith('|') || (s.includes('|') && s.endsWith('|')) || (s.split('|').length >= 3);
      };
      const isTableSeparator = (str: string) => {
        const s = str.trim();
        return /^[\|\s:\-]+$/.test(s) && s.includes('-') && s.includes('|');
      };

      if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushParagraph();
        const headerRow = trimmed;
        const alignRow = lines[i + 1].trim();
        const dataRows: string[] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim() && isTableRow(lines[j])) {
          dataRows.push(lines[j].trim());
          j++;
        }

        const parseCells = (rowStr: string) => {
          let s = rowStr.trim();
          if (s.startsWith('|')) s = s.slice(1);
          if (s.endsWith('|')) s = s.slice(0, -1);
          return s.split('|').map((c) => c.trim());
        };

        const headers = parseCells(headerRow);
        const alignments = parseCells(alignRow).map((cell) => {
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          return 'left';
        });

        nodes.push(
          <div
            key={`${keyPrefix}_tbl_${i}`}
            style={{
              margin: '12px 0',
              overflowX: 'auto',
              borderRadius: '8px',
              border: '1px solid #27272a',
              background: '#121215',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#18181b', borderBottom: '1px solid #3f3f46' }}>
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      style={{
                        padding: '9px 14px',
                        fontWeight: 600,
                        color: '#f4f4f5',
                        textAlign: (alignments[hIdx] as any) || 'left',
                        borderRight: hIdx < headers.length - 1 ? '1px solid #27272a' : 'none',
                      }}
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((dRow, rIdx) => {
                  const cells = parseCells(dRow);
                  const isEven = rIdx % 2 === 0;
                  return (
                    <tr
                      key={rIdx}
                      style={{
                        background: isEven ? '#121215' : '#16161a',
                        borderBottom: rIdx < dataRows.length - 1 ? '1px solid #27272a' : 'none',
                      }}
                      className="hover:bg-white/[0.04]"
                    >
                      {headers.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '8px 14px',
                            color: '#e4e4e7',
                            textAlign: (alignments[cIdx] as any) || 'left',
                            borderRight: cIdx < headers.length - 1 ? '1px solid #27272a' : 'none',
                            lineHeight: '1.5',
                          }}
                        >
                          {renderInline(cells[cIdx] || '')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );

        i = j - 1;
        continue;
      }

      // List item (- or * or numbered 1.)
      const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        flushParagraph();
        nodes.push(
          <div
            key={`${keyPrefix}_li_${i}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              margin: '3px 0',
              paddingLeft: '6px',
              lineHeight: '1.6',
            }}
          >
            <span style={{ color: '#71717a', flexShrink: 0, userSelect: 'none' }}>
              {listMatch[1].endsWith('.') ? listMatch[1] : '•'}
            </span>
            <div style={{ flex: 1 }}>{renderInline(listMatch[2])}</div>
          </div>
        );
        continue;
      }

      // Empty line -> paragraph separator
      if (!trimmed) {
        flushParagraph();
        continue;
      }

      currentParagraph.push(line);
    }

    flushParagraph();
    return nodes;
  };

  while ((match = codeBlockRegex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = raw.slice(lastIndex, match.index);
      elements.push(...processTextBlocks(textChunk, `text_${lastIndex}`));
    }
    const lang = match[1] || '';
    const code = match[2];
    elements.push(<CodeBlock key={`code_${match.index}`} language={lang} code={code} />);
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < raw.length) {
    const textChunk = raw.slice(lastIndex);
    elements.push(...processTextBlocks(textChunk, `text_${lastIndex}`));
  }

  return (
    <div
      className="markdown-content selectable-text"
      style={{
        width: '100%',
        color: sender === 'agent' ? '#e4e4e7' : '#f4f4f5',
        fontSize: '13px',
        lineHeight: '1.6',
        userSelect: 'text',
      }}
    >
      {elements}
    </div>
  );
};
