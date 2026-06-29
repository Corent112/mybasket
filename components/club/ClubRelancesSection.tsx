"use client";

// components/club/ClubRelancesSection.tsx
import { useEffect, useMemo, useState } from "react";
import type { ClubPlayer } from "@/lib/club-core";
import type { PlayerCotisation } from "@/lib/club-cotisations";
import { getCotisationsWorkspace } from "@/lib/club-cotisations";
import {
  createCotisationReminder,
  listCotisationReminders,
  sendCotisationReminder,
  type CotisationReminder,
} from "@/lib/club-relances";
import {
  listMessageTemplates,
  renderTemplate,
  type MessageTemplate,
} from "@/lib/club-mailing-lists";

function euros(cents: number) {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;
}

function playerName(player?: ClubPlayer) {
  return player ? `${player.lastName} ${player.firstName}` : "—";
}

export default function ClubRelancesSection({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [cotisations, setCotisations] = useState<PlayerCotisation[]>([]);
  const [reminders, setReminders] = useState<CotisationReminder[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [selectedCotisationIds, setSelectedCotisationIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [workspace, reminderRows, templateRows] = await Promise.all([
        getCotisationsWorkspace(clubId),
        listCotisationReminders(clubId),
        listMessageTemplates(clubId, "cotisation"),
      ]);
      setPlayers(workspace.players);
      setCotisations(workspace.cotisations);
      setReminders(reminderRows);
      setTemplates(templateRows);
      if (!templateId && templateRows[0]) setTemplateId(templateRows[0].id);
    } catch (e: any) {
      setError(e?.message || "Relances impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const lateCotisations = useMemo(
    () => cotisations.filter((cotisation) => cotisation.remainingCents > 0),
    [cotisations]
  );

  const selectedTemplate = templates.find((template) => template.id === templateId) || templates[0] || null;

  function toggleCotisation(id: string) {
    setSelectedCotisationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function buildDraft(player: ClubPlayer, cotisation: PlayerCotisation) {
    const values = {
      club: clubName,
      prenom: player.firstName,
      nom: player.lastName,
      joueur: `${player.firstName} ${player.lastName}`,
      reste: euros(cotisation.remainingCents),
      total: euros(cotisation.amountCents),
      paye: euros(cotisation.paidCents),
    };

    if (!selectedTemplate) {
      return {
        subject: `Rappel cotisation - ${clubName}`,
        body: `Bonjour,\n\nIl reste ${values.reste} à régler pour ${values.joueur}.\n\nSportivement,\n${clubName}`,
      };
    }

    return {
      subject: renderTemplate(selectedTemplate.subject, values),
      body: renderTemplate(selectedTemplate.body, values),
    };
  }

  async function createReminder(cotisation: PlayerCotisation) {
    const player = players.find((item) => item.id === cotisation.playerId);
    if (!player) return;

    const recipientEmail = player.parentEmail || player.email;
    if (!recipientEmail) {
      setError("Aucun email parent/joueur pour cette relance.");
      return;
    }

    const draft = buildDraft(player, cotisation);

    try {
      const reminder = await createCotisationReminder({
        clubId,
        cotisationId: cotisation.id,
        playerId: cotisation.playerId,
        recipientEmail,
        subject: draft.subject,
        body: draft.body,
      });
      setReminders((prev) => [reminder, ...prev]);
      setMessage("Relance préparée.");
    } catch (e: any) {
      setError(e?.message || "Relance non créée.");
    }
  }

  async function createBulkReminders() {
    const selected = lateCotisations.filter((cotisation) => selectedCotisationIds.includes(cotisation.id));

    if (!selected.length) {
      setError("Sélectionne au moins une cotisation.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      for (const cotisation of selected) {
        await createReminder(cotisation);
      }

      setSelectedCotisationIds([]);
      setMessage(`${selected.length} relance(s) préparée(s).`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Préparation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function send(reminder: CotisationReminder) {
    setSendingId(reminder.id);
    setError("");
    setMessage("");
    try {
      await sendCotisationReminder(reminder.id);
      setMessage("Relance envoyée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Relance non envoyée.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <section className="relances">
      <div className="top">
        <div>
          <p>RELANCES</p>
          <h2>Cotisations impayées</h2>
          <span>Choisis un modèle, sélectionne les joueurs, prépare et envoie les rappels.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="tools">
        <label>Modèle
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>

        <button disabled={busy || !selectedCotisationIds.length} onClick={createBulkReminders}>
          Préparer {selectedCotisationIds.length || ""} relance(s)
        </button>
      </div>

      <div className="layout">
        <div className="panel">
          <h3>À relancer</h3>
          <div className="table">
            <div className="row head">
              <span></span><span>Joueur</span><span>Restant</span><span>Email</span><span>Action</span>
            </div>
            {lateCotisations.map((cotisation) => {
              const player = players.find((item) => item.id === cotisation.playerId);
              return (
                <div className="row" key={cotisation.id}>
                  <span>
                    <input
                      type="checkbox"
                      checked={selectedCotisationIds.includes(cotisation.id)}
                      onChange={() => toggleCotisation(cotisation.id)}
                    />
                  </span>
                  <span>{playerName(player)}</span>
                  <span>{euros(cotisation.remainingCents)}</span>
                  <span>{player?.parentEmail || player?.email || "—"}</span>
                  <span><button onClick={() => createReminder(cotisation)}>Préparer</button></span>
                </div>
              );
            })}
            {!lateCotisations.length && <div className="empty">Aucune cotisation en attente.</div>}
          </div>
        </div>

        <div className="panel">
          <h3>Historique</h3>
          <div className="cards">
            {reminders.map((reminder) => {
              const player = players.find((item) => item.id === reminder.playerId);
              return (
                <article className="card" key={reminder.id}>
                  <strong>{reminder.subject}</strong>
                  <span>{playerName(player)}</span>
                  <small>{reminder.status} · {reminder.recipientEmail || "sans email"}</small>
                  <button disabled={sendingId === reminder.id || reminder.status === "sent"} onClick={() => send(reminder)}>
                    {reminder.status === "sent" ? "Envoyée" : sendingId === reminder.id ? "Envoi..." : "Envoyer"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .relances{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .tools{display:flex;justify-content:space-between;gap:12px;align-items:end;padding:14px 18px;border-bottom:1px solid #eef2f7;background:#fcfcfd}.tools label{margin:0;min-width:320px}
        .layout{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;padding:18px}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 14px;color:#6b1a2c}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}
        select,input{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}label{display:grid;gap:6px;color:#6b7280;font-weight:900;font-size:.78rem}
        .table{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:.25fr 1.1fr .7fr 1.1fr .7fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}
        .cards{display:grid;gap:12px}.card{border:1px solid #eadfd5;border-radius:18px;padding:14px;display:grid;gap:8px}.card strong{color:#6b1a2c}.card span,.card small{color:#6b7280;font-weight:800}.empty{padding:18px;color:#6b7280;font-weight:900}
        @media(max-width:1000px){.layout,.row,.tools{grid-template-columns:1fr;display:grid}.row.head{display:none}.tools label{min-width:0}}
      `}</style>
    </section>
  );
}
