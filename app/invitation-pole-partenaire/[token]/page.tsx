"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PartnerCoachInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [invitation, setInvitation] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/institutionnel/pole-performance/invitations/${token}`, { cache: "no-store" }).then(async r => ({ ok: r.ok, body: await r.json() })),
      supabase.auth.getUser(),
    ]).then(([res, auth]) => {
      if (!res.ok) setError(res.body.error || "Invitation indisponible.");
      setInvitation(res.body.invitation || null);
      setEmail(auth.data.user?.email || "");
    });
  }, [token, supabase]);

  async function accept() {
    setBusy(true); setError("");
    const r = await fetch(`/api/institutionnel/pole-performance/invitations/${token}`, { method: "POST" });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return setError(j.error || "Acceptation impossible.");
    router.replace(`/equipes/${j.teamId}`);
  }

  if (!invitation) return <main className="shell"><section>{error || "Chargement…"}</section><style jsx>{css}</style></main>;
  const sameEmail = email && email.toLowerCase() === String(invitation.email || "").toLowerCase();
  const next = `/invitation-pole-partenaire/${token}`;
  return <main className="shell"><section><p className="eyebrow">PÔLE / PERFORMANCE</p><h1>{invitation.teamName}</h1><h3>{invitation.structureName} · {invitation.category || "Équipe partenaire"}</h3><div className="box"><b>Rôle</b><span>Coach principal · responsable de l'équipe · pleins pouvoirs</span><b>Premium</b><span>Accès MyBasket Premium offert pendant un an par la Ligue</span><b>Ligue</b><span>Reste superviseur. Elle consulte l'équipe sans remplir à ta place.</span></div>{!email?<a href={`/connexion?next=${encodeURIComponent(next)}`}>Se connecter / créer mon compte</a>:!sameEmail?<div className="warn">Cette invitation est destinée à {invitation.email}. Tu es connecté avec {email}.</div>:<button disabled={busy} onClick={accept}>{busy ? "Activation…" : "Accepter et prendre en charge l'équipe"}</button>}{error&&<div className="warn">{error}</div>}</section><style jsx>{css}</style></main>;
}
const css = `.shell{min-height:100vh;background:#f6f2ee;padding:30px 15px;display:grid;place-items:center;font-family:Arial,sans-serif}.shell section{width:min(680px,100%);background:#fff;border:1px solid #eadfd8;border-radius:20px;padding:28px}.eyebrow{color:#d4a24c;font-size:.7rem;font-weight:1000;letter-spacing:.14em}.shell h1{color:#6b1a2c;font-size:34px;margin:5px 0}.shell h3{color:#776a63}.box{display:grid;gap:5px;background:#fbf8f6;border:1px solid #eadfd8;border-radius:14px;padding:15px;margin:20px 0}.box b{color:#6b1a2c;margin-top:6px}.box span{color:#6f625c}.shell button,.shell a{display:inline-block;border:0;border-radius:999px;padding:12px 18px;background:#6b1a2c;color:#fff;font-weight:900;text-decoration:none}.warn{margin-top:12px;padding:10px;border-radius:9px;background:#fff0f1;color:#a02138;font-weight:700}`;
