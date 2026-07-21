"use client";

// components/club/DeleteConfirmButton.tsx
import { useState } from "react";
import { deleteEntity } from "@/lib/club-crud-actions";

type EntityType =
  | "team"
  | "player"
  | "coach"
  | "document"
  | "folder"
  | "communication_group"
  | "communication_campaign"
  | "cotisation"
  | "cotisation_reminder"
  | "finance_entry"
  | "sponsor"
  | "task"
  | "notification"
  | "event"
  | "training_slot"
  | "gymnase";

export default function DeleteConfirmButton({
  clubId,
  entityType,
  entityId,
  label = "Supprimer",
  confirmLabel = "Confirmer",
  title = "Supprimer cet élément ?",
  onDeleted,
  className,
}: {
  clubId: string;
  entityType: EntityType;
  entityId: string;
  label?: string;
  confirmLabel?: string;
  title?: string;
  onDeleted?: () => void | Promise<void>;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 3500);
      return;
    }

    if (!confirm(title)) return;

    setLoading(true);

    try {
      await deleteEntity({ clubId, entityType, id: entityId });
      await onDeleted?.();
    } catch (e: any) {
      alert(e?.message || "Suppression impossible.");
    } finally {
      setLoading(false);
      setArmed(false);
    }
  }

  return (
    <button
      type="button"
      className={className || "deleteBtn"}
      disabled={loading}
      onClick={remove}
      title={title}
    >
      {loading ? "Suppression..." : armed ? confirmLabel : label}

      <style jsx>{`
        .deleteBtn{
          border:1px solid #f1d3cf;
          background:#fff0f0;
          color:#b91c1c;
          border-radius:999px;
          padding:8px 11px;
          font-weight:900;
          cursor:pointer;
        }

        .deleteBtn:hover{
          background:#ffe4e4;
        }

        .deleteBtn:disabled{
          opacity:.55;
          cursor:not-allowed;
        }
      `}</style>
    </button>
  );
}
