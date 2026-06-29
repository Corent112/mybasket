"use client";

// app/invitation-club/page.tsx
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invitation = {
  id: string;
  club_id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  first_name?: string | null;
  last_name?: string | null;
  team_id?: string | null;
  expires_at: string;
  clubs?: {
    name?: string | null;
    city?: string | null;
    logo_url?: string | null;
  } | null;
};

function InvitationClubContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const supabase = useMemo(() => createClient(), []);

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"loading" | "login" | "signup" | "ready" | "accepted" | "error">("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadInvitation() {
    setMode("loading");
    setError("");

    if (!token) {
      setMode("error");
      setError("Lien d’invitation invalide.");
      return;
    }

    const { data, error: inviteError } = await supabase
      .from("club_member_invitations")
      .select("id, club_id, email, role, status, token, first_name, last_name, team_id, expires_at, clubs(name, city, logo_url)")
      .eq("token", token)
      .maybeSingle();

    if (inviteError || !data) {
      setMode("error");
      setError("Invitation introuvable ou expirée.");
      return;
    }

    if (data.status !== "pending") {
      setMode("error");
      setError("Cette invitation a déjà été utilisée ou annulée.");
      return;
    }

    if (new Date(data.expires_at).getTime() < Date.now()) {
      setMode("error");
      setError("Cette invitation a expiré.");
      return;
    }

    setInvitation(data as Invitation);
    setEmail(String(data.email || ""));

    const { data: userData } = await supabase.auth.getUser();

    if (userData.user) {
      setMode("ready");
    } else {
      setMode("signup");
    }
  }

  useEffect(() => {
    loadInvitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function signIn() {
    setError("");
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setMode("ready");
  }

  async function signUp() {
    setError("");
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: invitation?.first_name || "",
          last_name: invitation?.last_name || "",
        },
      },
    });

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Compte créé. Si Supabase demande une confirmation email, confirme puis reconnecte-toi.");
    setMode("login");
  }

  async function acceptInvitation() {
    setError("");
    setMessage("");

    const response = await fetch("/api/club/invitations/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      setError(json?.error || "Impossible d’accepter l’invitation.");
      return;
    }

    setMode("accepted");
    setMessage("Invitation acceptée. Tu peux maintenant accéder à l’espace club.");
  }

  return (
    <main className="invitePage">
      <section className="card">
        <div className="logo">
          {invitation?.clubs?.logo_url ? (
            <img src={invitation.clubs.logo_url} alt="" />
          ) : (
            <span>MB</span>
          )}
        </div>

        <p className="eyebrow">INVITATION CLUB</p>

        {mode === "loading" && <h1>Chargement...</h1>}

        {mode !== "loading" && invitation && (
          <>
            <h1>{invitation.clubs?.name || "Un club"} t’invite sur MyBasket</h1>
            <p className="sub">
              Rôle : <strong>{invitation.role}</strong>
              {invitation.clubs?.city ? ` · ${invitation.clubs.city}` : ""}
            </p>
          </>
        )}

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert ok">{message}</div>}

        {mode === "signup" && (
          <div className="form">
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button onClick={signUp}>Créer mon compte</button>
            <button className="ghost" onClick={() => setMode("login")}>J’ai déjà un compte</button>
          </div>
        )}

        {mode === "login" && (
          <div className="form">
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button onClick={signIn}>Me connecter</button>
            <button className="ghost" onClick={() => setMode("signup")}>Créer un compte</button>
          </div>
        )}

        {mode === "ready" && (
          <div className="form">
            <button onClick={acceptInvitation}>Accepter l’invitation</button>
          </div>
        )}

        {mode === "accepted" && (
          <div className="form">
            <button onClick={() => router.push("/mon-compte/club")}>Aller à l’espace club</button>
          </div>
        )}
      </section>

      <style jsx>{`
        .invitePage{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#fff8ee,#f8fafc);padding:24px;font-family:Roboto,system-ui,sans-serif}
        .card{width:min(560px,100%);background:white;border:1px solid #eadfd5;border-radius:30px;padding:32px;box-shadow:0 30px 90px rgba(0,0,0,.12);text-align:center}
        .logo{width:82px;height:82px;border-radius:26px;margin:0 auto 18px;background:#6b1a2c;color:#d4a24c;display:grid;place-items:center;font-weight:900;font-size:1.4rem;overflow:hidden}
        .logo img{width:100%;height:100%;object-fit:cover}
        .eyebrow{margin:0 0 8px;color:#d4a24c;font-weight:900;letter-spacing:.16em;font-size:.72rem}
        h1{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400;line-height:1.15}
        .sub{color:#6b7280;font-weight:800}
        .form{display:grid;gap:12px;margin-top:22px;text-align:left}
        label{display:grid;gap:6px;color:#6b7280;font-weight:900;font-size:.8rem}
        input{border:1px solid #e5e7eb;border-radius:16px;padding:12px 14px;font:inherit}
        button{border:0;background:#6b1a2c;color:white;border-radius:999px;padding:13px 18px;font-weight:900;cursor:pointer}
        button.ghost{background:#fff8ee;color:#6b1a2c;border:1px solid #eadfd5}
        .alert{padding:12px 14px;border-radius:16px;margin-top:18px;font-weight:900;text-align:left}
        .alert.error{background:#fff0f0;color:#b91c1c}
        .alert.ok{background:#f0fff4;color:#15803d}
      `}</style>
    </main>
  );
}

export default function InvitationClubPage() {
  return (
    <Suspense fallback={<main />}>
      <InvitationClubContent />
    </Suspense>
  );
}
