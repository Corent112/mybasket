"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

/* --------------------------------------------------------------------- */
/* Toast                                                                  */
/* --------------------------------------------------------------------- */

export type ToastState = { message: string; tone: "info" | "success" | "error" } | null;

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;

  const toneClass =
    toast.tone === "error"
      ? styles.toastError
      : toast.tone === "success"
        ? styles.toastSuccess
        : "";

  return (
    <div className={`${styles.toast} ${toneClass}`} role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  const notify = useCallback(
    (message: string, tone: "info" | "success" | "error" = "info") => {
      setToast({ message, tone });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === "error" ? 6000 : 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, notify };
}

/* --------------------------------------------------------------------- */
/* Modale                                                                 */
/* --------------------------------------------------------------------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer ? <div className={styles.modalFoot}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Confirmation de suppression                                            */
/* --------------------------------------------------------------------- */

export type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
} | null;

export function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!state) return null;

  return (
    <Modal
      title={state.title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await state.onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Suppression…" : state.confirmLabel || "Supprimer définitivement"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "#4d4448" }}>
        {state.message}
      </p>
    </Modal>
  );
}

/* --------------------------------------------------------------------- */
/* Champs de formulaire                                                   */
/* --------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {message}
    </div>
  );
}

export function Notice({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "error" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error" ? styles.noticeError : tone === "info" ? styles.noticeInfo : "";
  return <div className={`${styles.notice} ${toneClass}`}>{children}</div>;
}

/* --------------------------------------------------------------------- */
/* Divers                                                                 */
/* --------------------------------------------------------------------- */

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export { styles as uiStyles };
