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
  { value: "parents", label: "Parents" },
  { value: "players", label: "Joueurs" },
  { value: "coaches", label: "Coachs" },
] as const;

const QUICK_TEMPLATES = [
  {
    key: "licence",
    icon: "🪪",
    name: "Licence à finaliser",
    subject: "Licence à finaliser – {club}",
    body: "Bonjour,\n\nLe dossier de licence n’est pas encore complet. Merci de vérifier les éléments manquants afin que nous puissions finaliser l’inscription.\n\nSportivement,\n{club}",
  },
  {
    key: "cotisation",
    icon: "💳",
    name: "Relance cotisation",
    subject: "Cotisation – règlement en attente",
    body: "Bonjour,\n\nSauf erreur de notre part, une partie de la cotisation reste à régler. Merci de régulariser la situation ou de nous contacter si nécessaire.\n\nMerci,\n{club}",
  },
  {
    key: "document",
    icon: "📄",
    name: "Document manquant",
    subject: "Document manquant – dossier club",
    body: "Bonjour,\n\nUn document est encore manquant dans le dossier. Merci de nous le transmettre dès que possible.\n\nBien cordialement,\n{club}",
  },
  {
    key: "convocation",
    icon: "📣",
    name: "Convocation",
    subject: "Convocation – {club}",
    body: "Bonjour,\n\nVous êtes convoqué(e) pour le prochain événement de votre équipe. Retrouvez les informations pratiques dans votre espace MyBasket ou contactez le club si nécessaire.\n\nMerci de confirmer votre présence.\n\n{club}",
  },
  {
    key: "horaire",
    icon: "🕒",
    name: "Changement d’horaire",
    subject: "Modification d’horaire – {club}",
    body: "Bonjour,\n\nAttention, un changement d’horaire ou de lieu concerne votre équipe. Merci de consulter le calendrier du club pour les informations à jour.\n\n{club}",
  },
  {
    key: "general",
    icon: "✉️",
    name: "Information générale",
    subject: "Information {club}",
    body: "Bonjour,\n\nNous souhaitons vous transmettre l’information suivante :\n\n[Votre message]\n\nSportivement,\n{club}",
  },
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

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function replaceClub(text: string, clubName: string) {
  return text.split("{club}").join(clubName);
}

function statusLabel(status: string) {
  if (status === "draft") return "Brouillon";
  if (status === "sent") return "Envoyé";
  if (status === "sent_with_errors") return "Envoyé avec erreurs";
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
  const [filters, setFilters] = useState<CommunicationFilters>(emptyFilters());
  const [groupName, setGroupName] = useState("");
  const [title, setTitle] = useState("Information club");
  const [subject, setSubject] = useState(`Information ${clubName}`);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

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
    } catch (e: unknown) {
      setError(errorMessage(e, "Communication impossible à charger."));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    setRecipients(resolveRecipients({ filters, players, coaches }));
  }, [filters, players, coaches]);

  useEffect(() => {
    async function loadCampaignRecipients() {
      if (!selectedCampaignId) {
        setCampaignRecipients([]);
        return;
      }
      try {
        setCampaignRecipients(await listCampaignRecipients(clubId, selectedCampaignId));
      } catch {
        setCampaignRecipients([]);
      }
    }
    void loadCampaignRecipients();
  }, [clubId, selectedCampaignId]);

  useEffect(() => {
    async function loadList() {
      if (!selectedListId) {
        setListMembers([]);
        setManualRecipients([]);
        return;
      }
      try {
        const rows = await listMailingListMembers(clubId, selectedListId);
        setListMembers(rows);
        setManualRecipients(
          rows.map((row) => ({
            type: row.memberType === "coach" ? "coach" : row.memberType === "player" ? "player" : "parent",
            playerId: row.playerId,
            coachId: row.coachId,
            userId: row.userId,
            name: row.displayName,
            email: row.email,
          })),
        );
      } catch {
        setListMembers([]);
        setManualRecipients([]);
      }
    }
    void loadList();
  }, [clubId, selectedListId]);

  const categories = useMemo(
    () => Array.from(new Set(players.map((player) => player.category).filter(Boolean))),
    [players],
  );
  const finalRecipients = selectedListId ? manualRecipients : recipients;
  const validRecipients = finalRecipients.filter((recipient) => Boolean(recipient.email));
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;

  function resetComposer() {
    setEditingCampaignId(null);
    setSelectedCampaignId("");
    setSelectedListId("");
    setTemplateId("");
    setFilters(emptyFilters());
    setTitle("Information club");
    setSubject(`Information ${clubName}`);
    setBody("");
    setMessage("");
    setError("");
  }

  function applyDatabaseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTitle(template.name);
    setSubject(replaceClub(template.subject, clubName));
    setBody(replaceClub(template.body, clubName));
  }

  function applyQuickTemplate(template: (typeof QUICK_TEMPLATES)[number]) {
    setTemplateId("");
    setTitle(template.name);
    setSubject(replaceClub(template.subject, clubName));
    setBody(replaceClub(template.body, clubName));
  }

  async function saveGroup() {
    if (!groupName.trim()) {
      setError("Nom du groupe obligatoire.");
      return;
    }
    try {
      const group = await createCommunicationGroupPro({
        clubId,
        name: groupName.trim(),
        description: "Groupe dynamique MyBasket",
        filters,
      });
      setGroups((prev) => [group, ...prev]);
      setGroupName("");
      setMessage("Groupe enregistré.");
    } catch (e: unknown) {
      setError(errorMessage(e, "Groupe non créé."));
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
        const updated = await updateCommunicationCampaign({ ...payload, campaignId: editingCampaignId });
        setSelectedCampaignId(updated.id);
        setMessage("Brouillon mis à jour.");
      } else {
        const created = await createCommunicationCampaign(payload);
        setEditingCampaignId(created.id);
        setSelectedCampaignId(created.id);
        setMessage("Brouillon enregistré.");
      }
      await load();
    } catch (e: unknown) {
      setError(errorMessage(e, "Campagne non sauvegardée."));
    }
  }

  function editCampaign(campaign: CommunicationCampaign) {
    setEditingCampaignId(campaign.id);
    setSelectedCampaignId(campaign.id);
    setTitle(campaign.title || "Information club");
    setSubject(campaign.subject || "");
    setBody(campaign.body || "");
    const campaignFilters = campaign.filters || emptyFilters();
    if (campaignFilters.mailingListId) {
      setSelectedListId(String(campaignFilters.mailingListId));
    } else {
      setSelectedListId("");
      setFilters(campaignFilters);
    }
  }

  async function removeCampaign(campaign: CommunicationCampaign) {
    if (!window.confirm(`Supprimer la campagne « ${campaign.title} » ?`)) return;
    try {
      await deleteCommunicationCampaign(clubId, campaign.id);
      if (selectedCampaignId === campaign.id) setSelectedCampaignId("");
      if (editingCampaignId === campaign.id) resetComposer();
      await load();
      setMessage("Campagne supprimée.");
    } catch (e: unknown) {
      setError(errorMessage(e, "Suppression impossible."));
    }
  }

  async function sendCampaign(campaign: CommunicationCampaign) {
    if (!window.confirm(`Envoyer « ${campaign.title} » à ${campaign.recipientsCount} destinataire(s) ?`)) return;
    setSending(true);
    setError("");
    try {
      await sendCommunicationCampaign(campaign.id);
      await load();
      setSelectedCampaignId(campaign.id);
      setMessage("Campagne envoyée.");
    } catch (e: unknown) {
      setError(errorMessage(e, "Envoi impossible."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="communicationV2">
      <header className="sectionHeader">
        <div>
          <p>COMMUNICATION</p>
          <h2>Messages du club</h2>
          <span>Cible les bonnes personnes, utilise un modèle, vérifie l’aperçu puis envoie.</span>
        </div>
        <button className="primary" type="button" onClick={resetComposer}>+ Nouveau message</button>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice ok">{message}</div>}

      <div className="quickTemplates">
        {QUICK_TEMPLATES.map((template) => (
          <button key={template.key} type="button" onClick={() => applyQuickTemplate(template)}>
            <span>{template.icon}</span><b>{template.name}</b>
          </button>
        ))}
      </div>

      <div className="workspaceGrid">
        <aside className="targetPanel panel">
          <div className="panelTitle"><small>ÉTAPE 1</small><h3>Destinataires</h3></div>
          <label>Liste mailing
            <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}>
              <option value="">Ciblage dynamique</option>
              {mailingLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </label>

          {!selectedListId && <>
            <label>Public
              <select value={filters.target} onChange={(e) => setFilters({ ...filters, target: e.target.value as CommunicationFilters["target"] })}>
                {TARGETS.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
              </select>
            </label>
            <label>Équipe
              <select value={filters.teamId || ""} onChange={(e) => setFilters({ ...filters, teamId: e.target.value || null })}>
                <option value="">Tout le club</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>Catégorie
              <select value={filters.category || ""} onChange={(e) => setFilters({ ...filters, category: e.target.value || null })}>
                <option value="">Toutes</option>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label>Licence
              <select value={filters.licenseStatus || ""} onChange={(e) => setFilters({ ...filters, licenseStatus: e.target.value || null })}>
                <option value="">Toutes</option>
                <option value="valid">Validée</option>
                <option value="pending">En attente</option>
                <option value="missing">Manquante</option>
              </select>
            </label>
            <label className="checkLine">
              <input type="checkbox" checked={Boolean(filters.medicalOnly)} onChange={(e) => setFilters({ ...filters, medicalOnly: e.target.checked })} />
              Dossier médical signalé
            </label>
          </>}

          <div className="recipientCount"><strong>{finalRecipients.length}</strong><span>destinataires</span><small>{validRecipients.length} avec email</small></div>
          <div className="recipientPreview">
            {(selectedListId ? listMembers.map((item) => ({ name: item.displayName, email: item.email })) : finalRecipients).slice(0, 7).map((item, index) => (
              <div key={`${item.email || item.name}-${index}`}><span>{item.name}</span><small>{item.email || "Email manquant"}</small></div>
            ))}
            {finalRecipients.length > 7 && <em>+ {finalRecipients.length - 7} autres</em>}
          </div>

          {!selectedListId && <div className="saveTarget"><input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nom du groupe..." /><button type="button" onClick={saveGroup}>Enregistrer le ciblage</button></div>}
          {groups.length > 0 && <div className="savedGroups"><small>Ciblages enregistrés</small>{groups.slice(0, 5).map((group) => <button key={group.id} type="button" onClick={() => setFilters(group.filters)}>{group.name}</button>)}</div>}
        </aside>

        <main className="composer panel">
          <div className="panelTitle"><small>ÉTAPE 2</small><h3>Rédiger le message</h3></div>
          {templates.length > 0 && <label>Mes modèles enregistrés
            <select value={templateId} onChange={(e) => applyDatabaseTemplate(e.target.value)}>
              <option value="">Choisir un modèle...</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>}
          <label>Nom interne<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Objet de l’email<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écris ton message..." /></label>
          <div className="composerActions">
            <button className="ghost" type="button" onClick={resetComposer}>Réinitialiser</button>
            <button className="primary" type="button" onClick={saveCampaign}>{editingCampaignId ? "Mettre à jour le brouillon" : "Enregistrer le brouillon"}</button>
          </div>
        </main>

        <aside className="previewPanel panel">
          <div className="panelTitle"><small>ÉTAPE 3</small><h3>Aperçu du mail</h3></div>
          <div className="mailPreview">
            <div className="mailHeader"><div className="logoFallback">{clubName.slice(0, 2).toUpperCase()}</div><strong>{clubName}</strong></div>
            <div className="goldLine" />
            <div className="mailBody"><small>{clubName.toUpperCase()}</small><h4>{subject || "Objet de l’email"}</h4><p>Bonjour,</p><div>{body || "Ton message apparaîtra ici."}</div></div>
            <div className="mailFooter">Message envoyé par {clubName} via MyBasket</div>
          </div>
          <div className="sendSummary"><span>{validRecipients.length} email(s) prêt(s)</span><span>{finalRecipients.length - validRecipients.length} sans email</span></div>
          {selectedCampaign && selectedCampaign.status === "draft" && <button className="sendBtn" disabled={sending} type="button" onClick={() => sendCampaign(selectedCampaign)}>{sending ? "Envoi..." : `Envoyer à ${selectedCampaign.recipientsCount} destinataire(s)`}</button>}
        </aside>
      </div>

      <section className="history panel">
        <div className="historyHead"><div><small>HISTORIQUE</small><h3>Campagnes</h3></div><span>{campaigns.length} campagne(s)</span></div>
        <div className="campaignRows">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className={selectedCampaignId === campaign.id ? "campaignRow selected" : "campaignRow"}>
              <div className="campaignMain"><strong>{campaign.title}</strong><span>{campaign.subject}</span><small>{campaign.recipientsCount} destinataire(s) · {statusLabel(campaign.status)}</small></div>
              <div className="statusPill">{campaign.sentCount}/{campaign.recipientsCount}</div>
              <div className="rowActions">
                <button type="button" onClick={() => { setSelectedCampaignId(campaign.id); editCampaign(campaign); }}>Modifier</button>
                {campaign.status === "draft" && <button className="sendSmall" disabled={sending} type="button" onClick={() => sendCampaign(campaign)}>Envoyer</button>}
                <button className="danger" type="button" onClick={() => removeCampaign(campaign)}>Supprimer</button>
              </div>
            </article>
          ))}
          {!campaigns.length && <div className="empty">Aucune campagne pour le moment.</div>}
        </div>
        {campaignRecipients.length > 0 && <div className="deliveryDetails"><strong>Détail de la campagne sélectionnée</strong><div>{campaignRecipients.slice(0, 12).map((recipient) => <span key={recipient.id}>{recipient.name} · {recipient.status}</span>)}</div></div>}
      </section>

      <style jsx>{`
        .communicationV2{display:grid;gap:16px;min-width:0}.sectionHeader{display:flex;justify-content:space-between;gap:18px;align-items:center;background:#fff;border:1px solid #e7e0d9;border-radius:16px;padding:20px}.sectionHeader p,.panelTitle small,.historyHead small{margin:0;color:var(--club-secondary);font-size:.68rem;letter-spacing:.13em;font-weight:1000}.sectionHeader h2,.panelTitle h3,.historyHead h3{margin:4px 0}.sectionHeader span{color:#6b7280;font-weight:700}.primary,.sendBtn{border:0;background:var(--club-secondary);color:#fff;border-radius:10px;padding:11px 15px;font-weight:900;cursor:pointer}.notice{padding:11px 13px;border-radius:10px;font-weight:850}.notice.error{background:#fff1f0;color:#b42318}.notice.ok{background:#effaf2;color:#18864b}
        .quickTemplates{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;min-width:0}.quickTemplates button{min-width:0;border:1px solid #e7e0d9;background:#fff;border-radius:13px;padding:12px 9px;display:grid;gap:5px;place-items:center;text-align:center;cursor:pointer}.quickTemplates span{font-size:1.25rem}.quickTemplates b{font-size:.72rem;overflow-wrap:anywhere}
        .workspaceGrid{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(320px,1.2fr) minmax(280px,1fr);gap:14px;align-items:start;min-width:0}.panel{min-width:0;background:#fff;border:1px solid #e7e0d9;border-radius:16px;padding:17px}.panelTitle{margin-bottom:14px}.panel label{display:grid;gap:6px;margin-bottom:11px;color:#6b7280;font-weight:850;font-size:.76rem}.panel input,.panel select,.panel textarea{width:100%;min-width:0;border:1px solid #e1ddd8;border-radius:9px;padding:10px 11px;background:#fff;font:inherit}.panel textarea{min-height:250px;resize:vertical;line-height:1.55}.checkLine{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:8px!important}.checkLine input{width:auto!important}.recipientCount{border-radius:13px;background:color-mix(in srgb,var(--club-secondary) 10%,white);padding:13px;display:grid;grid-template-columns:auto 1fr;gap:0 8px}.recipientCount strong{grid-row:1/3;font-size:2rem;color:var(--club-secondary)}.recipientCount span{font-weight:900}.recipientCount small{color:#777}.recipientPreview{display:grid;gap:5px;margin-top:12px;max-height:190px;overflow:auto}.recipientPreview div{min-width:0;border-bottom:1px solid #f1ede9;padding:6px 0}.recipientPreview span,.recipientPreview small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recipientPreview span{font-size:.76rem;font-weight:850}.recipientPreview small{font-size:.66rem;color:#888}.recipientPreview em{font-size:.7rem;color:#777}.saveTarget{display:grid;gap:7px;margin-top:12px}.saveTarget button,.savedGroups button{border:1px solid #e7e0d9;background:#fff;border-radius:8px;padding:8px;font-weight:850;cursor:pointer}.savedGroups{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.savedGroups small{width:100%;color:#777}.savedGroups button{font-size:.68rem}.composerActions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.ghost{border:1px solid #e7e0d9;background:#fff;border-radius:10px;padding:10px 13px;font-weight:850;cursor:pointer}
        .mailPreview{border:1px solid #ddd6cf;border-radius:15px;overflow:hidden;background:#f6f2ed}.mailHeader{background:var(--club-primary);padding:18px;display:flex;gap:10px;align-items:center;color:#fff;min-height:74px}.logoFallback{width:42px;height:42px;border-radius:50%;background:#fff;color:var(--club-primary);display:grid;place-items:center;font-weight:1000}.mailHeader strong{overflow-wrap:anywhere}.goldLine{height:4px;background:var(--club-secondary)}.mailBody{background:#fff;padding:20px;min-height:275px}.mailBody small{color:var(--club-secondary);font-weight:900;letter-spacing:.1em}.mailBody h4{margin:6px 0 16px;color:var(--club-primary);font-size:1.05rem;overflow-wrap:anywhere}.mailBody p{font-size:.78rem}.mailBody div{font-size:.75rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.mailFooter{text-align:center;padding:10px;font-size:.59rem;color:#888}.sendSummary{display:flex;justify-content:space-between;gap:8px;font-size:.68rem;color:#777;margin:10px 0}.sendBtn{width:100%}
        .history{padding:0;overflow:hidden}.historyHead{padding:16px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee}.historyHead span{font-size:.72rem;color:#777}.campaignRows{display:grid}.campaignRow{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid #f0ece8}.campaignRow.selected{background:color-mix(in srgb,var(--club-secondary) 6%,white)}.campaignMain{min-width:0}.campaignMain strong,.campaignMain span,.campaignMain small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.campaignMain span{font-size:.75rem;color:#555;margin-top:2px}.campaignMain small{font-size:.66rem;color:#888;margin-top:4px}.statusPill{background:#f5f1ed;border-radius:999px;padding:7px 9px;font-size:.69rem;font-weight:900}.rowActions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.rowActions button{border:1px solid #e7e0d9;background:#fff;border-radius:8px;padding:7px 9px;font-weight:850;cursor:pointer;font-size:.7rem}.rowActions .sendSmall{background:var(--club-secondary);border-color:var(--club-secondary);color:#fff}.rowActions .danger{color:#b42318;background:#fff3f2;border-color:#f2cbc6}.deliveryDetails{padding:14px 18px}.deliveryDetails>div{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.deliveryDetails span{font-size:.65rem;background:#f5f1ed;padding:5px 7px;border-radius:999px}.empty{padding:28px;text-align:center;color:#888;font-weight:800}
        @media(max-width:1220px){.quickTemplates{grid-template-columns:repeat(3,minmax(0,1fr))}.workspaceGrid{grid-template-columns:minmax(230px,.8fr) minmax(0,1.4fr)}.previewPanel{grid-column:1/-1}.mailPreview{max-width:680px;margin:auto}.sendBtn{max-width:680px;display:block;margin:10px auto 0}}
        @media(max-width:800px){.workspaceGrid{grid-template-columns:1fr}.previewPanel{grid-column:auto}.quickTemplates{grid-template-columns:repeat(2,minmax(0,1fr))}.campaignRow{grid-template-columns:minmax(0,1fr) auto}.rowActions{grid-column:1/-1;justify-content:flex-start}.sectionHeader{align-items:flex-start}.sectionHeader .primary{flex:0 0 auto}}
        @media(max-width:520px){.sectionHeader{display:grid}.sectionHeader .primary{width:100%}.quickTemplates{grid-template-columns:1fr 1fr}.campaignRow{grid-template-columns:1fr}.statusPill{width:max-content}.composerActions{display:grid}.composerActions button{width:100%}.sendSummary{display:grid}.panel{padding:14px}}
      `}</style>
    </section>
  );
}
