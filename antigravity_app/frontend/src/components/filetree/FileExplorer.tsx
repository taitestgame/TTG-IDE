import React from 'react';
import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { StandardFileIcon } from '../common/StandardFileIcon';

interface FileExplorerProps {
  files: string[];
  activeFile: string;
  onSelectFile: (file: string) => void;
  onRefresh: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFile,
  onSelectFile,
  onRefresh
}) => {
  return (
    <div style={{
      width: '240px',
      height: '100%',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      fontSize: '13px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-color)',
        fontWeight: 600,
        textTransform: 'uppercase',
        fontSize: '11px',
        letterSpacing: '0.5px',
        color: 'var(--text-muted)'
      }}>
        <span>Explorer</span>
        <button
          onClick={onRefresh}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {files.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
            Không có file nào
          </div>
        ) : (
          files.map((file, idx) => {
            const isDir = file.endsWith('/');
            const isActive = activeFile === file;
            return (
              <div
                key={idx}
                onClick={() => !isDir && onSelectFile(file)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  cursor: isDir ? 'default' : 'pointer',
                  background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  color: isActive ? '#38bdf8' : 'var(--text-primary)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {isDir ? (
                  <>
                    <StandardFileIcon filename={file.replace('/', '')} isFolder={true} size={15} />
                    <span>{file.replace('/', '')}</span>
                  </>
                ) : (
                  <>
                    <StandardFileIcon filename={file} size={15} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file}
                    </span>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
