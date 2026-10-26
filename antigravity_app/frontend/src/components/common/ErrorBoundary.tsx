import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#121215',
            color: '#f4f4f5',
            padding: '24px',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              background: '#18181b',
              border: '1px solid #ef4444',
              borderRadius: '12px',
              padding: '28px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            }}
          >
            <AlertTriangle size={42} color="#ef4444" style={{ margin: '0 auto 14px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px', color: '#ffffff' }}>
              Đã khôi phục sau sự cố giao diện
            </h2>
            <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '0 0 16px', lineHeight: '1.6' }}>
              {this.props.fallbackMessage ||
                'Ứng dụng vừa gặp một lỗi hiển thị đột xuất nhưng đã được bảo vệ để không bị treo. Bạn có thể bấm nút bên dưới để khôi phục lại màn hình.'}
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#f87171',
                  textAlign: 'left',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  marginBottom: '18px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                padding: '9px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              className="hover:bg-sky-600"
            >
              <RefreshCw size={14} />
              Khôi phục lại giao diện
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
