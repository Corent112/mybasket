"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addReply,
  deleteMessage,
  getMessages,
  markAsRead,
  TYPE_LABEL,
  type MbMessage,
} from "@/lib/messages";

export default function Messagerie() {
  const [messages, setMessages] = useState<MbMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    const list = getMessages();
    setMessages(list);
    if (list[0]) setSelectedId(list[0].id);
  }, []);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  const selectMessage = (msg: MbMessage) => {
    setSelectedId(msg.id);
    setReply("");

    if (msg.statut === "non lu") {
      markAsRead(msg.id);
      setMessages(getMessages());
    }
  };

  const sendReply = () => {
    if (!selected || !reply.trim()) return;

    addReply(selected.id, reply.trim());
    setReply("");
    setMessages(getMessages());
  };

  const handleDeleteMessage = () => {
    if (!selected) return;

    const ok = window.confirm("Supprimer cette conversation ?");
    if (!ok) return;

    const next = deleteMessage(selected.id);
    setMessages(next);

    if (next.length > 0) {
      setSelectedId(next[0].id);
    } else {
      setSelectedId(null);
    }

    setReply("");
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="msg-page">
      <style>{CSS}</style>

      <h1>Messagerie</h1>

      <div className="msg-box">
        <aside className="msg-left">
          {messages.length === 0 ? (
            <div className="msg-empty-left">Aucun message.</div>
          ) : (
            messages.map((msg) => (
              <button
                key={msg.id}
                className={
                  "msg-preview" +
                  (selectedId === msg.id ? " active" : "") +
                  (msg.statut === "non lu" ? " unread" : "")
                }
                onClick={() => selectMessage(msg)}
              >
                <strong>{msg.expediteurNom || "Utilisateur"}</strong>
                <span className="msg-preview-sub">
                  📋 {msg.annonceTitre || msg.sujet}
                </span>
                <p>{msg.message}</p>
              </button>
            ))
          )}
        </aside>

        <section className="msg-right">
          {!selected ? (
            <div className="msg-empty-main">Sélectionne une conversation.</div>
          ) : (
            <>
              <div className="msg-head">
                <div>
                  <h2>{selected.expediteurNom || "Utilisateur"}</h2>
                  <p>📋 {selected.annonceTitre || selected.sujet}</p>
                  <p>✉️ {selected.expediteurEmail || "Email non renseigné"}</p>
                  <span className="msg-type">{TYPE_LABEL[selected.type]}</span>
                </div>

                <div className="msg-head-actions">
                  {selected.annonceId && (
                    <button
                      className="msg-ad-btn"
                      onClick={() => {
                        if (selected.annonceId) {
                          window.location.href = `/annonces/${selected.annonceId}`;
                        }
                      }}
                    >
                      👁 Voir l&apos;annonce
                    </button>
                  )}

                  <button className="msg-delete-btn" onClick={handleDeleteMessage}>
                    🗑 Supprimer
                  </button>
                </div>
              </div>

              <div className="msg-thread">
                <div className="bubble incoming">
                  <p>{selected.message}</p>
                  <span>{formatDate(selected.date)}</span>
                </div>

                {(selected.reponses ?? []).map((r, index) => (
                  <div className="bubble outgoing" key={index}>
                    <p>{r.texte}</p>
                    <span>{formatDate(r.date)} · Toi</span>
                  </div>
                ))}
              </div>

              <div className="msg-compose">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Écris ta réponse..."
                />

                <button onClick={sendReply}>📨 Envoyer</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
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

.msg-head-actions{
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

.bubble p{
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