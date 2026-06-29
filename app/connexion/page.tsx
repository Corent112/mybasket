"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(value: string | null) {
  if (!value) return "/mon-compte";
  if (!value.startsWith("/")) return "/mon-compte";
  if (value.startsWith("//")) return "/mon-compte";
  if (value.includes("http://") || value.includes("https://")) return "/mon-compte";
  return value;
}

function ConnexionContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
  let alive = true;

  async function checkSession() {
    const result = await supabase.auth.getUser();

    if (!alive) return;

    if (result.data.user) {
      router.replace(next);
    }
  }

  checkSession();

  return () => {
    alive = false;
  };
}, [router, supabase, next]);

  function resetMessages() {
    setErr("");
    setInfo("");
  }

  async function submit() {
    if (busy) return;

    resetMessages();

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail) {
      setErr("Renseigne ton adresse email.");
      return;
    }

    if (tab !== "reset" && password.length < 8) {
      setErr("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setBusy(true);

    try {
      if (tab === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          const message = error.message.toLowerCase().includes("email not confirmed")
            ? "Ton email n’est pas encore confirmé. Vérifie ta boîte mail."
            : "Identifiants incorrects ou compte non confirmé.";
          setErr(message);
          return;
        }

        router.replace(next);
        router.refresh();
        return;
      }

      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            data: {
              display_name: cleanName,
            },
          },
        });

        if (error) {
          setErr(error.message);
          return;
        }

        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }

        setInfo("Compte créé. Vérifie ta boîte mail pour confirmer ton adresse.");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/mon-compte/parametres`,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      setInfo("Email de réinitialisation envoyé. Vérifie ta boîte mail.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <style>{CSS}</style>

      <section className="auth-card">
        <Link href="/" className="auth-logo">
          <span>MB</span>
          MY BASKET
        </Link>

        <h1>
          {tab === "signin"
            ? "S’identifier"
            : tab === "signup"
              ? "Créer un compte"
              : "Mot de passe oublié"}
        </h1>

        <div className="auth-tabs">
          <button
            type="button"
            className={tab === "signin" ? "active" : ""}
            onClick={() => {
              setTab("signin");
              resetMessages();
            }}
          >
            Connexion
          </button>

          <button
            type="button"
            className={tab === "signup" ? "active" : ""}
            onClick={() => {
              setTab("signup");
              resetMessages();
            }}
          >
            Inscription
          </button>
        </div>

        {tab === "signup" && (
          <label>
            Nom affiché
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Coach Corentin"
              autoComplete="name"
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>

        {tab !== "reset" && (
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          </label>
        )}

        {err && <p className="auth-error">{err}</p>}
        {info && <p className="auth-info">{info}</p>}

        <button
          type="button"
          className="auth-submit"
          onClick={() => void submit()}
          disabled={busy || !email || (tab !== "reset" && !password)}
        >
          {busy
            ? "Patiente…"
            : tab === "signin"
              ? "Se connecter"
              : tab === "signup"
                ? "Créer mon compte"
                : "Envoyer le lien"}
        </button>

        {tab === "signin" ? (
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => {
              setTab("reset");
              resetMessages();
            }}
          >
            Mot de passe oublié ?
          </button>
        ) : (
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => {
              setTab("signin");
              resetMessages();
            }}
          >
            J’ai déjà un compte
          </button>
        )}

        <Link href="/" className="auth-back">
          ← Retour à l’accueil
        </Link>
      </section>
    </main>
  );
}

export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <ConnexionContent />
    </Suspense>
  );
}

const CSS = `
.auth-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #6B1A2C, #191920);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-family: system-ui, sans-serif;
}

.auth-card {
  width: 390px;
  max-width: 100%;
  background: #fff;
  border-radius: 18px;
  border-top: 5px solid #D4A24C;
  box-shadow: 0 20px 60px rgba(0,0,0,.35);
  padding: 26px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #191920;
  text-decoration: none;
  font-weight: 900;
}

.auth-logo span {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #191920;
  color: #D4A24C;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-card h1 {
  text-align: center;
  color: #6B1A2C;
  font-size: 24px;
}

.auth-tabs {
  display: flex;
  background: #F2EEE8;
  padding: 4px;
  border-radius: 12px;
}

.auth-tabs button {
  flex: 1;
  border: 0;
  background: transparent;
  border-radius: 9px;
  padding: 9px;
  cursor: pointer;
  font-weight: 800;
}

.auth-tabs button.active {
  background: #fff;
  color: #6B1A2C;
  box-shadow: 0 1px 5px rgba(0,0,0,.12);
}

.auth-card label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
}

.auth-card input {
  border: 1px solid #D8D2C8;
  border-radius: 10px;
  padding: 11px 12px;
  font-size: 15px;
}

.auth-submit {
  border: 0;
  background: #6B1A2C;
  color: #fff;
  border-radius: 11px;
  padding: 12px;
  font-weight: 900;
  cursor: pointer;
}

.auth-submit:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.auth-link-btn {
  border: 0;
  background: transparent;
  color: #6B1A2C;
  font-weight: 850;
  cursor: pointer;
  padding: 4px;
}

.auth-error {
  background: #FDECEC;
  color: #C0392B;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
}

.auth-info {
  background: #EAF6EC;
  color: #1E7B34;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
}

.auth-back {
  text-align: center;
  color: #6B6B6B;
  font-size: 13px;
  text-decoration: none;
}
`;
