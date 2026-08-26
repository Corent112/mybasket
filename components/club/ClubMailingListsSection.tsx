"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMailingListMembers,
  createMailingList,
  createMessageTemplate,
  deleteMailingList,
  deleteMessageTemplate,
  getMailingWorkspace,
  listMailingListMembers,
  removeMailingListMember,
  updateMessageTemplate,
  type MailingList,
  type MailingListMember,
  type MessageTemplate,
  type RecipientCandidate,
} from "@/lib/club-mailing-lists";

const CATEGORIES = [
  { value: "general", label: "Général" },
  { value: "cotisation", label: "Cotisation" },
  { value: "convocation", label: "Convocation" },
  { value: "document", label: "Document" },
  { value: "licence", label: "Licence" },
  { value: "custom", label: "Personnalisé" },
];

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function candidateTypeLabel(type: RecipientCandidate["type"]) {
  if (type === "parent") return "Parent";
  if (type === "player") return "Joueur";
  if (type === "coach") return "Coach";
  return "Contact";
}

export default function ClubMailingListsSection({ clubId }: { clubId: string }) {
  const [lists, setLists] = useState<MailingList[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [candidates, setCandidates] = useState<RecipientCandidate[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [members, setMembers] = useState<MailingListMember[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateForm, setTemplateForm] = useState<MessageTemplate | null>(null);
  const [showNewList, setShowNewList] = useState(false);
  const [listName, setListName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await getMailingWorkspace(clubId);
      setLists(data.lists);
      setTemplates(data.templates);
      setCandidates(data.candidates);
      setSelectedListId((current) => current || data.lists[0]?.id || "");
    } catch (e: unknown) {
      setError(errorMessage(e, "Impossible de charger les listes."));
    } finally {
      setBusy(false);
    }
  }

  async function loadMembers(listId = selectedListId) {
    if (!listId) {
      setMembers([]);
      return;
    }
    try {
      setMembers(await listMailingListMembers(clubId, listId));
    } catch (e: unknown) {
      setError(errorMessage(e, "Impossible de charger les membres."));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    void loadMembers(selectedListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((item) => {
      if (members.some((member) => member.email.toLowerCase() === item.email.toLowerCase())) return false;
      if (!q) return true;
      return `${item.name} ${item.email} ${item.type} ${item.teamName || ""}`.toLowerCase().includes(q);
    });
  }, [candidates, members, query]);

  const selectedCandidates = filteredCandidates.filter((candidate) => selectedIds.includes(candidate.id));
  const selectedList = lists.find((list) => list.id === selectedListId) || null;

  async function addList() {
    if (!listName.trim()) {
      setError("Nom de liste obligatoire.");
      return;
    }
    setBusy(true);
    try {
      const created = await createMailingList({ clubId, name: listName.trim(), description: "Liste créée depuis MyBasket" });
      setListName("");
      setShowNewList(false);
      await load();
      setSelectedListId(created.id);
      setMessage("Liste créée.");
    } catch (e: unknown) {
      setError(errorMessage(e, "Liste non créée."));
    } finally {
      setBusy(false);
    }
  }

  async function addSelected() {
    if (!selectedListId || !selectedCandidates.length) return;
    setBusy(true);
    try {
      await addMailingListMembers({ clubId, listId: selectedListId, members: selectedCandidates });
      setSelectedIds([]);
      await Promise.all([loadMembers(), load()]);
      setMessage("Contacts ajoutés.");
    } catch (e: unknown) {
      setError(errorMessage(e, "Ajout impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: MailingListMember) {
    if (!window.confirm(`Retirer ${member.displayName} de cette liste ?`)) return;
    try {
      await removeMailingListMember(clubId, member.id);
      await Promise.all([loadMembers(), load()]);
    } catch (e: unknown) {
      setError(errorMessage(e, "Retrait impossible."));
    }
  }

  async function removeList(list: MailingList) {
    if (!window.confirm(`Supprimer la liste « ${list.name} » ?`)) return;
    try {
      await deleteMailingList(clubId, list.id);
      setSelectedListId("");
      await load();
    } catch (e: unknown) {
      setError(errorMessage(e, "Suppression impossible."));
    }
  }

  async function saveTemplate() {
    if (!templateForm) return;
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) {
      setError("Nom, objet et contenu du modèle sont obligatoires.");
      return;
    }
    setBusy(true);
    try {
      if (templateForm.id === "new") {
        await createMessageTemplate({
          clubId,
          name: templateForm.name,
          subject: templateForm.subject,
          body: templateForm.body,
          category: templateForm.category,
        });
      } else {
        await updateMessageTemplate(templateForm.id, {
          name: templateForm.name,
          subject: templateForm.subject,
          body: templateForm.body,
          category: templateForm.category,
        });
      }
      setTemplateForm(null);
      await load();
      setMessage("Modèle enregistré.");
    } catch (e: unknown) {
      setError(errorMessage(e, "Modèle non enregistré."));
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(template: MessageTemplate) {
    if (!window.confirm(`Supprimer le modèle « ${template.name} » ?`)) return;
    try {
      await deleteMessageTemplate(template.id);
      await load();
    } catch (e: unknown) {
      setError(errorMessage(e, "Suppression du modèle impossible."));
    }
  }

  return (
    <section className="mailingV2">
      <header className="sectionHeader">
        <div><p>MAILING</p><h2>Listes & modèles</h2><span>Prépare tes publics une fois, puis réutilise-les dans Communication.</span></div>
        <div className="headerActions"><button className="ghost" onClick={() => setShowNewList(true)}>+ Liste</button><button className="primary" onClick={() => setTemplateForm({ id: "new", clubId, templateKey: "custom", name: "", subject: "", body: "", category: "general", status: "active" })}>+ Modèle</button></div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice ok">{message}</div>}

      <div className="stats"><article><strong>{lists.length}</strong><span>listes</span></article><article><strong>{members.length}</strong><span>contacts dans la liste</span></article><article><strong>{templates.length}</strong><span>modèles</span></article><article><strong>{candidates.length}</strong><span>contacts disponibles</span></article></div>

      <div className="mainGrid">
        <aside className="listsPanel panel">
          <div className="panelHead"><div><small>LISTES</small><h3>Mes publics</h3></div></div>
          <div className="listButtons">
            {lists.map((list) => <button key={list.id} className={selectedListId === list.id ? "listButton active" : "listButton"} onClick={() => setSelectedListId(list.id)}><span><strong>{list.name}</strong><small>{list.description || "Liste mailing"}</small></span><b>{list.membersCount || 0}</b></button>)}
            {!lists.length && <div className="emptySmall">Aucune liste. Crée par exemple « Parents U11 » ou « Staff ».</div>}
          </div>
        </aside>

        <main className="membersPanel panel">
          <div className="panelHead"><div><small>CONTACTS</small><h3>{selectedList?.name || "Sélectionne une liste"}</h3></div>{selectedList && <button className="danger" onClick={() => removeList(selectedList)}>Supprimer la liste</button>}</div>
          <div className="memberRows">
            {members.map((member) => <article key={member.id}><div className="avatar">{member.displayName.slice(0, 2).toUpperCase()}</div><div className="memberInfo"><strong>{member.displayName}</strong><span>{member.email}</span><small>{member.memberType}</small></div><button className="remove" onClick={() => removeMember(member)}>Retirer</button></article>)}
            {selectedList && !members.length && <div className="emptySmall">Cette liste est vide.</div>}
          </div>
        </main>

        <aside className="addPanel panel">
          <div className="panelHead"><div><small>AJOUTER</small><h3>Depuis la base club</h3></div></div>
          <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, email, équipe..." />
          <div className="candidateList">
            {filteredCandidates.slice(0, 30).map((candidate) => <label key={candidate.id} className={selectedIds.includes(candidate.id) ? "candidate selected" : "candidate"}><input type="checkbox" checked={selectedIds.includes(candidate.id)} onChange={() => setSelectedIds((prev) => prev.includes(candidate.id) ? prev.filter((id) => id !== candidate.id) : [...prev, candidate.id])} /><span><strong>{candidate.name}</strong><small>{candidate.email}</small><em>{candidateTypeLabel(candidate.type)}{candidate.teamName ? ` · ${candidate.teamName}` : ""}</em></span></label>)}
          </div>
          <button className="primary full" disabled={!selectedListId || !selectedCandidates.length || busy} onClick={addSelected}>Ajouter {selectedCandidates.length || ""} à la liste</button>
        </aside>
      </div>

      <section className="templatesPanel panel">
        <div className="panelHead"><div><small>MODÈLES</small><h3>Messages enregistrés</h3></div><button className="primary" onClick={() => setTemplateForm({ id: "new", clubId, templateKey: "custom", name: "", subject: "", body: "", category: "general", status: "active" })}>+ Nouveau modèle</button></div>
        <div className="templateGrid">
          {templates.map((template) => <article key={template.id}><div className="templateTop"><span>{CATEGORIES.find((item) => item.value === template.category)?.label || template.category}</span></div><strong>{template.name}</strong><p>{template.subject}</p><div className="templateActions"><button onClick={() => setTemplateForm(template)}>Modifier</button><button className="danger" onClick={() => removeTemplate(template)}>Supprimer</button></div></article>)}
          {!templates.length && <div className="emptySmall">Aucun modèle personnalisé. Les modèles rapides restent disponibles dans Communication.</div>}
        </div>
      </section>

      {showNewList && <div className="modalLayer" onClick={() => setShowNewList(false)}><div className="smallModal" onClick={(e) => e.stopPropagation()}><h3>Nouvelle liste</h3><label>Nom<input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Parents U11..." /></label><div className="modalActions"><button className="ghost" onClick={() => setShowNewList(false)}>Annuler</button><button className="primary" disabled={busy} onClick={addList}>Créer</button></div></div></div>}

      {templateForm && <div className="modalLayer" onClick={() => setTemplateForm(null)}><div className="templateModal" onClick={(e) => e.stopPropagation()}><div className="modalTitle"><div><small>MODÈLE EMAIL</small><h3>{templateForm.id === "new" ? "Nouveau modèle" : "Modifier le modèle"}</h3></div><button onClick={() => setTemplateForm(null)}>×</button></div><div className="formGrid"><label>Nom<input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></label><label>Catégorie<select value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label></div><label>Objet<input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} /></label><label>Message<textarea value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} /></label><div className="modalActions"><button className="ghost" onClick={() => setTemplateForm(null)}>Annuler</button><button className="primary" disabled={busy} onClick={saveTemplate}>Enregistrer</button></div></div></div>}

      <style jsx>{`
        .mailingV2{display:grid;gap:16px;min-width:0}.sectionHeader{display:flex;justify-content:space-between;gap:18px;align-items:center;background:#fff;border:1px solid #e7e0d9;border-radius:16px;padding:20px}.sectionHeader p,.panelHead small,.modalTitle small{margin:0;color:var(--club-secondary);font-size:.68rem;letter-spacing:.13em;font-weight:1000}.sectionHeader h2,.panelHead h3,.modalTitle h3{margin:4px 0}.sectionHeader span{color:#6b7280;font-weight:700}.headerActions{display:flex;gap:8px}.primary{border:0;background:var(--club-secondary);color:#fff;border-radius:10px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{border:1px solid #e7e0d9;background:#fff;border-radius:10px;padding:10px 14px;font-weight:850;cursor:pointer}.notice{padding:11px 13px;border-radius:10px;font-weight:850}.error{background:#fff1f0;color:#b42318}.ok{background:#effaf2;color:#18864b}
        .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.stats article{min-width:0;background:#fff;border:1px solid #e7e0d9;border-radius:13px;padding:14px}.stats strong{font-size:1.55rem;color:var(--club-secondary)}.stats span{display:block;color:#777;font-size:.72rem;font-weight:800;margin-top:3px}.mainGrid{display:grid;grid-template-columns:minmax(220px,.72fr) minmax(300px,1.25fr) minmax(280px,1fr);gap:14px;align-items:start;min-width:0}.panel{min-width:0;background:#fff;border:1px solid #e7e0d9;border-radius:16px;padding:16px}.panelHead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.listButtons{display:grid;gap:7px}.listButton{width:100%;min-width:0;border:1px solid #ebe5df;background:#fff;border-radius:11px;padding:11px;display:flex;justify-content:space-between;gap:10px;text-align:left;cursor:pointer}.listButton span{min-width:0}.listButton strong,.listButton small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.listButton small{color:#888;margin-top:3px}.listButton b{width:30px;height:30px;border-radius:50%;background:#f3eee9;display:grid;place-items:center;flex:0 0 auto}.listButton.active{border-color:var(--club-secondary);background:color-mix(in srgb,var(--club-secondary) 7%,white)}.listButton.active b{background:var(--club-secondary);color:#fff}
        .memberRows{display:grid}.memberRows article{min-width:0;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 0;border-bottom:1px solid #f1ece8}.avatar{width:38px;height:38px;border-radius:50%;background:var(--club-primary);color:var(--club-secondary);display:grid;place-items:center;font-size:.7rem;font-weight:1000}.memberInfo{min-width:0}.memberInfo strong,.memberInfo span,.memberInfo small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.memberInfo span{font-size:.7rem;color:#666}.memberInfo small{font-size:.62rem;color:#999}.remove,.danger{border:1px solid #f0cbc6;background:#fff4f2;color:#b42318;border-radius:8px;padding:7px 8px;font-weight:850;cursor:pointer}.search,.templateModal input,.templateModal select,.templateModal textarea,.smallModal input{width:100%;min-width:0;border:1px solid #e1ddd8;border-radius:9px;padding:10px 11px}.candidateList{max-height:390px;overflow:auto;display:grid;gap:5px;margin:10px 0}.candidate{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;border:1px solid #eee8e3;border-radius:9px;padding:8px;cursor:pointer}.candidate input{margin-top:3px}.candidate span{min-width:0}.candidate strong,.candidate small,.candidate em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.candidate small{font-size:.66rem;color:#777}.candidate em{font-style:normal;font-size:.61rem;color:#a07923}.candidate.selected{background:color-mix(in srgb,var(--club-secondary) 7%,white);border-color:var(--club-secondary)}.full{width:100%}
        .templatesPanel{padding:0;overflow:hidden}.templatesPanel>.panelHead{padding:16px;margin:0;border-bottom:1px solid #eee}.templateGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px}.templateGrid article{min-width:0;border:1px solid #e7e0d9;border-radius:12px;padding:13px}.templateTop span{font-size:.61rem;background:color-mix(in srgb,var(--club-secondary) 10%,white);color:#8a681d;padding:5px 7px;border-radius:999px;font-weight:900}.templateGrid strong{display:block;margin-top:12px;overflow-wrap:anywhere}.templateGrid p{font-size:.7rem;color:#777;overflow-wrap:anywhere}.templateActions{display:flex;gap:6px;margin-top:10px}.templateActions button{border:1px solid #e7e0d9;background:#fff;border-radius:8px;padding:7px 9px;font-weight:850;cursor:pointer}.templateActions .danger{background:#fff4f2}.emptySmall{padding:22px;text-align:center;color:#888;font-size:.75rem;overflow-wrap:anywhere}
        .modalLayer{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:grid;place-items:center;padding:16px}.smallModal,.templateModal{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:19px}.smallModal{width:min(440px,100%)}.smallModal label,.templateModal label{display:grid;gap:6px;margin-top:12px;font-size:.76rem;color:#6b7280;font-weight:850}.templateModal textarea{min-height:240px;resize:vertical;line-height:1.5}.modalTitle{display:flex;justify-content:space-between;gap:10px}.modalTitle button{border:0;background:#f2eee9;border-radius:50%;width:34px;height:34px;font-size:1.1rem}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.modalActions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
        @media(max-width:1200px){.mainGrid{grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr)}.addPanel{grid-column:1/-1}.candidateList{grid-template-columns:repeat(2,minmax(0,1fr));max-height:260px}.templateGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:780px){.mainGrid{grid-template-columns:1fr}.addPanel{grid-column:auto}.candidateList{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.sectionHeader{align-items:flex-start}.templateGrid{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.sectionHeader{display:grid}.headerActions{display:grid;grid-template-columns:1fr 1fr}.headerActions button{width:100%}.stats,.templateGrid{grid-template-columns:1fr}.formGrid{grid-template-columns:1fr}.modalActions{display:grid}.modalActions button{width:100%}.memberRows article{grid-template-columns:38px minmax(0,1fr)}.memberRows .remove{grid-column:1/-1;width:100%}}
      `}</style>
    </section>
  );
}
