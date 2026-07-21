"use client";

// components/club/ClubSettingsProSection.tsx
import { useEffect, useState } from "react";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  getSettingsWorkspace,
  updateClubSettingsPro,
  updateMessageTemplate,
  uploadSignatureImage,
  type ClubSettingsPro,
} from "@/lib/club-settings-pro";
import type { MessageTemplate } from "@/lib/club-mailing-lists";

const TEMPLATE_CATEGORIES = ["general", "cotisation", "convocation", "licence", "document", "custom"];

function emptyTemplate(clubId: string): MessageTemplate {
  return {
    id: "new",
    clubId,
    templateKey: "custom",
    name: "",
    subject: "",
    body: "",
    category: "general",
    status: "active",
  };
}

export default function ClubSettingsProSection({ clubId }: { clubId: string }) {
  const [settings, setSettings] = useState<ClubSettingsPro | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const data = await getSettingsWorkspace(clubId);
      setSettings(data.settings);
      setTemplates(data.templates);
    } catch (e: any) {
      setError(e?.message || "Paramètres impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  function patchSettings(patch: Partial<ClubSettingsPro>) {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
  }

  async function saveSettings() {
    if (!settings) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const updated = await updateClubSettingsPro(clubId, {
        emailFromName: settings.emailFromName,
        emailFromAddress: settings.emailFromAddress,
        replyToEmail: settings.replyToEmail,
        signatureText: settings.signatureText,
        signatureImageUrl: settings.signatureImageUrl,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        seasonLabel: settings.seasonLabel,
        defaultCategories: settings.defaultCategories,
      });
      setSettings(updated);
      setMessage("Paramètres enregistrés.");
    } catch (e: any) {
      setError(e?.message || "Paramètres non enregistrés.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSignature(file: File) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const url = await uploadSignatureImage({ clubId, file });
      patchSettings({ signatureImageUrl: url });
      setMessage("Signature image ajoutée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Signature non envoyée.");
    } finally {
      setBusy(false);
    }
  }

  function addCategory() {
    if (!settings || !categoryInput.trim()) return;
    const value = categoryInput.trim();
    if (settings.defaultCategories.includes(value)) return setCategoryInput("");
    patchSettings({ defaultCategories: [...settings.defaultCategories, value] });
    setCategoryInput("");
  }

  function removeCategory(value: string) {
    if (!settings) return;
    patchSettings({ defaultCategories: settings.defaultCategories.filter((item) => item !== value) });
  }

  async function saveTemplate() {
    if (!editingTemplate) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (editingTemplate.id === "new") {
        await createMessageTemplate({
          clubId,
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          category: editingTemplate.category,
        });
      } else {
        await updateMessageTemplate(editingTemplate.id, {
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          category: editingTemplate.category,
        });
      }

      setEditingTemplate(null);
      setMessage("Modèle enregistré.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Modèle non enregistré.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(template: MessageTemplate) {
    if (!confirm(`Supprimer le modèle "${template.name}" ?`)) return;

    try {
      await deleteMessageTemplate(template.id);
      setMessage("Modèle supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    }
  }

  if (!settings) {
    return (
      <section className="settings">
        <div className="empty">Chargement paramètres...</div>
        <style jsx>{`.settings{border:1px solid #eadfd5;border-radius:28px;background:#fff;padding:24px}.empty{color:#6b7280;font-weight:900}`}</style>
      </section>
    );
  }

  return (
    <section className="settings">
      <div className="top">
        <div>
          <p>PARAMÈTRES</p>
          <h2>Configuration club</h2>
          <span>Identité email, signature JPG, modèles de messages, saison et catégories.</span>
        </div>
        <button disabled={busy} onClick={saveSettings}>Enregistrer</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <main className="main">
          <section className="panel">
            <h3>Emails club</h3>
            <div className="grid2">
              <label>Nom expéditeur<input value={settings.emailFromName} onChange={(e) => patchSettings({ emailFromName: e.target.value })} /></label>
              <label>Email expéditeur<input value={settings.emailFromAddress} onChange={(e) => patchSettings({ emailFromAddress: e.target.value })} /></label>
              <label>Répondre à<input value={settings.replyToEmail} onChange={(e) => patchSettings({ replyToEmail: e.target.value })} /></label>
              <label>Saison<input value={settings.seasonLabel} onChange={(e) => patchSettings({ seasonLabel: e.target.value })} /></label>
            </div>
          </section>

          <section className="panel">
            <h3>Signature email</h3>
            <label>Texte signature<textarea value={settings.signatureText} onChange={(e) => patchSettings({ signatureText: e.target.value })} /></label>
            <div className="signatureBox">
              {settings.signatureImageUrl ? <img src={settings.signatureImageUrl} alt="Signature email" /> : <span>Aucune image signature</span>}
              <label className="uploadBtn">
                Ajouter JPG/PNG
                <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadSignature(e.target.files[0])} />
              </label>
            </div>
          </section>

          <section className="panel">
            <h3>Catégories club</h3>
            <div className="chips">
              {settings.defaultCategories.map((cat) => (
                <button className="chip" key={cat} onClick={() => removeCategory(cat)}>{cat} ×</button>
              ))}
            </div>
            <div className="inline">
              <input value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)} placeholder="U17..." />
              <button onClick={addCategory}>Ajouter</button>
            </div>
          </section>
        </main>

        <aside className="templates">
          <div className="sideHead">
            <h3>Modèles</h3>
            <button onClick={() => setEditingTemplate(emptyTemplate(clubId))}>+ Modèle</button>
          </div>

          {templates.map((template) => (
            <article className="template" key={template.id}>
              <div>
                <strong>{template.name}</strong>
                <span>{template.category} · {template.subject}</span>
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => setEditingTemplate(template)}>Modifier</button>
                <button className="danger" onClick={() => removeTemplate(template)}>Suppr.</button>
              </div>
            </article>
          ))}
        </aside>
      </div>

      {editingTemplate && (
        <div className="modalLayer" onClick={() => setEditingTemplate(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTemplate.id === "new" ? "Créer un modèle" : "Modifier le modèle"}</h3>
            <label>Nom<input value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} /></label>
            <label>Catégorie
              <select value={editingTemplate.category} onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}>
                {TEMPLATE_CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}
              </select>
            </label>
            <label>Sujet<input value={editingTemplate.subject} onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} /></label>
            <label>Message<textarea value={editingTemplate.body} onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })} /></label>
            <div className="hint">Variables : {"{club} {prenom} {nom} {joueur} {reste} {total} {paye} {event} {date} {heure} {lieu}"}</div>
            <div className="modalActions">
              <button className="ghost" onClick={() => setEditingTemplate(null)}>Annuler</button>
              <button disabled={busy} onClick={saveTemplate}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .settings{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:1fr 380px;gap:18px;padding:18px}.main{display:grid;gap:18px}.panel,.templates{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.templates{background:#fffdf8}.panel h3,.templates h3{margin:0 0 14px;color:#6b1a2c}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:grid;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:10px 11px;font:inherit}textarea{min-height:120px;resize:vertical}
        button,.uploadBtn{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer;text-decoration:none}.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}.chip{background:#fff8ee;color:#6b1a2c}
        .signatureBox{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.signatureBox img{max-width:320px;max-height:120px;border:1px solid #eadfd5;border-radius:16px;padding:8px;background:#fff}.signatureBox span{color:#6b7280;font-weight:900}.chips,.inline,.actions,.sideHead{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.inline input{min-width:220px}
        .sideHead{justify-content:space-between;margin-bottom:14px}.template{border:1px solid #eadfd5;border-radius:18px;background:#fff;padding:12px;margin-bottom:10px;display:grid;gap:10px}.template strong{display:block;color:#6b1a2c}.template span{display:block;color:#6b7280;font-weight:800;font-size:.78rem}
        .modalLayer{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:1000;display:grid;place-items:center;padding:20px}.modal{width:min(760px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:28px;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.22)}.modal h3{margin:0 0 16px;color:#6b1a2c}.hint{background:#fff8ee;border:1px solid #eadfd5;border-radius:14px;padding:10px;color:#6b7280;font-weight:900}.modalActions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
        @media(max-width:1000px){.layout,.grid2,.top{grid-template-columns:1fr;display:grid}}
      `}</style>
    </section>
  );
}
