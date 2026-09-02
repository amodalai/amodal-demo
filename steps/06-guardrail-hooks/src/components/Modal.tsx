import type { ReactNode } from "react";

export function Modal({
  title,
  sub,
  error,
  busy,
  confirmLabel,
  busyLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  sub?: ReactNode;
  error?: string;
  busy: boolean;
  confirmLabel: string;
  busyLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{title}</h2>
        {sub ? <p className="sub">{sub}</p> : null}
        {children}
        {error ? <div className="banner error">{error}</div> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
