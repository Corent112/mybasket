"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteExerciseButton() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [canDelete, setCanDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkPermission() {
      if (!id) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      const [{ data: exercise }, { data: profile }] = await Promise.all([
        supabase.from("exercises").select("id,user_id").eq("id", id).maybeSingle(),
        supabase.from("profiles").select("platform_role").eq("id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      const role = profile?.platform_role;
      const isCeo = role === "ceo" || role === "superadmin";
      const isOwner = exercise?.user_id === user.id;

      setCanDelete(Boolean(exercise && (isCeo || isOwner)));
    }

    void checkPermission();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function deleteExercise() {
    if (!id || deleting) return;

    const confirmed = window.confirm(
      "Supprimer définitivement cet exercice ?\n\n" +
        "Il sera retiré de la bibliothèque et de tes références MyBasket. " +
        "Cette action est irréversible."
    );

    if (!confirmed) return;

    const supabase = createClient();
    setDeleting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Tu dois être connecté.");
        return;
      }

      const [{ data: exercise }, { data: profile }] = await Promise.all([
        supabase.from("exercises").select("id,user_id").eq("id", id).maybeSingle(),
        supabase.from("profiles").select("platform_role").eq("id", user.id).maybeSingle(),
      ]);

      if (!exercise) {
        alert("Exercice introuvable.");
        router.replace("/exercices");
        return;
      }

      const role = profile?.platform_role;
      const isCeo = role === "ceo" || role === "superadmin";
      const isOwner = exercise.user_id === user.id;

      if (!isCeo && !isOwner) {
        alert("Tu ne peux supprimer que tes exercices.");
        return;
      }

      // Nettoyage des références directes utilisées par la fiche exercice.
      // Comme pour les systèmes, la ressource principale est supprimée
      // définitivement et ne doit plus apparaître dans MyBasket.
      const { error: favoritesError } = await supabase
        .from("favorites")
        .delete()
        .eq("item_type", "exercise")
        .eq("item_id", id);

      if (favoritesError) {
        console.warn("Nettoyage favoris exercice :", favoritesError);
      }

      const { error: cartError } = await supabase
        .from("cart_items")
        .delete()
        .eq("item_type", "exercise")
        .eq("item_id", id);

      if (cartError) {
        console.warn("Nettoyage fiche séance/panier exercice :", cartError);
      }

      const { error: deleteError } = await supabase
        .from("exercises")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Suppression exercice :", deleteError);
        alert(
          deleteError.message ||
            deleteError.details ||
            deleteError.hint ||
            "La suppression de l’exercice a échoué."
        );
        return;
      }

      try {
        localStorage.removeItem(`mybasket_exo_draft_${id}`);
      } catch {}

      router.replace("/exercices");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (!canDelete) return null;

  return (
    <div className="delete-exercise-bar">
      <button type="button" onClick={deleteExercise} disabled={deleting}>
        {deleting ? "Suppression..." : "🗑 Supprimer l’exercice"}
      </button>

      <style jsx>{`
        .delete-exercise-bar {
          max-width: 1180px;
          margin: 18px auto -12px;
          padding: 0 20px;
          display: flex;
          justify-content: flex-end;
          position: relative;
          z-index: 3;
        }

        button {
          border: 1px solid #d7a4ae;
          border-radius: 999px;
          padding: 10px 16px;
          background: #fff;
          color: #9f1d35;
          font-weight: 900;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease,
            transform 0.18s ease;
        }

        button:hover:not(:disabled) {
          background: #9f1d35;
          color: #fff;
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.55;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
