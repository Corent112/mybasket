"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ClubIdentitySettingsCard({
  clubId,
  clubName,
  logoUrl,
  onLogoChange,
}: {
  clubId: string;
  clubName: string;
  logoUrl?: string | null;
  onLogoChange?: (url: string | null) => void;
}) {
  const [currentLogo, setCurrentLogo] = useState<string | null>(logoUrl || null);
  const [emailName, setEmailName] = useState(clubName);
  const [replyEmail, setReplyEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentLogo(logoUrl || null);
  }, [logoUrl]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: club }, { data: settings }] = await Promise.all([
        supabase.from("clubs").select("name,logo_url,contact_email").eq("id", clubId).maybeSingle(),
        supabase.from("club_settings").select("email_from_name,email_from_address,reply_to_email").eq("club_id", clubId).maybeSingle(),
      ]);

      const resolvedLogo = club?.logo_url || logoUrl || null;
      setCurrentLogo(resolvedLogo);
      onLogoChange?.(resolvedLogo);
      setEmailName(settings?.email_from_name || club?.name || clubName);
      setReplyEmail(settings?.reply_to_email || settings?.email_from_address || club?.contact_email || "");
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  async function uploadLogo(file: File) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${clubId}/logo-${Date.now()}.${ext}`;

      const upload = await supabase.storage.from("club-assets").upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
      if (upload.error) throw upload.error;

      const url = supabase.storage.from("club-assets").getPublicUrl(path).data.publicUrl;
      const update = await supabase.from("clubs").update({ logo_url: url, updated_at: new Date().toISOString() }).eq("id", clubId);
      if (update.error) throw update.error;

      setCurrentLogo(url);
      onLogoChange?.(url);
      setMessage("Logo du club mis à jour.");
    } catch (e: any) {
      setError(e?.message || "Impossible de mettre à jour le logo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmailIdentity() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const { data: existing } = await supabase.from("club_settings").select("id").eq("club_id", clubId).maybeSingle();

      const payload = {
        club_id: clubId,
        email_from_name: emailName.trim() || clubName,
        email_from_address: replyEmail.trim() || null,
        reply_to_email: replyEmail.trim() || null,
      };

      const result = existing?.id
        ? await supabase.from("club_settings").update(payload).eq("club_id", clubId)
        : await supabase.from("club_settings").insert(payload);

      if (result.error) throw result.error;

      if (replyEmail.trim()) {
        await supabase.from("clubs").update({ contact_email: replyEmail.trim() }).eq("id", clubId);
      }

      setMessage("Identité des emails enregistrée.");
    } catch (e: any) {
      setError(e?.message || "Impossible d’enregistrer l’identité email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="identityCard">
      <header>
        <div>
          <p>IDENTITÉ CLUB</p>
          <h2>Logo & emails</h2>
          <span>Le logo est utilisé dans le dashboard et dans l’en-tête des emails envoyés par le club.</span>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="grid">
        <article className="logoPanel">
          <div className="logo">
            {currentLogo ? <img src={currentLogo} alt={`Logo ${clubName}`} /> : <span>{clubName.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div>
            <strong>Logo du club</strong>
            <p>PNG ou JPG. Il remplace la pastille MyBasket dans l’espace Club.</p>
            <label className="upload">
              {busy ? "Enregistrement..." : "Changer le logo"}
              <input hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
          </div>
        </article>

        <article className="mailPanel">
          <h3>Identité des emails</h3>
          <p className="help">
            MyBasket envoie techniquement via l’adresse configurée dans Vercel/Resend. Ici tu choisis le nom visible et l’adresse où les parents/coachs doivent répondre.
          </p>
          <label>Nom affiché
            <input value={emailName} onChange={(e) => setEmailName(e.target.value)} placeholder={clubName} />
          </label>
          <label>Email de réponse du club
            <input type="email" value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} placeholder="contact@monclub.fr" />
          </label>
          <button disabled={busy} onClick={saveEmailIdentity}>Enregistrer</button>
        </article>
      </div>

      <style jsx>{`
        .identityCard{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        header{padding:22px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}header p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}header h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}header span{color:#6b7280;font-weight:700}
        .grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:18px;padding:18px}.logoPanel,.mailPanel{border:1px solid #eadfd5;border-radius:22px;padding:18px;background:#fff}.logoPanel{display:flex;gap:16px;align-items:center}.logo{width:110px;height:110px;border-radius:26px;border:1px solid #eadfd5;background:#fffaf2;display:grid;place-items:center;overflow:hidden;flex:0 0 auto}.logo img{width:100%;height:100%;object-fit:contain;padding:8px}.logo span{font-size:1.5rem;color:#6b1a2c;font-weight:1000}.logoPanel strong,.mailPanel h3{color:#6b1a2c}.logoPanel p,.help{color:#6b7280;font-weight:700;line-height:1.45}
        label{display:grid;gap:6px;margin:12px 0;color:#6b7280;font-weight:900;font-size:.8rem}input{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}.upload,button{display:inline-flex;width:max-content;border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}button:disabled{opacity:.55}.alert{margin:14px 18px 0;padding:12px 14px;border-radius:14px;font-weight:900}.error{background:#fff0f0;color:#b91c1c}.ok{background:#f0fff4;color:#15803d}
        @media(max-width:900px){.grid{grid-template-columns:1fr}.logoPanel{display:grid}}
      `}</style>
    </section>
  );
}
