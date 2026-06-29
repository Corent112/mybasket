"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClubCoach, ClubPlayer, ClubTeam } from "@/lib/club-core";
import {
  createCommunicationCampaign,
  createCommunicationGroupPro,
  deleteCommunicationCampaign,
  getCommunicationWorkspace,
  listCampaignRecipients,
  resolveRecipients,
  sendCommunicationCampaign,
  updateCommunicationCampaign,
  type CommunicationCampaign,
  type CommunicationFilters,
  type CommunicationGroup,
  type CommunicationRecipient,
  type ResolvedRecipient,
} from "@/lib/club-communication-pro";
import {
  listMailingLists,
  listMailingListMembers,
  listMessageTemplates,
  type MailingList,
  type MailingListMember,
  type MessageTemplate,
} from "@/lib/club-mailing-lists";

const TARGETS = [
  { value: "players", label: "Joueurs" },
  { value: "parents", label: "Parents" },
  { value: "coaches", label: "Coachs" },
] as const;

function emptyFilters(): CommunicationFilters {
  return {
    target: "parents",
    teamId: null,
    category: null,
    gender: null,
    paymentStatus: null,
    licenseStatus: null,
    medicalOnly: false,
  };
}

export default function ClubCommunicationProSection({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const [groups, setGroups] = useState<CommunicationGroup[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaign[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [mailingLists, setMailingLists] = useState<MailingList[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [listMembers, setListMembers] = useState<MailingListMember[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [recipients, setRecipients] = useState<ResolvedRecipient[]>([]);
  const [manualRecipients, setManualRecipients] = useState<ResolvedRecipient[]>([]);
  const [campaignRecipients, setCampaignRecipients] = useState<CommunicationRecipient[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const [filters, setFilters] = useState<CommunicationFilters>(emptyFilters());
  const [groupName, setGroupName] = useState("");
  const [title, setTitle] = useState("Message club");
  const [subject, setSubject] = useState(`Information ${clubName}`);
  const [body, setBody] = useState("");

  async function load() {
    setError("");

    try {
      const [data, lists, templateRows] = await Promise.all([
        getCommunicationWorkspace(clubId),
        listMailingLists(clubId),
        listMessageTemplates(clubId),
      ]);

      setGroups(data.groups);
      setCampaigns(data.campaigns);
      setTeams(data.teams);
      setPlayers(data.players);
      setCoaches(data.coaches);
      setMailingLists(lists);
      setTemplates(templateRows);

      if (!templateId && templateRows[0]) {
        setTemplateId(templateRows[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Communication impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    setRecipients(resolveRecipients({ filters, players, coaches }));
  }, [filters, players, coaches]);

  useEffect(() => {
    async function loadRecipients() {
      if (!selectedCampaignId) {
        setCampaignRecipients([]);
        return;
      }

      try {
        const rows = await listCampaignRecipients(clubId, selectedCampaignId);
        setCampaignRecipients(rows);
      } catch {
        setCampaignRecipients([]);
      }
    }

    loadRecipients();
  }, [clubId, selectedCampaignId]);

  useEffect(() => {
    async function loadList() {
      if (!selectedListId) {
        setListMembers([]);
        setManualRecipients([]);
        return;
      }

      const rows = await listMailingListMembers(clubId, selectedListId);
      setListMembers(rows);
      setManualRecipients(
        rows.map((row) => ({
          id: row.id,
          name: row.displayName,
          email: row.email,
          type: row.memberType,
          playerId: row.playerId,
          coachId: row.coachId,
        })) as ResolvedRecipient[]
      );
    }

    loadList().catch(() => {
      setListMembers([]);
      setManualRecipients([]);
    });
  }, [clubId, selectedListId]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(players.map((player) => player.category).filter(Boolean))
    );
  }, [players]);

  const finalRecipients = selectedListId ? manualRecipients : recipients;

  const selectedCampaign = useMemo(() => {
    return campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  function resetComposer() {
    setEditingCampaignId(null);
    setSelectedCampaignId("");
    setSelectedListId("");
    setTemplateId("");
    setFilters(emptyFilters());
    setTitle("Message club");
    setSubject(`Information ${clubName}`);
    setBody("");
    setMessage("");
    setError("");
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;

    setSubject(template.subject);
    setBody(template.body);
    setTitle(template.name);
  }

  async function saveGroup() {
    if (!groupName.trim()) {
      setError("Nom de groupe obligatoire.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const group = await createCommunicationGroupPro({
        clubId,
        name: groupName.trim(),
        description: "Groupe dynamique MyBasket",
        filters,
      });

      setGroups((prev) => [group, ...prev]);
      setGroupName("");
      setMessage("Groupe créé.");
    } catch (e: any) {
      setError(e?.message || "Groupe non créé.");
    }
  }

  async function saveCampaign() {
    if (!subject.trim() || !body.trim()) {
      setError("Sujet et message obligatoires.");
      return;
    }

    if (!finalRecipients.length) {
      setError("Aucun destinataire sélectionné.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const payload = {
        clubId,
        title: title.trim() || subject.trim(),
        subject: subject.trim(),
        body: body.trim(),
        filters: selectedListId
          ? ({ target: "custom", mailingListId: selectedListId } as CommunicationFilters)
          : filters,
        recipients: finalRecipients,
      };

      if (editingCampaignId) {
        const updated = await updateCommunicationCampaign({
          ...payload,
          campaignId: editingCampaignId,
        });

        setCampaigns((prev) =>
          prev.map((campaign) => (campaign.id === updated.id ? updated : campaign))
        );
        setSelectedCampaignId(updated.id);
        setMessage("Campagne modifiée.");
      } else {
        const campaign = await createCommunicationCampaign(payload);
        setCampaigns((prev) => [campaign, ...prev]);
        setSelectedCampaignId(campaign.id);
        setEditingCampaignId(campaign.id);
        setMessage("Campagne créée en brouillon.");
      }

      await load();
    } catch (e: any) {
      setError(e?.message || "Campagne non sauvegardée.");
    }
  }

  function editCampaign(campaign: CommunicationCampaign) {
    setEditingCampaignId(campaign.id);
    setSelectedCampaignId(campaign.id);
    setTitle(campaign.title || "Message club");
    setSubject(campaign.subject || "");
    setBody(campaign.body || "");

    const campaignFilters = campaign.filters || emptyFilters();

    if ((campaignFilters as any).mailingListId) {
      setSelectedListId(String((campaignFilters as any).mailingListId));
    } else {
      setSelectedListId("");
      setFilters(campaignFilters);
    }

    setMessage("");
    setError("");
  }

  async function removeCampaign(campaign: CommunicationCampaign) {
    const ok = window.confirm(
      `Supprimer la campagne "${campaign.title}" ?\n\nLes destinataires liés seront aussi supprimés.`
    );

    if (!ok) return;

    setError("");
    setMessage("");

    try {
      await deleteCommunicationCampaign(clubId, campaign.id);

      setCampaigns((prev) => prev.filter((item) => item.id !== campaign.id));

      if (selectedCampaignId === campaign.id) {
        setSelectedCampaignId("");
        setCampaignRecipients([]);
      }

      if (editingCampaignId === campaign.id) {
        resetComposer();
      }

      setMessage("Campagne supprimée.");
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    }
  }

  async function sendCampaign(campaign: CommunicationCampaign) {
    const ok = window.confirm(
      `Envoyer la campagne "${campaign.title}" à ${campaign.recipientsCount} destinataire(s) ?`
    );

    if (!ok) return;

    setSending(true);
    setError("");
    setMessage("");

    try {
      await sendCommunicationCampaign(campaign.id);
      await load();
      setSelectedCampaignId(campaign.id);
      setMessage("Campagne envoyée.");
    } catch (e: any) {
      setError(e?.message || "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="communication">
      <div className="top">
        <div>
          <p>COMMUNICATION</p>
          <h2>Messages & campagnes</h2>
          <span>
            Utilise tes listes de mailings ou un ciblage dynamique précis.
          </span>
        </div>

        <button className="newBtn" onClick={resetComposer}>
          + Nouveau message
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="filters">
          <h3>Ciblage</h3>

          <label>
            Liste mailing
            <select
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
            >
              <option value="">Ciblage dynamique</option>
              {mailingLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>

          {!selectedListId && (
            <>
              <label>
                Public
                <select
                  value={filters.target}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      target: e.target.value as CommunicationFilters["target"],
                    })
                  }
                >
                  {TARGETS.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Équipe
                <select
                  value={filters.teamId || ""}
                  onChange={(e) =>
                    setFilters({ ...filters, teamId: e.target.value || null })
                  }
                >
                  <option value="">Tout le club</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Catégorie
                <select
                  value={filters.category || ""}
                  onChange={(e) =>
                    setFilters({ ...filters, category: e.target.value || null })
                  }
                >
                  <option value="">Toutes</option>
                  {categories.map((cat) => (
                    <option key={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              <label>
                Paiement
                <select
                  value={filters.paymentStatus || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      paymentStatus: e.target.value || null,
                    })
                  }
                >
                  <option value="">Tous</option>
                  <option value="paid">Payé</option>
                  <option value="partial">Partiel</option>
                  <option value="pending">En attente</option>
                  <option value="late">Retard</option>
                </select>
              </label>

              <label>
                Licence
                <select
                  value={filters.licenseStatus || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      licenseStatus: e.target.value || null,
                    })
                  }
                >
                  <option value="">Toutes</option>
                  <option value="valid">Validée</option>
                  <option value="pending">En attente</option>
                  <option value="missing">Manquante</option>
                </select>
              </label>

              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={Boolean(filters.medicalOnly)}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      medicalOnly: e.target.checked,
                    })
                  }
                />
                Uniquement les dossiers médicaux signalés
              </label>
            </>
          )}

          <div className="preview">
            <b>{finalRecipients.length}</b>
            <span>{selectedListId ? "contacts liste" : "destinataires"}</span>
          </div>

          {selectedListId && (
            <div className="listPreview">
              {listMembers.slice(0, 8).map((member) => (
                <small key={member.id}>
                  {member.displayName} · {member.email}
                </small>
              ))}
            </div>
          )}

          {!selectedListId && (
            <>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nom du groupe dynamique..."
              />
              <button onClick={saveGroup}>Créer groupe</button>
            </>
          )}

          {groups.length > 0 && (
            <div className="groups">
              <h4>Groupes créés</h4>
              {groups.slice(0, 8).map((group) => (
                <small key={group.id}>{group.name}</small>
              ))}
            </div>
          )}
        </aside>

        <main className="main">
          <div className="composer">
            <div className="composerHead">
              <div>
                <p>{editingCampaignId ? "MODIFICATION" : "NOUVEAU MESSAGE"}</p>
                <h3>
                  {editingCampaignId
                    ? "Modifier la campagne"
                    : "Créer une campagne"}
                </h3>
              </div>

              <div className="recipientBadge">
                <strong>{finalRecipients.length}</strong>
                <span>destinataire(s)</span>
              </div>
            </div>

            <div className="composerGrid">
              <label>
                Modèle
                <select
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">Sans modèle</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.category} · {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Titre interne
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Convocation match U15"
                />
              </label>

              <label className="wide">
                Sujet email
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Sujet visible par les destinataires"
                />
              </label>

              <label className="wide">
                Message
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Écris ton message..."
                />
              </label>
            </div>

            <div className="composerFooter">
              <div>
                <strong>{finalRecipients.length}</strong>
                <span> destinataire(s) sélectionné(s)</span>
              </div>

              <div className="actions">
                <button onClick={saveCampaign}>
                  {editingCampaignId ? "Mettre à jour" : "Créer brouillon"}
                </button>

                {editingCampaignId && (
                  <button className="ghost" onClick={resetComposer}>
                    Annuler
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="history">
            <div className="historyHead">
              <h3>Campagnes</h3>
              <span>{campaigns.length} campagne(s)</span>
            </div>

            {campaigns.length === 0 ? (
              <div className="empty">Aucune campagne pour le moment.</div>
            ) : (
              campaigns.map((campaign) => (
                <article
                  className={`campaign ${
                    selectedCampaignId === campaign.id ? "active" : ""
                  }`}
                  key={campaign.id}
                >
                  <button
                    className="campaignOpen"
                    onClick={() => setSelectedCampaignId(campaign.id)}
                  >
                    <strong>{campaign.title}</strong>
                    <span>
                      {campaign.status} · {campaign.recipientsCount} destinataires
                      · {campaign.sentCount} envoyés
                    </span>
                  </button>

                  <div className="campaignActions">
                    <button className="ghost" onClick={() => editCampaign(campaign)}>
                      Modifier
                    </button>

                    <button
                      disabled={sending || campaign.status.startsWith("sent")}
                      onClick={() => sendCampaign(campaign)}
                    >
                      {campaign.status.startsWith("sent") ? "Envoyée" : "Envoyer"}
                    </button>

                    <button
                      className="danger"
                      onClick={() => removeCampaign(campaign)}
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {selectedCampaignId && (
            <div className="recipients">
              <h3>
                Destinataires campagne
                {selectedCampaign && <small> · {selectedCampaign.title}</small>}
              </h3>

              <div className="table">
                <div className="row head">
                  <span>Nom</span>
                  <span>Email</span>
                  <span>Statut</span>
                </div>

                {campaignRecipients.map((recipient) => (
                  <div className="row" key={recipient.id}>
                    <span>{recipient.name}</span>
                    <span>{recipient.email || "—"}</span>
                    <span>{recipient.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
      <style jsx>{`
        .communication {
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
        .composerHead p {
          margin: 0 0 6px;
          color: #d4a24c;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .top h2 {
          margin: 0;
          color: #6b1a2c;
          font-family: "Alfa Slab One", serif;
          font-weight: 400;
        }

        .top span {
          color: #6b7280;
          font-weight: 700;
        }

        .alert {
          margin: 16px;
          padding: 14px;
          border-radius: 14px;
          font-weight: 800;
        }

        .alert.ok {
          background: #ecfdf5;
          color: #166534;
        }

        .alert.error {
          background: #fef2f2;
          color: #b91c1c;
        }

        .layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 18px;
          padding: 20px;
        }

        .filters,
        .composer,
        .history,
        .recipients {
          background: white;
          border: 1px solid #ece8df;
          border-radius: 24px;
          padding: 20px;
        }

        .filters {
          background: #fffdf9;
        }

        .main {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        h3 {
          margin: 0 0 16px;
          color: #6b1a2c;
        }

        h4 {
          margin: 20px 0 8px;
          color: #6b1a2c;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 14px;
          font-size: .82rem;
          font-weight: 800;
          color: #6b7280;
        }

        .checkLine {
          flex-direction: row;
          align-items: center;
          gap: 10px;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #dcdcdc;
          border-radius: 14px;
          padding: 12px;
          font: inherit;
          transition: .2s;
        }

        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          border-color: #6b1a2c;
          box-shadow: 0 0 0 3px rgba(107,26,44,.12);
        }

        textarea {
          resize: vertical;
          min-height: 220px;
          line-height: 1.6;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 11px 18px;
          cursor: pointer;
          font-weight: 800;
          transition: .2s;
          background: #6b1a2c;
          color: white;
        }

        button:hover {
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: .45;
          cursor: not-allowed;
          transform: none;
        }

        .ghost {
          background: #f3f4f6;
          color: #374151;
        }

        .danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .preview,
        .recipientBadge {
          background: linear-gradient(135deg,#fff8ec,#fff);
          border: 1px solid #eadfd5;
          border-radius: 18px;
          padding: 20px;
          text-align: center;
          margin: 16px 0;
        }

        .preview b,
        .recipientBadge strong {
          display: block;
          font-size: 2rem;
          color: #6b1a2c;
        }

        .preview span,
        .recipientBadge span {
          color: #6b7280;
          font-weight: 700;
        }

        .groups,
        .listPreview {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 14px;
        }

        .groups small,
        .listPreview small {
          padding: 8px 10px;
          background: #fafafa;
          border-radius: 10px;
          color: #6b7280;
        }

        .composerHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .composerGrid {
          display: grid;
          grid-template-columns: repeat(2,1fr);
          gap: 16px;
        }

        .wide {
          grid-column: span 2;
        }

        .composerFooter {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid #ececec;
        }

        .actions,
        .campaignActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .historyHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }

        .campaign {
          border: 1px solid #ececec;
          border-radius: 18px;
          padding: 18px;
          margin-bottom: 14px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
          transition: .2s;
        }

        .campaign.active {
          border-color: #6b1a2c;
          box-shadow: 0 0 0 3px rgba(107,26,44,.08);
        }

        .campaignOpen {
          background: transparent;
          color: inherit;
          padding: 0;
          flex: 1;
          text-align: left;
        }

        .campaignOpen strong {
          display: block;
          color: #6b1a2c;
          margin-bottom: 6px;
        }

        .campaignOpen span {
          color: #6b7280;
          font-size: .8rem;
        }

        .table {
          border: 1px solid #ececec;
          border-radius: 18px;
          overflow: hidden;
        }

        .row {
          display: grid;
          grid-template-columns: 1fr 1.3fr .8fr;
          border-bottom: 1px solid #ececec;
        }

        .row:last-child {
          border-bottom: none;
        }

        .row span {
          padding: 14px;
          font-weight: 700;
        }

        .row.head {
          background: #f9fafb;
          color: #6b7280;
          font-size: .8rem;
        }

        .empty {
          text-align: center;
          padding: 50px;
          color: #9ca3af;
          border: 2px dashed #ececec;
          border-radius: 18px;
        }

        @media (max-width:1000px) {

          .layout {
            grid-template-columns: 1fr;
          }

          .composerGrid {
            grid-template-columns: 1fr;
          }

          .wide {
            grid-column: span 1;
          }

          .composerFooter,
          .campaign,
          .composerHead,
          .top {
            flex-direction: column;
            align-items: stretch;
          }

          .row {
            grid-template-columns: 1fr;
          }

          .row.head {
            display: none;
          }
        }

      `}</style>
    </section>
  );
}