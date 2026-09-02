"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getCurrentUserRole,
  getSystem,
  submitSystemForReview,
  type SystemItem,
} from "@/lib/systems";
import { createClient } from "@/lib/supabase/client";
import SystemeDetailClient from "./SystemeDetailClient";

function label(status?: SystemItem["review_status"]) {
  if (status === "submitted") return "Proposition envoyée au CEO";
  if (status === "approved") return "Validé";
  if (status === "rejected") return "Refusé";
  return "Brouillon personnel";
}

export default function SystemeDetailPermissions() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [system, setSystem] = useState<SystemItem | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCeo, setIsCeo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);

      if (user) {
        const role = await getCurrentUserRole();
        setIsCeo(role === "ceo" || role === "superadmin");
      }

      if (id) {
        setSystem(await getSystem(id));
      }
    }

    void load();
  }, [id]);

  const isOwner = Boolean(system && userId && system.user_id === userId);
  const isOfficialPublic = Boolean(
    system?.visibility === "public" && system?.review_status === "approved"
  );
  const canEdit = Boolean(
    isCeo ||
      (isOwner && !isOfficialPublic && system?.review_status !== "submitted")
  );
  const canSubmit = Boolean(
    !isCeo &&
      isOwner &&
      !isOfficialPublic &&
      (system?.review_status === "draft" ||
        system?.review_status === "rejected" ||
        !system?.review_status)
  );
  const isPersonal = Boolean(isOwner && !isOfficialPublic);

  async function submit() {
    if (!system || !canSubmit) return;

    const confirmed = window.confirm(
      `Proposer « ${system.title || "ce système"} » au CEO ?\n\nTu ne pourras plus le modifier pendant sa validation.`
    );

    if (!confirmed) return;

    try {
      setSubmitting(true);
      const ok = await submitSystemForReview(system.id);

      if (!ok) {
        alert("La proposition n’a pas pu être envoyée.");
        return;
      }

      setSystem((current) =>
        current
          ? {
              ...current,
              visibility: "private",
              review_status: "submitted",
              submitted_at: new Date().toISOString(),
            }
          : current
      );
      alert("Système proposé au CEO ✅");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`${canEdit ? "" : "sd-no-edit"} ${
        isPersonal ? "sd-personal" : ""
      }`}
    >
      {isPersonal && system && (
        <div className="sd-owner-bar">
          <div>
            <strong>Mon système</strong>
            <span>{label(system.review_status)}</span>
            {system.review_status === "rejected" && system.rejection_reason && (
              <small>Motif : {system.rejection_reason}</small>
            )}
          </div>

          {canSubmit && (
            <button type="button" onClick={submit} disabled={submitting}>
              {submitting ? "Envoi..." : "Proposer au CEO"}
            </button>
          )}
        </div>
      )}

      <SystemeDetailClient />

      <style jsx global>{`
        .sd-no-edit .ed-main-actions > button:last-child {
          display: none !important;
        }
        .sd-personal .ed-badges {
          display: none !important;
        }
        .sd-owner-bar {
          max-width: 1224px;
          margin: 22px auto 0;
          padding: 14px 18px;
          border: 1px solid #ead8de;
          border-radius: 14px;
          background: #faf5f7;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          font-family: Roboto, system-ui, sans-serif;
        }
        .sd-owner-bar > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .sd-owner-bar strong { color: #6b1a2c; }
        .sd-owner-bar span { font-weight: 800; }
        .sd-owner-bar small { color: #9a2c2c; margin-top: 3px; }
        .sd-owner-bar button {
          border: 0;
          border-radius: 999px;
          padding: 10px 16px;
          background: #6b1a2c;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .sd-owner-bar button:disabled { opacity: .55; cursor: default; }
        @media (max-width: 760px) {
          .sd-owner-bar {
            margin-inline: 16px;
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
