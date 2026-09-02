"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUserRole,
  getSystem,
  type SystemItem,
} from "@/lib/systems";
import {
  removePlaquetteTransfer,
} from "@/lib/plaquette-transfer";

const DRAFT_KEY = "mybasket_systeme_draft";
const RETURN_KEY = "mb_plaquette_return_to";
const LOAD_KEY = "mybasket_plaquette_load";
const RESULT_KEY = "mybasket_plaquette_result";
const EDIT_INDEX_KEY = "mybasket_edit_schema_index";
const EDIT_SCHEMA_GROUP_KEY = "mybasket_edit_schema_group_id";
const EDIT_SYSTEM_ID_KEY = "mybasket_edit_system_id";
const CURRENT_SYSTEM_ID_KEY = "mybasket_current_system_id";

export default function DeleteSystemButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [systeme, setSysteme] = useState<SystemItem | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [ready, setReady] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPermissions() {
      if (!editId) {
        setReady(true);
        return;
      }

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setCanDelete(false);
            setReady(true);
          }
          return;
        }

        const [system, role] = await Promise.all([
          getSystem(editId),
          getCurrentUserRole(),
        ]);

        if (cancelled) return;

        setSysteme(system);

        const isCeo = role === "ceo" || role === "superadmin";
        const isOwner = system?.user_id === user.id;
        const isOfficialPublic =
          system?.visibility === "public" &&
          system?.review_status === "approved";

        setCanDelete(Boolean(system && (isCeo || (isOwner && !isOfficialPublic))));
      } catch (error) {
        console.error("Vérification suppression système impossible :", error);
        if (!cancelled) setCanDelete(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [editId]);

  async function removeStorageFolder(
    bucket: string,
    folder: string
  ): Promise<void> {
    const supabase = createClient();

    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: 1000,
    });

    if (error || !data?.length) return;

    const paths = data
      .filter((item: { name: string; id?: string | null }) => item.name && item.id)
      .map((item: { name: string; id?: string | null }) => `${folder}/${item.name}`);

    if (!paths.length) return;

    await supabase.storage.from(bucket).remove(paths);
  }

  async function cleanupLocalDrafts(id: string) {
    const draftKey = `${DRAFT_KEY}_${id}`;

    try {
      await removePlaquetteTransfer(draftKey);
      await removePlaquetteTransfer(LOAD_KEY);
      await removePlaquetteTransfer(RESULT_KEY);
    } catch (error) {
      console.warn("Nettoyage brouillon système impossible :", error);
    }

    try {
      localStorage.removeItem(`${draftKey}_storage_id`);
      localStorage.removeItem(RETURN_KEY);
      localStorage.removeItem(EDIT_INDEX_KEY);
      localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
      localStorage.removeItem(EDIT_SYSTEM_ID_KEY);
      localStorage.removeItem(CURRENT_SYSTEM_ID_KEY);
    } catch {}
  }

  async function removeSystem() {
    if (!editId || !canDelete || deleting) return;

    const title = systeme?.title?.trim() || "ce système";

    const confirmed = window.confirm(
      `Supprimer définitivement « ${title} » ?\n\nCette action est irréversible et supprimera la fiche système complète.`
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("systems")
        .delete()
        .eq("id", editId)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data?.id) {
        throw new Error(
          "Suppression refusée. Tu n’as peut-être pas les droits sur ce système."
        );
      }

      // Nettoyage des médias liés au système.
      // La fiche est déjà supprimée : un éventuel problème Storage ne bloque pas
      // la suppression fonctionnelle du système.
      const ownerId = systeme?.user_id;

      if (ownerId) {
        await Promise.allSettled([
          removeStorageFolder(
            "exercise-schemas",
            `${ownerId}/systemes/${editId}/images`
          ),
          removeStorageFolder(
            "exercise-videos",
            `${ownerId}/systemes/${editId}/videos`
          ),
          removeStorageFolder(
            "exercise-schemas",
            `${ownerId}/systemes/${editId}/schemas/imported`
          ),
        ]);
      }

      await cleanupLocalDrafts(editId);

      router.replace("/systemes");
      router.refresh();
    } catch (error: any) {
      console.error("Erreur suppression système :", error);
      alert(
        error?.message ||
          "Impossible de supprimer ce système. Vérifie tes droits puis réessaie."
      );
      setDeleting(false);
    }
  }

  if (!editId || !ready || !canDelete) return null;

  return (
    <section className="delete-system-zone">
      <div>
        <strong>SUPPRIMER CE SYSTÈME</strong>
        <p>
          Cette action supprime définitivement la fiche système. Elle est
          irréversible.
        </p>
      </div>

      <button
        type="button"
        className="delete-system-button"
        onClick={removeSystem}
        disabled={deleting}
      >
        {deleting ? "Suppression..." : "🗑 Supprimer le système"}
      </button>

      <style jsx>{`
        .delete-system-zone {
          max-width: 1280px;
          margin: -1rem auto 3rem;
          padding: 1.2rem 1.6rem;
          border: 1px solid #efc1c1;
          border-radius: 16px;
          background: #fff7f7;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          font-family: "Roboto", system-ui, sans-serif;
        }

        .delete-system-zone strong {
          display: block;
          color: #a62020;
          font-size: 0.86rem;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .delete-system-zone p {
          margin: 5px 0 0;
          color: #666;
          font-size: 0.9rem;
        }

        .delete-system-button {
          flex: 0 0 auto;
          border: 0;
          border-radius: 999px;
          padding: 0.8rem 1.25rem;
          background: #b42323;
          color: #fff;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }

        .delete-system-button:hover:not(:disabled) {
          background: #8f1818;
        }

        .delete-system-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 760px) {
          .delete-system-zone {
            margin-left: 1rem;
            margin-right: 1rem;
            align-items: flex-start;
            flex-direction: column;
          }

          .delete-system-button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
