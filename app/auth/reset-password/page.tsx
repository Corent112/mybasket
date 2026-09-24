"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") || "");

  useEffect(() => {
    let alive = true;

    async function checkRecoverySession() {
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (!alive) return;

      if (sessionError || !data.user) {
        setValidSession(false);
        if (!error) {
          setError("Ce lien de réinitialisation est invalide ou a expiré. Demande un nouveau lien.");
        }
      } else {
        setValidSession(true);
      }
      setChecking(false);
    }

    void checkRecoverySession();
    return () => { alive = false; };
  }, [supabase, error]);

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validSession) return;
    setError("");

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          updateError.message.toLowerCase().includes("same password")
            ? "Choisis un mot de passe différent de l’ancien."
            : "Impossible de modifier le mot de passe. Le lien a peut-être expiré : demande un nouveau lien.",
        );
        return;
      }

      // Le mot de passe est maintenant enregistré dans Supabase Auth.
      // On ferme la session temporaire de récupération pour imposer une
      // reconnexion normale avec le nouveau mot de passe.
      await supabase.auth.signOut();
      router.replace("/connexion?password-updated=1");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="reset-page">
      <section className="reset-card">
        <Link href="/" className="brand"><span>MB</span> MY BASKET</Link>
        <div className="badge">SÉCURITÉ DU COMPTE</div>
        <h1>Choisir un nouveau mot de passe</h1>
        <p className="intro">Saisis ton nouveau mot de passe. Une fois enregistré, il remplacera immédiatement l’ancien.</p>

        {checking ? (
          <div className="status">Vérification du lien de réinitialisation…</div>
        ) : validSession ? (
          <form onSubmit={savePassword}>
            <label>
              Nouveau mot de passe
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                autoFocus
              />
            </label>
            <label>
              Confirmer le nouveau mot de passe
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Retape ton nouveau mot de passe"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer mon nouveau mot de passe"}</button>
          </form>
        ) : (
          <div className="invalid">
            <div className="error">{error}</div>
            <Link href="/connexion?mode=reset" className="primary-link">Demander un nouveau lien</Link>
            <Link href="/connexion" className="secondary-link">Retour à la connexion</Link>
          </div>
        )}
      </section>
      <style jsx>{`
        .reset-page{min-height:100vh;display:grid;place-items:center;padding:32px 18px;background:#f5f2ef;color:#231f20;font-family:Arial,sans-serif}
        .reset-card{width:min(100%,480px);background:#fff;border:1px solid #e8e1dc;border-radius:22px;padding:34px;box-shadow:0 18px 60px rgba(40,30,25,.09)}
        .brand{display:inline-flex;align-items:center;gap:10px;color:#231f20;text-decoration:none;font-size:13px;font-weight:800;letter-spacing:.08em}.brand span{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#231f20;color:#fff;letter-spacing:0}
        .badge{margin-top:30px;font-size:11px;font-weight:800;letter-spacing:.14em;color:#9b6b50}h1{font-size:30px;line-height:1.08;margin:10px 0 12px}.intro{margin:0 0 26px;color:#766b65;font-size:14px;line-height:1.6}
        form{display:grid;gap:17px}label{display:grid;gap:8px;font-size:12px;font-weight:800}input{width:100%;box-sizing:border-box;border:1px solid #ddd4ce;border-radius:12px;padding:14px 15px;font-size:15px;outline:none;background:#fff}input:focus{border-color:#9b6b50;box-shadow:0 0 0 3px rgba(155,107,80,.10)}button,.primary-link{border:0;border-radius:12px;background:#231f20;color:#fff;padding:14px 16px;font-weight:800;font-size:14px;text-align:center;text-decoration:none;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.error,.status{border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.45}.error{background:#fff3f1;border:1px solid #f0d3cd;color:#9a3f31}.status{background:#f7f5f3;border:1px solid #e7e0dc;color:#6f625b}.invalid{display:grid;gap:12px}.secondary-link{text-align:center;color:#6f625b;text-decoration:none;font-size:13px;font-weight:700}@media(max-width:520px){.reset-card{padding:26px 20px;border-radius:18px}h1{font-size:26px}}
      `}</style>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordContent /></Suspense>;
}
