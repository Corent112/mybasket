"use client";

// components/club/ClubSettingsSection.tsx
import { useState } from "react";
import { updateClubSettings, uploadClubAsset } from "@/lib/club-core";

export default function ClubSettingsSection({
  clubId,
  initialName = "",
  initialCity = "",
}: {
  clubId: string;
  initialName?: string;
  initialCity?: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState(initialCity || "");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6B1A2C");
  const [secondaryColor, setSecondaryColor] = useState("#D4A24C");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleAsset(file: File, kind: "logo" | "banner") {
    setSaving(true);
    setError("");
    try {
      const url = await uploadClubAsset({ clubId, file, kind });
      if (kind === "logo") setLogoUrl(url);
      else setBannerUrl(url);
    } catch (e: any) {
      setError(e?.message || "Image impossible à envoyer.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateClubSettings(clubId, {
        name,
        city,
        contactEmail,
        contactPhone,
        address,
        primaryColor,
        secondaryColor,
        logoUrl,
        bannerUrl,
      });

      setMessage("Paramètres enregistrés.");
    } catch (e: any) {
      setError(e?.message || "Paramètres non enregistrés.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings">
      <div className="top">
        <div>
          <p>PARAMÈTRES</p>
          <h2>Identité du club</h2>
          <span>Logo, bannière, couleurs et informations administratives.</span>
        </div>
        <button disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <div className="panel">
          <h3>Identité</h3>
          <label>Nom du club<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Ville<input value={city} onChange={(e) => setCity(e.target.value)} /></label>
          <label>Email<input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></label>
          <label>Téléphone<input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></label>
          <label>Adresse<textarea value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        </div>

        <div className="panel">
          <h3>Visuels</h3>
          <div className="uploadGrid">
            <label className="upload">
              Logo
              <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleAsset(e.target.files[0], "logo")} />
              {logoUrl ? <img src={logoUrl} alt="Logo" /> : <span>Choisir un logo</span>}
            </label>

            <label className="upload banner">
              Bannière
              <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleAsset(e.target.files[0], "banner")} />
              {bannerUrl ? <img src={bannerUrl} alt="Bannière" /> : <span>Choisir une bannière</span>}
            </label>
          </div>

          <div className="colors">
            <label>Couleur principale<input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} /></label>
            <label>Couleur secondaire<input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} /></label>
          </div>

          <div className="preview" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
            <strong>{name || "Mon club"}</strong>
            <span>{city || "Ville"}</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .settings{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:1fr 1.1fr;gap:18px;padding:18px}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 14px;color:#6b1a2c}
        label{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}input,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}textarea{min-height:90px}
        .uploadGrid{display:grid;grid-template-columns:160px 1fr;gap:12px}.upload{height:140px;border:2px dashed #eadfd5;border-radius:20px;display:grid;place-items:center;text-align:center;cursor:pointer;background:#fffaf2}.upload.banner{height:140px}.upload img{width:100%;height:100%;object-fit:cover;border-radius:16px}.colors{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.preview{border-radius:24px;padding:28px;color:white;min-height:140px;display:flex;flex-direction:column;justify-content:end}.preview strong{font-size:1.8rem;font-family:"Alfa Slab One",serif}.preview span{font-weight:900}
        @media(max-width:900px){.layout,.uploadGrid,.colors{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
