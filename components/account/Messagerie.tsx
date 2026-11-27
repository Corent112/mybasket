"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PushNotifications from "@/components/messaging/PushNotifications";
import StartTeamConversation from "@/components/messaging/StartTeamConversation";
import { addReply, deleteMessage, getMessages, markAsRead, TYPE_LABEL, type MbMessage } from "@/lib/messages";

type PlatformConversation = {
  id: string; is_group?: boolean; member_count?:number; participant_name?: string; sender_user_id?: string; conversation_type: string; subject: string; initial_message: string;
  sender_name: string | null; sender_email: string | null; reference_id: string | null;
  status?: string; recipient_email?: string | null; is_blocked?: boolean; can_block?: boolean; can_reply?: boolean;
  created_at: string; platform_conversation_replies?: Array<{ id:string; sender_user_id:string; sender_name?:string; message:string; created_at:string }>;
};

type Unified = { source:"local"; local:MbMessage } | { source:"platform"; platform:PlatformConversation };

export default function Messagerie() {
  const [local, setLocal] = useState<MbMessage[]>([]);
  const [platform, setPlatform] = useState<PlatformConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [viewerId, setViewerId] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [managing, setManaging] = useState(false);
  const [blockedContacts, setBlockedContacts] = useState<{id: string; name: string}[]>([]);
  const reloadVersion = useRef(0);

  async function reload() {
    const version = ++reloadVersion.current;
    const localList = getMessages();
    setLocal(localList);
    try {
      const res = await fetch("/api/messages/platform", { cache:"no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chargement impossible");
      if (version !== reloadVersion.current) return;
      setViewerId(json.userId || "");
      setBlockedContacts(Array.isArray(json.blockedContacts) ? json.blockedContacts : []);
      const remote = Array.isArray(json.conversations) ? json.conversations : [];
      setPlatform(remote);
      setSelectedId(current => {
        if (remote.some((thread: PlatformConversation) => current === `p:${thread.id}`) || localList.some(thread => current === `l:${thread.id}`)) return current;
        return remote[0] ? `p:${remote[0].id}` : localList[0] ? `l:${localList[0].id}` : null;
      });
    } catch (error) {
      if (version !== reloadVersion.current) return;
      setError(error instanceof Error ? error.message : "Messages indisponibles");
      setSelectedId(current => current || (localList[0] ? `l:${localList[0].id}` : null));
    }
  }
  useEffect(() => {
    setSelectedId(new URLSearchParams(window.location.search).get("conversation") ? `p:${new URLSearchParams(window.location.search).get("conversation")}` : null);
    void reload();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 8000);
    return () => window.clearInterval(timer);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const messages = useMemo<Unified[]>(() => [
    ...platform.map((p) => ({ source:"platform", platform:p } as Unified)),
    ...local.map((l) => ({ source:"local", local:l } as Unified)),
  ], [platform, local]);
  const selected = messages.find((m) => selectedId === (m.source === "platform" ? `p:${m.platform.id}` : `l:${m.local.id}`)) || null;

  async function sendReply() {
    if (!selected || !reply.trim() || sending) return;
    if (selected.source === "platform") {
      setSending(true); setError("");
      try {
        const res = await fetch("/api/messages/platform", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ conversationId:selected.platform.id, message:reply.trim() }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "Message non envoyé");
        setReply(""); await reload();
      } catch (error) { setError(error instanceof Error ? error.message : "Message non envoyé"); }
      finally { setSending(false); }
      return;
    }
    addReply(selected.local.id, reply.trim()); setReply(""); setLocal(getMessages());
  }

  async function manageThread(action: "hide" | "block" | "unblock", contactId?: string) {
    if ((!selected && !contactId) || managing) return;
    if (action === "hide" && !window.confirm("Supprimer cette discussion de ta messagerie ?")) return;
    if (action === "block" && !window.confirm("Bloquer ce contact sur MyBasket ?")) return;
    if (!contactId && selected?.source === "local") {
      if (action === "hide") { setLocal(deleteMessage(selected.local.id)); setSelectedId(null); setReply(""); }
      return;
    }
    setManaging(true);
    setError("");
    try {
      const response = await fetch("/api/messages/platform", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactId ? { contactId, action } : { conversationId: selected?.source === "platform" ? selected.platform.id : undefined, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action impossible.");
      if (action === "hide") setReply("");
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Action impossible.");
    } finally {
      setManaging(false);
    }
  }

  function choose(m:Unified) {
    if (m.source === "platform") setSelectedId(`p:${m.platform.id}`);
    else { setSelectedId(`l:${m.local.id}`); if (m.local.statut === "non lu") { markAsRead(m.local.id); setLocal(getMessages()); } }
    setReply("");
  }

  function fmt(iso:string){ return new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }

  const sender = selected?.source === "platform" ? selected.platform.participant_name || selected.platform.sender_name || "Utilisateur" : selected?.source === "local" ? selected.local.expediteurNom || "Utilisateur" : "";
  const email = selected?.source === "platform" ? (selected.platform.recipient_email || (selected.platform.sender_user_id !== viewerId ? selected.platform.sender_email : null)) : selected?.source === "local" ? selected.local.expediteurEmail : null;
  const subject = selected?.source === "platform" ? selected.platform.subject : selected?.source === "local" ? selected.local.annonceTitre || selected.local.sujet : "";

  return <div className="msg-page"><style>{CSS}</style><h1>Messagerie</h1><PushNotifications /><StartTeamConversation onCreated={id=>{setSelectedId(`p:${id}`);void reload();}} />{error&&<p role="alert">{error}</p>}{blockedContacts.length > 0 && <details className="msg-blocked"><summary>Contacts bloqués ({blockedContacts.length})</summary>
      {blockedContacts.map(contact => <div key={contact.id}><span>{contact.name}</span> <button type="button" disabled={managing} onClick={() => void manageThread("unblock", contact.id)}>Débloquer</button></div>)}</details>}<div className="msg-box">
    <aside className="msg-left">{messages.length===0?<div className="msg-empty-left">Aucun message.</div>:messages.map((m)=>{
      const id=m.source==="platform"?`p:${m.platform.id}`:`l:${m.local.id}`;
      const name=m.source==="platform"?m.platform.participant_name||m.platform.sender_name||"Utilisateur":m.local.expediteurNom||"Utilisateur";
      const sub=m.source==="platform"?m.platform.subject:m.local.annonceTitre||m.local.sujet;
      const body=m.source==="platform"?(m.platform.platform_conversation_replies?.at(-1)?.message || m.platform.initial_message):m.local.message;
      return <button key={id} className={`msg-preview ${selectedId===id?"active":""}`} onClick={()=>choose(m)}><strong>{name}</strong><span className="msg-preview-sub">📋 {sub}</span><p>{body}</p></button>;
    })}</aside>
    <section className="msg-right">{!selected?<div className="msg-empty-main">Sélectionne une conversation.</div>:<>
      <div className="msg-head"><div><h2>{sender}</h2><p>📋 {subject}</p>{selected.source === "platform" && selected.platform.is_group ? <p>{selected.platform.member_count} membres · Conversation partagée</p> : email ? <p>✉️ {email}</p> : null}<span className="msg-type">{selected.source==="platform"?selected.platform.is_group?"GROUPE":selected.platform.conversation_type.toUpperCase():TYPE_LABEL[selected.local.type]}</span></div>
      <div className="msg-head-actions">
      {selected.source === "platform" && selected.platform.can_block && <button type="button" className="msg-ad-btn" disabled={managing || sending} onClick={() => void manageThread(selected.platform.is_blocked ? "unblock" : "block")}>{selected.platform.is_blocked ? "Débloquer" : "Bloquer le contact"}</button>}
      <button type="button" className="msg-ad-btn" disabled={managing || sending} onClick={() => void manageThread("hide")}>Supprimer la discussion</button>{selected.source==="platform"&&selected.platform.reference_id&&selected.platform.conversation_type==="annonce"?<button className="msg-ad-btn" onClick={()=>location.href=`/admin/annonces/${selected.platform.reference_id}`}>👁 Voir l'annonce</button>:null}{selected.source==="local"&&selected.local.annonceId?<button className="msg-ad-btn" onClick={()=>location.href=`/annonces/${selected.local.annonceId}`}>👁 Voir l'annonce</button>:null}</div></div>
      <div className="msg-thread">{(selected.source === "local" || selected.platform.initial_message) && <div className={`bubble ${selected.source === "platform" && selected.platform.sender_user_id === viewerId ? "outgoing" : "incoming"}`}><p>{selected.source==="platform"?selected.platform.initial_message:selected.local.message}</p><span>{fmt(selected.source==="platform"?selected.platform.created_at:selected.local.date)}</span></div>}
      {selected.source==="platform"?(selected.platform.platform_conversation_replies||[]).map(r=><div className={`bubble ${r.sender_user_id===viewerId?"outgoing":"incoming"}`} key={r.id}>{selected.platform.is_group&&r.sender_user_id!==viewerId&&<strong className="bubble-author">{r.sender_name}</strong>}<p>{r.message}</p><span>{fmt(r.created_at)}</span></div>):(selected.local.reponses||[]).map((r,i)=><div className="bubble outgoing" key={i}><p>{r.texte}</p><span>{fmt(r.date)} · Toi</span></div>)}</div>
      {selected.source === "platform" && selected.platform.can_reply === false ? <p className="msg-reply-disabled">{selected.platform.is_blocked ? "Ce contact est bloqué." : selected.platform.status === "invited" ? "Invitation en attente de réponse." : selected.platform.status === "declined" ? "Invitation refusée." : selected.platform.recipient_email ? "Message envoyé par e-mail. Les réponses arrivent dans ta boîte e-mail." : "La réponse dans MyBasket est indisponible pour cette discussion."}</p> : <div className="msg-compose"><textarea value={reply} onChange={e=>setReply(e.target.value)} placeholder="Écris ta réponse..."/><button disabled={sending||managing||!reply.trim()} onClick={sendReply}>{sending?"Envoi…":"📨 Envoyer"}</button></div>}
    </>}</section>
  </div></div>;
}

const CSS = `
.msg-page{
  width:100%;
  max-width:1480px;
  margin:0 auto;
  padding:1.4rem 1.6rem 3rem;
  font-family:'Roboto',system-ui,sans-serif;
  color:#0F0F12;
}

.msg-page h1{
  font-family:'Alfa Slab One',serif;
  font-size:2.2rem;
  margin:0 0 1.5rem;
}

.msg-blocked{margin:0 0 16px;color:#6b1a2c}
.msg-blocked summary{cursor:pointer;font-weight:700}
.msg-blocked div{padding:6px 0}
.msg-blocked button{border:1px solid #e5d8dc;background:#fff;border-radius:6px;padding:4px 8px}
.msg-box{
  display:grid;
  grid-template-columns:420px 1fr;
  min-height:620px;
  border:1px solid #d5d5d5;
  border-radius:12px;
  overflow:hidden;
  background:#fff;
}

.msg-left{
  border-right:1px solid #d5d5d5;
  background:#fafafa;
}

.msg-preview{
  width:100%;
  display:block;
  text-align:left;
  border:0;
  border-bottom:1px solid #ececec;
  background:#fff;
  padding:1.25rem 1.5rem;
  cursor:pointer;
  font-family:inherit;
  min-height:115px;
}

.msg-preview:hover{
  background:#fff9ec;
}

.msg-preview.active{
  background:#fff7e6;
  border-left:5px solid #f58213;
}

.msg-preview.unread strong::after{
  content:" •";
  color:#f58213;
}

.msg-preview strong{
  display:block;
  font-size:1.05rem;
  font-weight:900;
  margin-bottom:.35rem;
}

.msg-preview-sub{
  display:block;
  color:#6B1A2C;
  font-weight:800;
  font-size:.9rem;
  margin-bottom:.35rem;
}

.msg-preview p{
  margin:0;
  color:#777;
  line-height:1.35;
  font-size:.95rem;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
}

.msg-right{
  display:flex;
  flex-direction:column;
  min-width:0;
  background:#fff;
}

.msg-head{
  min-height:110px;
  background:#0F0F12;
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem;
  padding:1.4rem 1.6rem;
}

.msg-head h2{
  margin:0 0 .25rem;
  font-size:1.25rem;
  font-weight:900;
}

.msg-head p{
  margin:.15rem 0;
  color:#cfcfcf;
  font-size:.9rem;
}

.msg-type{
  display:inline-block;
  margin-top:.45rem;
  background:#f58213;
  color:#111;
  border-radius:999px;
  padding:.2rem .7rem;
  font-size:.7rem;
  font-weight:900;
  text-transform:uppercase;
}

.msg-reply-disabled{padding:12px 20px;color:#66575d}
.msg-head-actions{
  flex-wrap:wrap;
  display:flex;
  align-items:center;
  gap:.75rem;
  flex-wrap:wrap;
  justify-content:flex-end;
}

.msg-ad-btn,
.msg-delete-btn{
  border:0;
  border-radius:999px;
  padding:.75rem 1.15rem;
  font-weight:900;
  cursor:pointer;
  white-space:nowrap;
  font-family:inherit;
}

.msg-ad-btn{
  background:#fff;
  color:#111;
}

.msg-delete-btn{
  background:#6B1A2C;
  color:#fff;
}

.msg-delete-btn:hover{
  background:#8c243a;
}

.msg-thread{
  flex:1;
  padding:1.6rem;
  background:#fbfbfb;
  overflow:auto;
  display:flex;
  flex-direction:column;
  gap:1rem;
}

.bubble{
  max-width:440px;
  border-radius:16px;
  padding:1rem 1.2rem;
  box-shadow:0 2px 10px rgba(0,0,0,.08);
}

.bubble-author{display:block;margin-bottom:6px;color:#6b1a2c;font-size:12px}.bubble p{
  margin:0 0 .5rem;
  line-height:1.45;
  font-size:1rem;
}

.bubble span{
  display:block;
  font-size:.78rem;
  color:#777;
  text-align:right;
}

.bubble.incoming{
  align-self:flex-start;
  background:#fff;
  border:1px solid #ddd;
}

.bubble.outgoing{
  align-self:flex-end;
  background:#0F0F12;
  color:#fff;
}

.bubble.outgoing span{
  color:#aaa;
}

.msg-compose{
  border-top:1px solid #d5d5d5;
  padding:1rem 1.4rem;
  display:grid;
  grid-template-columns:1fr 170px;
  gap:1rem;
  background:#fff;
}

.msg-compose textarea{
  width:100%;
  min-height:76px;
  resize:vertical;
  border:1px solid #cfcfcf;
  border-radius:10px;
  padding:1rem;
  font-family:inherit;
  font-size:1rem;
}

.msg-compose textarea:focus{
  outline:2px solid #f58213;
  border-color:#f58213;
}

.msg-compose button{
  border:0;
  background:#0F0F12;
  color:#fff;
  border-radius:999px;
  font-family:'Alfa Slab One',serif;
  font-size:1rem;
  cursor:pointer;
}

.msg-compose button:hover{
  background:#000;
}

.msg-empty-left,
.msg-empty-main{
  padding:2rem;
  color:#777;
}

.msg-empty-main{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
}

@media(max-width:900px){
  .msg-box{
    grid-template-columns:1fr;
  }

  .msg-left{
    border-right:0;
    border-bottom:1px solid #ddd;
    max-height:260px;
    overflow:auto;
  }

  .msg-head{
    align-items:flex-start;
    flex-direction:column;
  }

  .msg-head-actions{
    justify-content:flex-start;
  }

  .msg-compose{
    grid-template-columns:1fr;
  }

  .msg-compose button{
    padding:1rem;
  }
}
`;