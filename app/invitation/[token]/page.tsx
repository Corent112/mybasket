"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invitation = {
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expiresAt: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  teamId: string;
  teamName: string;
  clubName: string;
  inviterName: string;
};

const PERMISSIONS: Array<[string, string]> = [
  ["players", "Joueurs"],
  ["sessions", "Séances & calendrier"],
  ["livestats", "LiveStats"],
  ["media", "Médias & Drive"],
];

export default function TeamInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const [response, auth] = await Promise.all([
        fetch(`/api/team-invitations/${encodeURIComponent(token)}`, {
          cache: "no-store",
        }),
        supabase.auth.getUser(),
      ]);

      const payload = await response.json().catch(() => ({}));
      if (!active) return;

      if (!response.ok) {
        setError(payload?.error || "Invitation introuvable.");
        setLoading(false);
        return;
      }

      setInvitation(payload.invitation as Invitation);
      setAccountEmail(auth.data.user?.email || "");
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, token]);

  async function answer(action: "accept" | "decline") {
    if (!invitation || busy) return;

    setBusy(true);
    setError("");

    const response = await fetch(
      `/api/team-invitations/${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload?.error || "Impossible de répondre à l’invitation.");
      setBusy(false);
      return;
    }

    if (action === "decline") {
      setDone("declined");
      setBusy(false);
      return;
    }

    setDone("accepted");
    setTimeout(() => {
      router.replace(`/equipes/${payload.teamId}`);
      router.refresh();
    }, 900);
  }

  const nextPath = `/invitation/${token}`;
  const signInHref = `/connexion?next=${encodeURIComponent(nextPath)}`;
  const signUpHref = `/connexion?mode=signup&next=${encodeURIComponent(nextPath)}`;
  const invitationEmail = invitation?.email?.trim().toLowerCase() ?? "";
  const accountEmailNormalized = accountEmail?.trim().toLowerCase() ?? "";

  const emailMatches =
    Boolean(accountEmailNormalized) &&
    Boolean(invitationEmail) &&
    accountEmailNormalized === invitationEmail;

  return (
    <main className="invitePage">
      <style>{CSS}</style>

      <section className="inviteCard">
        <div className="brand">
          <div className="brandMark">MB</div>
          <div>
            <strong>MY BASKET</strong>
            <span>COLLABORATION</span>
          </div>
        </div>

        {loading ? (
          <div className="state">Chargement de l’invitation…</div>
        ) : error && !invitation ? (
          <div className="state error">{error}</div>
        ) : done === "accepted" ? (
          <div className="success">
            <div className="successIcon">✓</div>
            <h1>Bienvenue dans l’équipe</h1>
            <p>Ton accès est activé. Ouverture de la fiche équipe…</p>
          </div>
        ) : done === "declined" ? (
          <div className="success">
            <h1>Invitation refusée</h1>
            <p>Aucun accès à l’équipe n’a été ajouté à ton compte.</p>
          </div>
        ) : invitation ? (
          <>
            <div className="eyebrow">INVITATION MYBASKET</div>
            <h1>Rejoins {invitation.teamName}</h1>
            <p className="lead">
              <strong>{invitation.inviterName}</strong> t’invite à rejoindre
              cette équipe en tant que <strong>{invitation.role}</strong>.
            </p>

            <div className="teamBox">
              <div className="teamBall">🏀</div>
              <div>
                <strong>{invitation.teamName}</strong>
                {invitation.clubName &&
                  invitation.clubName !== invitation.teamName && (
                    <span>{invitation.clubName}</span>
                  )}
                <em>{invitation.role}</em>
              </div>
            </div>

            <div className="permissionBox">
              <span className="permissionTitle">TES ACCÈS SUR CETTE ÉQUIPE</span>
              <div className="permissionList">
                <span className="permission enabled">✓ Voir l’équipe</span>
                {PERMISSIONS.map(([key, label]) => (
                  <span
                    className={`permission ${
                      invitation.permissions?.[key] ? "enabled" : "disabled"
                    }`}
                    key={key}
                  >
                    {invitation.permissions?.[key] ? "✓" : "—"} {label}
                  </span>
                ))}
              </div>
            </div>

            <p className="scope">
              Ces droits concernent uniquement <strong>{invitation.teamName}</strong>.
              Ils ne remplacent pas ton abonnement MyBasket personnel.
            </p>

            {invitation.status !== "pending" ? (
              <div className="statusMessage">
                {invitation.status === "accepted" &&
                  "Cette invitation a déjà été acceptée."}
                {invitation.status === "declined" &&
                  "Cette invitation a été refusée."}
                {invitation.status === "revoked" &&
                  "Cette invitation a été annulée par le propriétaire."}
                {invitation.status === "expired" &&
                  "Cette invitation a expiré. Demande au propriétaire de la renvoyer."}
              </div>
            ) : !accountEmail ? (
              <div className="authChoices">
                <a href={signInHref} className="primary">
                  Se connecter pour rejoindre
                </a>
                <a href={signUpHref} className="secondary">
                  Créer mon compte MyBasket
                </a>
                <small>
                  Utilise l’adresse <strong>{invitation.email}</strong> pour que
                  l’équipe soit rattachée automatiquement.
                </small>
              </div>
            ) : !emailMatches ? (
              <div className="emailWarning">
                <strong>Mauvais compte connecté</strong>
                <p>
                  L’invitation est destinée à <b>{invitation.email}</b>, mais tu
                  es connecté avec <b>{accountEmail}</b>.
                </p>
                <button
                  type="button"
                  className="changeAccount"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    router.replace(signInHref);
                    router.refresh();
                  }}
                >
                  Changer de compte
                </button>
              </div>
            ) : (
              <div className="actions">
                <button
                  type="button"
                  className="decline"
                  disabled={busy}
                  onClick={() => void answer("decline")}
                >
                  Refuser
                </button>
                <button
                  type="button"
                  className="accept"
                  disabled={busy}
                  onClick={() => void answer("accept")}
                >
                  {busy ? "Activation…" : "Rejoindre l’équipe"}
                </button>
              </div>
            )}

            {error && <p className="inlineError">{error}</p>}
          </>
        ) : null}
      </section>
    </main>
  );
}

const CSS = `
.invitePage{min-height:100vh;background:linear-gradient(145deg,#f8f4f0 0%,#efe8e2 100%);display:grid;place-items:center;padding:34px 18px;font-family:Arial,Helvetica,sans-serif}
.inviteCard{width:min(680px,100%);background:#fff;border:1px solid #eadfd6;border-radius:26px;box-shadow:0 28px 80px rgba(48,25,19,.14);padding:34px 38px 38px}
.brand{display:flex;align-items:center;gap:12px;padding-bottom:24px;border-bottom:1px solid #efe5de;margin-bottom:28px}
.brandMark{width:50px;height:50px;border-radius:15px;background:#6B1A2C;color:#D4A24C;display:grid;place-items:center;font-weight:1000;font-size:17px}
.brand strong{display:block;font-size:20px;letter-spacing:.03em;color:#211a18}
.brand span{display:block;margin-top:3px;font-size:10px;letter-spacing:.18em;font-weight:900;color:#D4A24C}
.eyebrow{color:#D4A24C;font-size:11px;font-weight:950;letter-spacing:.16em}
h1{margin:8px 0 12px;color:#231c19;font-size:clamp(28px,5vw,42px);line-height:1.05}
.lead{margin:0;color:#756861;font-size:16px;line-height:1.65}
.lead strong{color:#6B1A2C}
.teamBox{display:flex;align-items:center;gap:15px;margin:25px 0;padding:17px 19px;border:1px solid #eaded5;background:#fbf8f5;border-radius:18px}
.teamBall{width:52px;height:52px;display:grid;place-items:center;border-radius:50%;background:#6B1A2C;font-size:23px}
.teamBox strong{display:block;color:#231c19;font-size:17px}.teamBox span{display:block;color:#857770;font-size:13px;margin-top:2px}.teamBox em{display:inline-block;color:#6B1A2C;font-size:12px;font-style:normal;font-weight:900;margin-top:5px}
.permissionBox{padding:18px;border-radius:17px;background:#fff;border:1px solid #eaded5}
.permissionTitle{font-size:10px;font-weight:950;letter-spacing:.12em;color:#84766f}
.permissionList{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.permission{padding:8px 10px;border-radius:999px;font-size:12px;font-weight:800}.permission.enabled{background:#f4ebe5;color:#6B1A2C}.permission.disabled{background:#f4f4f4;color:#aaa}
.scope{font-size:12px;line-height:1.55;color:#93857e;margin:15px 4px 24px}
.actions,.authChoices{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.actions button,.authChoices a{min-height:46px;border-radius:999px;padding:0 20px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.accept,.primary{background:#6B1A2C;color:#fff;border:1px solid #6B1A2C}.decline,.secondary{background:#fff;color:#6B1A2C;border:1px solid #d9c8bd}
.authChoices small{width:100%;color:#8b7e77;line-height:1.5;margin-top:5px}
.statusMessage,.emailWarning,.state{padding:18px;border-radius:15px;background:#fbf8f5;border:1px solid #eaded5;color:#6f625c;line-height:1.5}.state.error,.inlineError{color:#a4243c}.emailWarning strong{color:#a4243c}.emailWarning p{margin:7px 0}.emailWarning a,.changeAccount{color:#6B1A2C;font-weight:900}.changeAccount{border:0;background:transparent;padding:0;cursor:pointer;font-size:inherit}
.success{text-align:center;padding:30px 10px}.successIcon{width:64px;height:64px;margin:0 auto 15px;border-radius:50%;display:grid;place-items:center;background:#6B1A2C;color:#fff;font-size:30px;font-weight:900}.success p{color:#776a63}
.inlineError{font-size:13px;font-weight:800;margin-top:16px}
button:disabled{opacity:.55;cursor:not-allowed}
@media(max-width:620px){.inviteCard{padding:25px 20px 28px}.actions button,.authChoices a{width:100%}}
`;
