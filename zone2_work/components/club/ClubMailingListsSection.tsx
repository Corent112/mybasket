"use client";

// components/club/ClubMailingListsSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  addMailingListMembers,
  createMailingList,
  createMessageTemplate,
  deleteMailingList,
  getMailingWorkspace,
  listMailingListMembers,
  removeMailingListMember,
  updateMessageTemplate,
  type MailingList,
  type MailingListMember,
  type MessageTemplate,
  type RecipientCandidate,
} from "@/lib/club-mailing-lists";

const CATEGORIES = ["general", "cotisation", "convocation", "document", "licence", "custom"];

export default function ClubMailingListsSection({ clubId }: { clubId: string }) {
  const [lists, setLists] = useState<MailingList[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [candidates, setCandidates] = useState<RecipientCandidate[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [members, setMembers] = useState<MailingListMember[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateForm, setTemplateForm] = useState<MessageTemplate | null>(null);
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
      if (!selectedListId && data.lists[0]) setSelectedListId(data.lists[0].id);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les listes.");
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
      const rows = await listMailingListMembers(clubId, listId);
      setMembers(rows);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les membres.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    loadMembers(selectedListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((item) => {
      const already = members.some((member) => member.email === item.email);
      if (already) return false;
      if (!q) return true;
      return `${item.name} ${item.email} ${item.type} ${item.teamName || ""}`.toLowerCase().includes(q);
    });
  }, [candidates, members, query]);

  const selectedCandidates = filteredCandidates.filter((candidate) => selectedIds.includes(candidate.id));

  async function addList() {
    if (!listName.trim()) {
      setError("Nom de liste obligatoire.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const created = await createMailingList({
        clubId,
        name: listName.trim(),
        description: "Liste créée depuis MyBasket",
      });
      setLists((prev) => [...prev, created]);
      setSelectedListId(created.id);
      setListName("");
      setMessage("Liste créée.");
    } catch (e: any) {
      setError(e?.message || "Liste non créée.");
    } finally {
      setBusy(false);
    }
  }

  async function addSelected() {
    if (!selectedListId || !selectedCandidates.length) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await addMailingListMembers({
        clubId,
        listId: selectedListId,
        members: selectedCandidates,
      });
      setSelectedIds([]);
      await loadMembers();
      await load();
      setMessage("Personnes ajoutées à la liste.");
    } catch (e: any) {
      setError(e?.message || "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: MailingListMember) {
    if (!confirm(`Retirer ${member.displayName} de cette liste ?`)) return;
    await removeMailingListMember(clubId, member.id);
    await loadMembers();
    await load();
  }

  async function removeList(list: MailingList) {
    if (!confirm(`Supprimer la liste "${list.name}" ?`)) return;
    await deleteMailingList(clubId, list.id);
    setSelectedListId("");
    await load();
  }

  async function saveTemplate() {
    if (!templateForm) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (templateForm.id === "new") {
        const created = await createMessageTemplate({
          clubId,
          name: templateForm.name,
          subject: templateForm.subject,
          body: templateForm.body,
          category: templateForm.category,
        });
        setTemplates((prev) => [...prev, created]);
      } else {
        const updated = await updateMessageTemplate(templateForm.id, {
          name: templateForm.name,
          subject: templateForm.subject,
          body: templateForm.body,
          category: templateForm.category,
        });
        setTemplates((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      }
      setTemplateForm(null);
      setMessage("Modèle enregistré.");
    } catch (e: any) {
      setError(e?.message || "Modèle non enregistré.");
    } finally {
      setBusy(false);
    }
  }

  const selectedList = lists.find((list) => list.id === selectedListId) || null;

  return (
    <section className="mailing">
      <header className="top">
        <div>
          <p>COMMUNICATION</p>
          <h2>Listes & modèles</h2>
          <span>Crée des mailings : comité directeur, parents U15, staff, bureau, partenaires...</span>
        </div>
        <button onClick={() => setTemplateForm({ id: "new", clubId, templateKey: "custom", name: "", subject: "", body: "", category: "general", status: "active" })}>
          + Modèle
        </button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="lists">
          <div className="newList">
            <input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Comité directeur..." />
            <button onClick={addList} disabled={busy}>Créer</button>
          </div>

          {lists.map((list) => (
            <button
              key={list.id}
              className={selectedListId === list.id ? "listBtn active" : "listBtn"}
              onClick={() => setSelectedListId(list.id)}
            >
              <strong>{list.name}</strong>
              <span>{list.membersCount || 0} contacts</span>
            </button>
          ))}
        </aside>

        <main className="main">
          <section className="panel">
            <div className="panelHead">
              <div>
                <h3>{selectedList?.name || "Aucune liste sélectionnée"}</h3>
                <p>Ajoute les personnes depuis ta base club.</p>
              </div>
              {selectedList && <button className="danger" onClick={() => removeList(selectedList)}>Supprimer liste</button>}
            </div>

            <div className="members">
              {members.map((member) => (
                <article className="member" key={member.id}>
                  <div>
                    <strong>{member.displayName}</strong>
                    <span>{member.email} · {member.memberType}</span>
                  </div>
                  <button className="danger ghostDanger" onClick={() => removeMember(member)}>Retirer</button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelHead">
              <div>
                <h3>Ajouter depuis la base</h3>
                <p>Joueurs, parents et coachs avec email.</p>
              </div>
              <button disabled={!selectedCandidates.length || !selectedListId} onClick={addSelected}>
                Ajouter {selectedCandidates.length || ""}
              </button>
            </div>

            <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher joueur, parent, coach, équipe..." />

            <div className="candidates">
              {filteredCandidates.map((candidate) => (
                <label className="candidate" key={candidate.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(candidate.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) => e.target.checked
                        ? [...prev, candidate.id]
                        : prev.filter((id) => id !== candidate.id)
                      );
                    }}
                  />
                  <div>
                    <strong>{candidate.name}</strong>
                    <span>{candidate.email} · {candidate.type}{candidate.teamName ? ` · ${candidate.teamName}` : ""}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelHead">
              <div>
                <h3>Messages types</h3>
                <p>Ces modèles serviront aussi dans Relances.</p>
              </div>
            </div>

            <div className="templates">
              {templates.map((template) => (
                <article className="template" key={template.id}>
                  <div>
                    <strong>{template.name}</strong>
                    <span>{template.category} · {template.subject}</span>
                  </div>
                  <button className="ghost" onClick={() => setTemplateForm(template)}>Modifier</button>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      {templateForm && (
        <div className="modalLayer" onClick={() => setTemplateForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{templateForm.id === "new" ? "Créer un modèle" : "Modifier le modèle"}</h3>
            <label>Nom<input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></label>
            <label>Catégorie<select value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}>{CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></label>
            <label>Sujet<input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} /></label>
            <label>Message<textarea value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} /></label>
            <div className="hint">Variables possibles : {"{prenom} {joueur} {club} {reste} {event} {date} {heure} {lieu}"}</div>
            <div className="modalActions">
              <button className="ghost" onClick={() => setTemplateForm(null)}>Annuler</button>
              <button onClick={saveTemplate}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .mailing{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}.danger,.ghostDanger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}button:disabled{opacity:.5;cursor:not-allowed}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:300px 1fr;min-height:720px}.lists{border-right:1px solid #eef2f7;background:#fffdf8;padding:16px;display:grid;gap:10px;align-content:start}.newList{display:grid;grid-template-columns:1fr auto;gap:8px}.listBtn{text-align:left;background:#fff;color:#111827;border-radius:18px;display:grid;gap:4px}.listBtn.active{background:#6b1a2c;color:white}.listBtn span{font-size:.78rem;color:inherit;opacity:.78}
        .main{padding:18px;display:grid;gap:18px;align-content:start}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panelHead{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:14px}.panel h3{margin:0;color:#6b1a2c}.panel p{margin:4px 0 0;color:#6b7280;font-weight:800}.members,.candidates,.templates{display:grid;gap:10px}.member,.template{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #eef2f7;border-radius:18px;padding:12px}.member strong,.template strong,.candidate strong{color:#6b1a2c}.member span,.template span,.candidate span{display:block;color:#6b7280;font-weight:800;font-size:.8rem}.candidate{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;border:1px solid #eef2f7;border-radius:18px;padding:12px;cursor:pointer}.search,input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}.search{width:100%;margin-bottom:12px}
        .modalLayer{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:1000;display:grid;place-items:center;padding:20px}.modal{width:min(760px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:28px;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.22)}.modal h3{margin:0 0 16px;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.modal label{display:grid;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}.modal textarea{min-height:210px;resize:vertical}.hint{background:#fff8ee;border:1px solid #eadfd5;border-radius:14px;padding:10px;color:#6b7280;font-weight:800}.modalActions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
        @media(max-width:1000px){.layout{grid-template-columns:1fr}.lists{border-right:0;border-bottom:1px solid #eef2f7}.panelHead,.member,.template{display:grid}.newList{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
