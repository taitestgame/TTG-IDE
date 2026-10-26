import React, { useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Download, Maximize2 } from 'lucide-react';

interface ImageViewerModalProps {
  src: string | null;
  onClose: () => void;
  alt?: string;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ src, onClose, alt }) => {
  useEffect(() => {
    if (!src) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = src;
    link.download = `image_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      {/* Action Header Deck */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '16px',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 100000,
        }}
      >
        <button
          onClick={handleDownload}
          style={{
            background: 'rgba(39, 39, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#f4f4f5',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
          className="hover:bg-sky-600 hover:border-sky-500"
          title="Tải ảnh về máy"
        >
          <Download size={14} />
          <span>Tải về</span>
        </button>

        <button
          onClick={onClose}
          style={{
            background: 'rgba(39, 39, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#f4f4f5',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          className="hover:bg-red-500 hover:border-red-500"
          title="Đóng (Escape)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Main Image Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw',
          maxHeight: '88vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          background: '#09090b',
        }}
      >
        <img
          src={src}
          alt={alt || 'Xem ảnh'}
          style={{
            maxWidth: '92vw',
            maxHeight: '88vh',
            objectFit: 'contain',
            display: 'block',
            userSelect: 'none',
          }}
        />
      </div>
    </div>
  );
};
