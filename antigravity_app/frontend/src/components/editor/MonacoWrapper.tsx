import React from 'react';
import Editor from '@monaco-editor/react';

export interface HighlightRange {
  startLine: number;
  endLine: number;
  id?: string;
}

interface MonacoWrapperProps {
  filePath: string;
  content: string;
  onChange: (value: string) => void;
  highlightRange?: HighlightRange | null;
}

export const MonacoWrapper: React.FC<MonacoWrapperProps> = ({
  filePath,
  content,
  onChange,
  highlightRange,
}) => {
  const editorRef = React.useRef<any>(null);
  const monacoRef = React.useRef<any>(null);
  const decorationsRef = React.useRef<string[]>([]);

  // Tự động nhận diện ngôn ngữ lập trình dựa vào đuôi mở rộng của file
  const getLanguage = (path: string) => {
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.go')) return 'go';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  // Tối ưu bộ nhớ: tắt worker semantic nặng và dọn dẹp các model cũ
  const handleBeforeMount = (monaco: any) => {
    if (monaco?.languages?.typescript) {
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
    }
  };

  const applyHighlight = (editor: any, monaco: any, range?: HighlightRange | null) => {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (!range || range.startLine <= 0) {
      // Xoá bôi đen và viền highlight khi chấp nhận (Accept)
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      const pos = editor.getPosition();
      if (pos) {
        editor.setSelection({
          startLineNumber: pos.lineNumber,
          startColumn: pos.column,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        });
      }
      return;
    }

    const maxLine = model.getLineCount();
    const startL = Math.max(1, Math.min(range.startLine, maxLine));
    const endL = Math.max(startL, Math.min(range.endLine, maxLine));
    const maxCol = model.getLineMaxColumn(endL);

    // 1. Cuộn đến vị trí đoạn code ở chính giữa màn hình editor
    editor.revealRangeInCenter({
      startLineNumber: startL,
      startColumn: 1,
      endLineNumber: endL,
      endColumn: maxCol,
    });

    // 2. Bôi đen đoạn code (Selection hiển thị khớp chính xác 100% Ảnh 2 của người dùng)
    editor.setSelection({
      startLineNumber: startL,
      startColumn: 1,
      endLineNumber: endL,
      endColumn: maxCol,
    });

    // 3. Đánh dấu viền màu và background highlight cho đoạn code
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(startL, 1, endL, maxCol),
        options: {
          isWholeLine: true,
          className: 'monaco-code-change-highlight',
          inlineClassName: 'monaco-code-change-inline',
          overviewRuler: {
            color: '#38bdf8',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      },
    ]);
  };

  const handleMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    try {
      const currentUri = monaco.Uri.file(filePath).toString();
      const models = monaco.editor.getModels();
      models.forEach((m: any) => {
        if (m.uri.toString() !== currentUri) {
          m.dispose();
        }
      });
    } catch {}

    if (highlightRange) {
      applyHighlight(editor, monaco, highlightRange);
    }
  };

  React.useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      applyHighlight(editorRef.current, monacoRef.current, highlightRange);
    }
  }, [highlightRange, filePath]);

  return (
    <div style={{ flex: 1, height: '100%', position: 'relative', background: '#0a0d14' }}>
      <style>{`
        .monaco-code-change-highlight {
          background: rgba(14, 165, 233, 0.22) !important;
          border-left: 3px solid #38bdf8 !important;
        }
        .monaco-code-change-inline {
          background: rgba(56, 189, 248, 0.18) !important;
        }
      `}</style>
      <Editor
        height="100%"
        theme="vs-dark"
        path={filePath}
        language={getLanguage(filePath)}
        value={content}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(val) => onChange(val || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'Fira Code', Consolas, Monaco, monospace",
          fontLigatures: true,
          smoothScrolling: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  );
};
