"use client";

// components/club/ClubCommunicationProSection.tsx
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

function statusLabel(status: string) {
  if (status === "draft") return "Brouillon";
  if (status.startsWith("sent")) return "Envoyée";
  return status || "—";
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
        })) as ResolvedRecipient[],
      );
    }

    loadList().catch(() => {
      setListMembers([]);
      setManualRecipients([]);
    });
  }, [clubId, selectedListId]);

  const categories = useMemo(() => {
    return Array.from(new Set(players.map((player) => player.category).filter(Boolean)));
  }, [players]);

  const finalRecipients = selectedListId ? manualRecipients : recipients;

  const selectedCampaign = useMemo(() => {
    return campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  const draftCampaigns = campaigns.filter((campaign) => campaign.status === "draft").length;
  const sentCampaigns = campaigns.filter((campaign) => campaign.status.startsWith("sent")).length;

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
          prev.map((campaign) => (campaign.id === updated.id ? updated : campaign)),
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
      `Supprimer la campagne "${campaign.title}" ?\n\nLes destinataires liés seront aussi supprimés.`,
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
      `Envoyer la campagne "${campaign.title}" à ${campaign.recipientsCount} destinataire(s) ?`,
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
          <p>COMMUNICATION CLUB</p>
          <h2>Messages & campagnes</h2>
          <span>
            Ici, on envoie les messages généraux du club. Les relances financières
            restent dans l’onglet Relances.
          </span>
        </div>

        <button className="newBtn" onClick={resetComposer} type="button">
          + Nouveau message
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="overview">
        <article>
          <span>Destinataires actuels</span>
          <strong>{finalRecipients.length}</strong>
          <small>{selectedListId ? "liste mailing" : "ciblage dynamique"}</small>
        </article>
        <article>
          <span>Campagnes</span>
          <strong>{campaigns.length}</strong>
          <small>total</small>
        </article>
        <article>
          <span>Brouillons</span>
          <strong>{draftCampaigns}</strong>
          <small>à envoyer</small>
        </article>
        <article>
          <span>Envoyées</span>
          <strong>{sentCampaigns}</strong>
          <small>historique</small>
        </article>
      </div>

      <div className="layout">
        <aside className="filters">
          <div className="panelHead">
            <p>Ciblage</p>
            <h3>Destinataires</h3>
          </div>

          <label>
            Liste mailing
            <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}>
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
                  onChange={(e) => setFilters({ ...filters, teamId: e.target.value || null })}
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
                  onChange={(e) => setFilters({ ...filters, category: e.target.value || null })}
                >
                  <option value="">Toutes</option>
                  {categories.map((cat) => (
                    <option key={cat}>{cat}</option>
                  ))}
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
                  onChange={(e) => setFilters({ ...filters, medicalOnly: e.target.checked })}
                />
                Dossiers médicaux signalés
              </label>
            </>
          )}

          <div className="recipientBox">
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
            <div className="groupBuilder">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nom du groupe dynamique..."
              />
              <button onClick={saveGroup} type="button">
                Créer groupe
              </button>
            </div>
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
                <h3>{editingCampaignId ? "Modifier la campagne" : "Créer une campagne"}</h3>
              </div>
              <div className="recipientBadge">
                <strong>{finalRecipients.length}</strong>
                <span>destinataire(s)</span>
              </div>
            </div>

            <div className="composerGrid">
              <label>
                Modèle
                <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
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
              <div className="selectedCount">
                <strong>{finalRecipients.length}</strong>
                <span> destinataire(s) sélectionné(s)</span>
              </div>

              <div className="actions">
                <button onClick={saveCampaign} type="button">
                  {editingCampaignId ? "Mettre à jour" : "Créer brouillon"}
                </button>

                {editingCampaignId && (
                  <button className="ghost" onClick={resetComposer} type="button">
                    Annuler
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="history">
          <div className="historyHead">
            <div>
              <p>Historique</p>
              <h3>Campagnes</h3>
            </div>
            <span>{campaigns.length}</span>
          </div>

          {campaigns.length === 0 ? (
            <div className="empty">Aucune campagne pour le moment.</div>
          ) : (
            <div className="campaignList">
              {campaigns.map((campaign) => (
                <article
                  className={`campaign ${selectedCampaignId === campaign.id ? "active" : ""}`}
                  key={campaign.id}
                >
                  <button
                    className="campaignOpen"
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    type="button"
                  >
                    <strong>{campaign.title}</strong>
                    <span>
                      {statusLabel(campaign.status)} · {campaign.recipientsCount} destinataire(s)
                    </span>
                  </button>

                  <div className="campaignActions">
                    <button className="ghost" onClick={() => editCampaign(campaign)} type="button">
                      Modifier
                    </button>
                    <button
                      disabled={sending || campaign.status.startsWith("sent")}
                      onClick={() => sendCampaign(campaign)}
                      type="button"
                    >
                      {campaign.status.startsWith("sent") ? "Envoyée" : "Envoyer"}
                    </button>
                    <button className="danger" onClick={() => removeCampaign(campaign)} type="button">
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedCampaignId && (
            <div className="recipients">
              <h4>
                Destinataires
                {selectedCampaign && <small> · {selectedCampaign.title}</small>}
              </h4>

              <div className="recipientList">
                {campaignRecipients.map((recipient) => (
                  <div className="recipientRow" key={recipient.id}>
                    <strong>{recipient.name}</strong>
                    <span>{recipient.email || "—"}</span>
                    <small>{recipient.status}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
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
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 20px;
          align-items: center;
          padding: 24px;
          background: linear-gradient(135deg, #fff, #fff5e8);
          border-bottom: 1px solid #eadfd5;
        }

        .top p,
        .composerHead p,
        .panelHead p,
        .historyHead p {
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
          color: #6b7280;
          font-weight: 800;
          line-height: 1.5;
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

        button {
          border: none;
          border-radius: 999px;
          padding: 11px 16px;
          cursor: pointer;
          font-weight: 900;
          transition: 0.18s ease;
          background: #6b1a2c;
          color: white;
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

        .newBtn {
          min-height: 48px;
          padding: 0 22px;
        }

        .ghost {
          background: #f3f4f6;
          color: #374151;
        }

        .danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .overview {
          display: grid;
          grid-template-columns: repeat(4, minmax(140px, 1fr));
          gap: 12px;
          padding: 18px;
          border-bottom: 1px solid #f0e7dd;
          background: #fffdf8;
        }

        .overview article {
          border: 1px solid #eadfd5;
          border-radius: 20px;
          padding: 16px;
          background: white;
        }

        .overview span,
        .overview small {
          display: block;
          color: #8d7d75;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .overview strong {
          display: block;
          margin: 8px 0 4px;
          color: #6b1a2c;
          font-size: 1.7rem;
          line-height: 1;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(270px, 0.75fr) minmax(420px, 1.35fr) minmax(300px, 0.9fr);
          gap: 18px;
          padding: 20px;
          align-items: start;
        }

        .filters,
        .composer,
        .history {
          background: white;
          border: 1px solid #ece8df;
          border-radius: 24px;
          padding: 20px;
          min-width: 0;
        }

        .filters {
          background: #fffdf9;
        }

        .main {
          min-width: 0;
        }

        h3,
        h4 {
          margin: 0 0 16px;
          color: #6b1a2c;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 14px;
          font-size: 0.82rem;
          font-weight: 900;
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
          min-width: 0;
          border: 1px solid #dcdcdc;
          border-radius: 14px;
          padding: 12px;
          font: inherit;
          transition: 0.18s ease;
          background: white;
        }

        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          border-color: #6b1a2c;
          box-shadow: 0 0 0 3px rgba(107, 26, 44, 0.12);
        }

        textarea {
          resize: vertical;
          min-height: 240px;
          line-height: 1.6;
        }

        .recipientBox,
        .recipientBadge {
          background: linear-gradient(135deg, #fff8ec, #fff);
          border: 1px solid #eadfd5;
          border-radius: 18px;
          padding: 18px;
          text-align: center;
          margin: 16px 0;
        }

        .recipientBox b,
        .recipientBadge strong {
          display: block;
          font-size: 1.8rem;
          color: #6b1a2c;
        }

        .recipientBox span,
        .recipientBadge span {
          color: #6b7280;
          font-weight: 800;
        }

        .groups,
        .listPreview,
        .groupBuilder {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .groups small,
        .listPreview small {
          padding: 8px 10px;
          background: #fafafa;
          border-radius: 10px;
          color: #6b7280;
          overflow-wrap: anywhere;
        }

        .composerHead,
        .composerFooter,
        .historyHead {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          margin-bottom: 18px;
        }

        .composerGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .wide {
          grid-column: span 2;
        }

        .composerFooter {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid #ececec;
        }

        .selectedCount {
          color: #6b7280;
          font-weight: 800;
        }

        .selectedCount strong {
          color: #6b1a2c;
        }

        .actions,
        .campaignActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .campaignList {
          display: grid;
          gap: 12px;
        }

        .campaign {
          border: 1px solid #ececec;
          border-radius: 18px;
          padding: 14px;
          display: grid;
          gap: 12px;
          transition: 0.18s ease;
        }

        .campaign.active {
          border-color: #6b1a2c;
          box-shadow: 0 0 0 3px rgba(107, 26, 44, 0.08);
        }

        .campaignOpen {
          background: transparent;
          color: inherit;
          padding: 0;
          text-align: left;
          white-space: normal;
        }

        .campaignOpen:hover {
          transform: none;
          box-shadow: none;
        }

        .campaignOpen strong {
          display: block;
          color: #6b1a2c;
          margin-bottom: 6px;
          overflow-wrap: anywhere;
        }

        .campaignOpen span {
          color: #6b7280;
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .recipients {
          margin-top: 18px;
          border-top: 1px solid #ececec;
          padding-top: 18px;
        }

        .recipientList {
          display: grid;
          gap: 8px;
        }

        .recipientRow {
          border: 1px solid #f0ece5;
          border-radius: 14px;
          padding: 10px;
          display: grid;
          gap: 3px;
          background: #fffdf9;
        }

        .recipientRow strong,
        .recipientRow span,
        .recipientRow small {
          overflow-wrap: anywhere;
        }

        .recipientRow strong {
          color: #6b1a2c;
        }

        .recipientRow span,
        .recipientRow small {
          color: #6b7280;
          font-weight: 800;
        }

        .empty {
          text-align: center;
          padding: 30px;
          color: #9ca3af;
          border: 2px dashed #ececec;
          border-radius: 18px;
        }

        @media (max-width: 1250px) {
          .layout {
            grid-template-columns: 320px minmax(0, 1fr);
          }

          .history {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 900px) {
          .top,
          .layout,
          .overview,
          .composerGrid,
          .composerHead,
          .composerFooter,
          .historyHead {
            grid-template-columns: 1fr;
          }

          .wide {
            grid-column: span 1;
          }

          .actions,
          .campaignActions {
            justify-content: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
