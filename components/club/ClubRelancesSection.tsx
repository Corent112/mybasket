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
  return `${(Number(cents || 0) / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
  })} €`;
}

function playerName(player?: ClubPlayer) {
  return player ? `${player.lastName} ${player.firstName}` : "—";
}

function playerEmail(player?: ClubPlayer) {
  return player?.parentEmail || player?.email || "";
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

      if (!templateId && templateRows[0]) {
        setTemplateId(templateRows[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Relances impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const lateCotisations = useMemo(
    () => cotisations.filter((cotisation) => Number(cotisation.remainingCents || 0) > 0),
    [cotisations],
  );

  const sentCount = reminders.filter((reminder) => reminder.status === "sent").length;
  const pendingCount = reminders.filter((reminder) => reminder.status !== "sent").length;
  const totalLateCents = lateCotisations.reduce(
    (sum, cotisation) => sum + Number(cotisation.remainingCents || 0),
    0,
  );
  const withoutEmailCount = lateCotisations.filter((cotisation) => {
    const player = players.find((item) => item.id === cotisation.playerId);
    return !playerEmail(player);
  }).length;

  const selectedTemplate =
    templates.find((template) => template.id === templateId) || templates[0] || null;

  function toggleCotisation(id: string) {
    setSelectedCotisationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setSelectedCotisationIds((prev) =>
      prev.length === lateCotisations.length ? [] : lateCotisations.map((item) => item.id),
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

    const recipientEmail = playerEmail(player);
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
    const selected = lateCotisations.filter((cotisation) =>
      selectedCotisationIds.includes(cotisation.id),
    );

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

  async function prepareAllLate() {
    setSelectedCotisationIds(lateCotisations.map((cotisation) => cotisation.id));
    await createBulkReminders();
  }

  return (
    <section className="relances">
      <div className="top">
        <div>
          <p>RELANCES AUTOMATIQUES</p>
          <h2>Centre de relance</h2>
          <span>
            Ici, on traite uniquement les rappels financiers : cotisations impayées,
            retards et suivis d’envoi.
          </span>
        </div>

        <button
          className="primaryAction"
          disabled={busy || lateCotisations.length === 0}
          onClick={prepareAllLate}
          type="button"
        >
          Relancer tout
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="kpis">
        <article>
          <span>À relancer</span>
          <strong>{lateCotisations.length}</strong>
          <small>dossier(s) cotisation</small>
        </article>
        <article>
          <span>Montant restant</span>
          <strong>{euros(totalLateCents)}</strong>
          <small>sur les impayés</small>
        </article>
        <article>
          <span>Préparées</span>
          <strong>{pendingCount}</strong>
          <small>en attente d’envoi</small>
        </article>
        <article>
          <span>Envoyées</span>
          <strong>{sentCount}</strong>
          <small>historique relances</small>
        </article>
        <article className={withoutEmailCount ? "warning" : ""}>
          <span>Sans email</span>
          <strong>{withoutEmailCount}</strong>
          <small>à compléter</small>
        </article>
      </div>

      <div className="tools">
        <label>
          Modèle de relance cotisation
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Modèle par défaut</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <div className="toolActions">
          <button type="button" className="ghost" onClick={toggleAll}>
            {selectedCotisationIds.length === lateCotisations.length
              ? "Tout désélectionner"
              : "Tout sélectionner"}
          </button>
          <button
            type="button"
            disabled={busy || !selectedCotisationIds.length}
            onClick={createBulkReminders}
          >
            Préparer {selectedCotisationIds.length || ""} relance(s)
          </button>
        </div>
      </div>

      <div className="layout">
        <div className="panel mainPanel">
          <div className="panelHead">
            <div>
              <p>À traiter</p>
              <h3>Cotisations impayées</h3>
            </div>
            <span>{lateCotisations.length} dossier(s)</span>
          </div>

          <div className="lateList">
            {lateCotisations.map((cotisation) => {
              const player = players.find((item) => item.id === cotisation.playerId);
              const email = playerEmail(player);
              const selected = selectedCotisationIds.includes(cotisation.id);

              return (
                <article className={selected ? "lateCard selected" : "lateCard"} key={cotisation.id}>
                  <label className="selectLine">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleCotisation(cotisation.id)}
                    />
                    <span />
                  </label>

                  <div className="identity">
                    <strong>{playerName(player)}</strong>
                    <small>{email || "Email manquant"}</small>
                  </div>

                  <div className="money">
                    <span>Restant</span>
                    <strong>{euros(cotisation.remainingCents)}</strong>
                    <small>
                      Payé {euros(cotisation.paidCents)} / {euros(cotisation.amountCents)}
                    </small>
                  </div>

                  <button type="button" onClick={() => createReminder(cotisation)} disabled={!email}>
                    Préparer
                  </button>
                </article>
              );
            })}

            {!lateCotisations.length && (
              <div className="empty">Aucune cotisation en attente. Propre, net, carré.</div>
            )}
          </div>
        </div>

        <aside className="panel sidePanel">
          <div className="panelHead">
            <div>
              <p>Historique</p>
              <h3>Relances préparées</h3>
            </div>
          </div>

          <div className="cards">
            {reminders.map((reminder) => {
              const player = players.find((item) => item.id === reminder.playerId);

              return (
                <article className="card" key={reminder.id}>
                  <strong>{reminder.subject}</strong>
                  <span>{playerName(player)}</span>
                  <small>
                    {reminder.status} · {reminder.recipientEmail || "sans email"}
                  </small>
                  <button
                    type="button"
                    disabled={sendingId === reminder.id || reminder.status === "sent"}
                    onClick={() => send(reminder)}
                  >
                    {reminder.status === "sent"
                      ? "Envoyée"
                      : sendingId === reminder.id
                        ? "Envoi..."
                        : "Envoyer"}
                  </button>
                </article>
              );
            })}

            {!reminders.length && <div className="empty small">Aucune relance préparée.</div>}
          </div>
        </aside>
      </div>

      <style jsx>{`
        .relances {
          border: 1px solid #eadfd5;
          border-radius: 28px;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.06);
          font-family: Roboto, system-ui, sans-serif;
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 24px;
          background: linear-gradient(135deg, #fff, #fff5e8);
          border-bottom: 1px solid #eadfd5;
        }

        .top p,
        .panelHead p {
          margin: 0 0 6px;
          color: #d4a24c;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .top h2 {
          margin: 0;
          color: #6b1a2c;
          font-family: "Alfa Slab One", serif;
          font-weight: 400;
        }

        .top span {
          display: block;
          max-width: 760px;
          color: #6b7280;
          font-weight: 800;
          line-height: 1.5;
        }

        button {
          border: 1px solid #eadfd5;
          background: #6b1a2c;
          color: white;
          border-radius: 999px;
          padding: 11px 16px;
          font-weight: 900;
          cursor: pointer;
          transition: 0.18s ease;
          white-space: nowrap;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 26px rgba(107, 26, 44, 0.18);
        }

        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .primaryAction {
          min-height: 48px;
          padding: 0 22px;
          box-shadow: 0 14px 30px rgba(107, 26, 44, 0.18);
        }

        .ghost {
          background: #fffaf2;
          color: #6b1a2c;
        }

        .alert {
          margin: 16px;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 900;
        }

        .alert.error {
          background: #fff0f0;
          color: #b91c1c;
        }

        .alert.ok {
          background: #f0fff4;
          color: #15803d;
        }

        .kpis {
          display: grid;
          grid-template-columns: repeat(5, minmax(140px, 1fr));
          gap: 12px;
          padding: 18px;
          border-bottom: 1px solid #f0e7dd;
          background: #fffdf8;
        }

        .kpis article {
          border: 1px solid #eadfd5;
          border-radius: 20px;
          padding: 16px;
          background: white;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.035);
        }

        .kpis article.warning {
          background: #fff7ed;
          border-color: #fed7aa;
        }

        .kpis span,
        .kpis small {
          display: block;
          color: #8d7d75;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .kpis strong {
          display: block;
          margin: 8px 0 4px;
          color: #6b1a2c;
          font-size: 1.5rem;
          line-height: 1;
        }

        .tools {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) auto;
          gap: 14px;
          align-items: end;
          padding: 16px 18px;
          border-bottom: 1px solid #eef2f7;
          background: #fcfcfd;
        }

        .tools label {
          display: grid;
          gap: 7px;
          color: #6b7280;
          font-weight: 900;
          font-size: 0.78rem;
          text-transform: uppercase;
        }

        select {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 12px;
          font: inherit;
          background: white;
        }

        .toolActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
          gap: 18px;
          padding: 18px;
        }

        .panel {
          border: 1px solid #eadfd5;
          border-radius: 24px;
          padding: 18px;
          background: #fff;
          min-width: 0;
        }

        .panelHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .panelHead h3 {
          margin: 0;
          color: #6b1a2c;
        }

        .panelHead > span {
          border-radius: 999px;
          background: #fff7ed;
          color: #6b1a2c;
          padding: 7px 10px;
          font-weight: 900;
          font-size: 0.78rem;
          white-space: nowrap;
        }

        .lateList,
        .cards {
          display: grid;
          gap: 10px;
        }

        .lateCard {
          display: grid;
          grid-template-columns: 34px minmax(160px, 1fr) minmax(180px, 0.9fr) auto;
          gap: 14px;
          align-items: center;
          border: 1px solid #edf0f4;
          border-radius: 18px;
          padding: 14px;
          background: #fff;
          transition: 0.18s ease;
        }

        .lateCard.selected {
          border-color: #6b1a2c;
          box-shadow: 0 0 0 3px rgba(107, 26, 44, 0.08);
        }

        .selectLine {
          display: grid;
          place-items: center;
          margin: 0;
        }

        .selectLine input {
          width: 18px;
          height: 18px;
          accent-color: #6b1a2c;
        }

        .identity,
        .money {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .identity strong,
        .card strong {
          color: #6b1a2c;
          overflow-wrap: anywhere;
        }

        .identity small,
        .money span,
        .money small,
        .card span,
        .card small {
          color: #6b7280;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .money strong {
          color: #111827;
          font-size: 1.15rem;
        }

        .card {
          border: 1px solid #eadfd5;
          border-radius: 18px;
          padding: 14px;
          display: grid;
          gap: 8px;
          background: #fffdf9;
        }

        .empty {
          border: 1px dashed #eadfd5;
          border-radius: 18px;
          padding: 30px;
          text-align: center;
          color: #6b7280;
          font-weight: 900;
          background: #fffdf8;
        }

        .empty.small {
          padding: 18px;
        }

        @media (max-width: 1100px) {
          .kpis {
            grid-template-columns: repeat(2, 1fr);
          }

          .layout,
          .tools {
            grid-template-columns: 1fr;
          }

          .toolActions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 760px) {
          .top,
          .panelHead {
            display: grid;
          }

          .kpis {
            grid-template-columns: 1fr;
          }

          .lateCard {
            grid-template-columns: 1fr;
          }

          .selectLine {
            justify-items: start;
          }
        }
      `}</style>
    </section>
  );
}
