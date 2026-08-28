"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Branding = {
  id: string;
  name: string;
  logo_url: string | null;
  document_primary_color: string | null;
  document_secondary_color: string | null;
};

const DEFAULT_PRIMARY = "#6B1A2C";
const DEFAULT_SECONDARY = "#D4A24C";

function validHex(value: string | null | undefined, fallback: string) {
  const clean = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : fallback;
}

export default function InstitutionalBrandingSettings({
  structureId,
  onSaved,
}: {
  structureId: string;
  onSaved?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("institutional_structures")
      .select("id,name,logo_url,document_primary_color,document_secondary_color")
      .eq("id", structureId)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    const row = data as Branding;
    setBranding(row);
    setLogoUrl(row.logo_url ?? null);
    setPrimary(validHex(row.document_primary_color, DEFAULT_PRIMARY));
    setSecondary(validHex(row.document_secondary_color, DEFAULT_SECONDARY));
  }

  useEffect(() => {
    void load();
  }, [structureId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      alert("Utilise un logo PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert("Le logo doit faire moins de 3 Mo.");
      return;
    }

    setUploading(true);
    setMessage("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée.");

      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${structureId}/logo-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("institutional-assets")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upload.error) throw upload.error;

      const { data: publicData } = supabase.storage
        .from("institutional-assets")
        .getPublicUrl(path);

      const nextLogo = publicData.publicUrl;
      const update = await supabase
        .from("institutional_structures")
        .update({ logo_url: nextLogo, updated_at: new Date().toISOString() })
        .eq("id", structureId);
      if (update.error) throw update.error;

      setLogoUrl(nextLogo);
      setMessage("Logo enregistré.");
      onSaved?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import du logo impossible.");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    const update = await supabase
      .from("institutional_structures")
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq("id", structureId);
    if (update.error) return alert(update.error.message);
    setLogoUrl(null);
    setMessage("Logo supprimé.");
    onSaved?.();
  }

  async function saveColors() {
    setBusy(true);
    setMessage("");
    try {
      const nextPrimary = validHex(primary, DEFAULT_PRIMARY);
      const nextSecondary = validHex(secondary, DEFAULT_SECONDARY);
      const { error } = await supabase
        .from("institutional_structures")
        .update({
          document_primary_color: nextPrimary,
          document_secondary_color: nextSecondary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", structureId);
      if (error) throw error;

      setPrimary(nextPrimary);
      setSecondary(nextSecondary);
      setMessage("Identité documentaire enregistrée.");
      onSaved?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="branding">
      <div className="heading">
        <p>IDENTITÉ DOCUMENTAIRE</p>
        <h2>Logo et couleurs de l’institution</h2>
        <span>Ces réglages sont repris automatiquement sur les documents officiels.</span>
      </div>

      <div className="layout">
        <div className="logoCard">
          <span className="label">Logo officiel</span>
          <div className="logoPreview">
            {logoUrl ? (
              <img src={logoUrl} alt={`Logo ${branding?.name || "institution"}`} />
            ) : (
              <div className="placeholder">LOGO</div>
            )}
          </div>
          <div className="logoActions">
            <label className="upload">
              {uploading ? "Import en cours…" : logoUrl ? "Remplacer le logo" : "Ajouter un logo"}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                disabled={uploading}
                onChange={uploadLogo}
              />
            </label>
            {logoUrl && (
              <button type="button" className="secondary" onClick={() => void removeLogo()}>
                Supprimer
              </button>
            )}
          </div>
          <small>PNG, JPG, WEBP ou SVG · 3 Mo maximum.</small>
        </div>

        <div className="colors">
          <div className="colorField">
            <label>Couleur principale</label>
            <div>
              <input type="color" value={validHex(primary, DEFAULT_PRIMARY)} onChange={(e) => setPrimary(e.target.value.toUpperCase())} />
              <input type="text" value={primary} maxLength={7} onChange={(e) => setPrimary(e.target.value)} />
            </div>
            <small>Bandeaux, titres et en-têtes de tableaux.</small>
          </div>

          <div className="colorField">
            <label>Couleur secondaire</label>
            <div>
              <input type="color" value={validHex(secondary, DEFAULT_SECONDARY)} onChange={(e) => setSecondary(e.target.value.toUpperCase())} />
              <input type="text" value={secondary} maxLength={7} onChange={(e) => setSecondary(e.target.value)} />
            </div>
            <small>Filets, accents et repères visuels.</small>
          </div>

          <div
            className="miniDocument"
            style={{
              "--primary": validHex(primary, DEFAULT_PRIMARY),
              "--secondary": validHex(secondary, DEFAULT_SECONDARY),
            } as any}
          >
            <div className="miniHead">
              {logoUrl ? <img src={logoUrl} alt="" /> : <b>{branding?.name || "Institution"}</b>}
              <span>{branding?.name}</span>
            </div>
            <div className="miniRule" />
            <h3>Aperçu du document</h3>
            <div className="miniTitle">INFORMATIONS</div>
            <div className="miniLines"><i /><i /><i /></div>
          </div>

          <div className="buttons">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setPrimary(DEFAULT_PRIMARY);
                setSecondary(DEFAULT_SECONDARY);
              }}
            >
              Couleurs MyBasket
            </button>
            <button type="button" onClick={() => void saveColors()} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer l’identité"}
            </button>
          </div>
        </div>
      </div>

      {message && <div className="message">{message}</div>}

      <style jsx>{`
        .branding{border-bottom:1px solid #eee2db;padding-bottom:20px;margin-bottom:20px}
        .heading p{margin:0;color:#d4a24c;font-size:.68rem;font-weight:1000;letter-spacing:.12em}
        .heading h2{margin:3px 0;color:#321015}
        .heading span{color:#81736c;font-size:.8rem}
        .layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px;margin-top:16px}
        .logoCard,.colors{border:1px solid #eadfd8;border-radius:14px;padding:14px;background:#fffaf7}
        .label,.colorField>label{display:block;font-size:.76rem;font-weight:900;color:#4e3439;margin-bottom:8px}
        .logoPreview{height:150px;border:1px dashed #d8c9c2;border-radius:12px;background:#fff;display:grid;place-items:center;padding:12px}
        .logoPreview img{max-width:100%;max-height:125px;object-fit:contain}
        .placeholder{width:86px;height:86px;border-radius:18px;background:#f4ede9;color:#9c8d86;display:grid;place-items:center;font-weight:1000}
        .logoActions{display:flex;gap:7px;margin-top:10px}
        .upload,.buttons button{border:0;border-radius:9px;background:#6b1a2c;color:#fff;padding:9px 12px;font-weight:900;cursor:pointer;font-size:.78rem}
        .secondary{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8bbc2!important}
        .logoCard small,.colorField small{display:block;color:#8a7b74;font-size:.69rem;margin-top:6px}
        .colors{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .colorField>div{display:grid;grid-template-columns:46px 1fr;gap:8px}
        .colorField input[type=color]{width:46px;height:40px;padding:2px;border:1px solid #d9cbc4;border-radius:9px;background:#fff}
        .colorField input[type=text]{min-width:0;border:1px solid #d9cbc4;border-radius:9px;padding:8px 10px;font-weight:900;text-transform:uppercase}
        .miniDocument{grid-column:1/-1;border:1px solid #ddd1ca;border-radius:11px;background:#fff;padding:13px;overflow:hidden}
        .miniHead{height:42px;margin:-13px -13px 0;padding:8px 13px;background:var(--primary);color:#fff;display:flex;justify-content:space-between;align-items:center}
        .miniHead img{max-width:90px;max-height:27px;object-fit:contain;background:#fff;border-radius:4px;padding:2px}
        .miniHead span{font-size:.68rem;font-weight:900}
        .miniRule{height:4px;background:var(--secondary);margin:0 -13px 10px}
        .miniDocument h3{color:var(--primary);margin:8px 0 12px}
        .miniTitle{border-left:4px solid var(--secondary);color:var(--primary);font-size:.68rem;font-weight:1000;padding-left:7px}
        .miniLines{display:grid;gap:7px;margin-top:8px}.miniLines i{height:1px;background:#dfd4cf;display:block}
        .buttons{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}
        .message{margin-top:10px;padding:9px 11px;border-radius:9px;background:#eef7f0;color:#27653b;font-size:.78rem;font-weight:800}
        @media(max-width:800px){.layout{grid-template-columns:1fr}.colors{grid-template-columns:1fr}.miniDocument,.buttons{grid-column:auto}}
      `}</style>
    </section>
  );
}
