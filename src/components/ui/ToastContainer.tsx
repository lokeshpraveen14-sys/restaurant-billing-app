import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { CheckCircle, XCircle, Warning, Info, X } from '@phosphor-icons/react';

const ICONS = {
  success: <CheckCircle size={20} color="var(--status-free)" />,
  error: <XCircle size={20} color="var(--status-occupied)" />,
  warning: <Warning size={20} color="var(--status-reserved)" />,
  info: <Info size={20} color="var(--status-billing)" />,
};

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="toast-container no-print">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-icon">{ICONS[toast.type]}</span>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
