"use client";

import { useState } from "react";
import { addMessage, type MessageType } from "@/lib/messages";

type Props = {
  type: MessageType;                 // "annonce" | "rdv" | "reservation" | "direct"
  sujet: string;                     // titre affiché dans la boîte de réception
  destinataireNom: string;
  annonceId?: string;                // pour les réponses aux annonces
  annonceTitre?: string;
  titre?: string;                    // titre de la modale
  onClose: () => void;
  onSent?: () => void;
};

export default function ContactModal({
  type, sujet, destinataireNom, annonceId, annonceTitre, titre, onClose, onSent,
}: Props) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const send = () => {
    if (!nom.trim() || !message.trim()) return;
    addMessage({
      type, sujet,
      annonceId, annonceTitre,
      destinataireNom,
      expediteurNom: nom.trim(),
      expediteurEmail: email.trim(),
      message: message.trim(),
    });
    setSent(true);
    onSent?.();
    setTimeout(onClose, 1400);
  };

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cm-head">
          <b>{titre || "Envoyer un message"}</b>
          <button className="cm-x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {sent ? (
          <div className="cm-sent">✅ Message envoyé à {destinataireNom || "le destinataire"} !</div>
        ) : (
          <>
            <div className="cm-body">
              <p className="cm-ctx">Sujet : <b>{sujet}</b></p>
              <div className="cm-fld"><label>Votre nom</label><input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" /></div>
              <div className="cm-fld"><label>Votre email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" /></div>
              <div className="cm-fld"><label>Message</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bonjour, je suis intéressé(e)…" /></div>
            </div>
            <div className="cm-actions">
              <span className="spacer" />
              <button className="btn btn-outline" onClick={onClose}>Annuler</button>
              <button className="btn btn-black" onClick={send}>Envoyer</button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .cm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1200;padding:1rem}
        .cm-modal{width:480px;max-width:96vw;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.4);font-family:'Roboto',sans-serif;color:#0F0F12}
        .cm-head{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.4rem;border-bottom:1px solid #C8C8C8}
        .cm-head b{font-family:'Alfa Slab One',serif;font-size:1.05rem;color:#6B1A2C}
        .cm-x{border:none;background:none;cursor:pointer;font-size:1.2rem;color:#6B6B6B}
        .cm-body{padding:1rem 1.4rem;display:flex;flex-direction:column;gap:.8rem}
        .cm-ctx{font-size:.84rem;color:#6B6B6B}
        .cm-fld{display:flex;flex-direction:column;gap:.3rem}
        .cm-fld label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6B6B6B}
        .cm-fld input,.cm-fld textarea{padding:.6rem .8rem;border:1px solid #C8C8C8;border-radius:10px;font-size:.9rem;font-family:inherit;background:#F5F5F5}
        .cm-fld input:focus,.cm-fld textarea:focus{outline:none;border-color:#D4A24C;background:#fff;box-shadow:0 0 0 3px rgba(212,162,76,.18)}
        .cm-fld textarea{min-height:96px;resize:vertical}
        .cm-actions{display:flex;align-items:center;gap:.6rem;padding:1rem 1.4rem 1.4rem}
        .cm-actions .spacer{flex:1}
        .cm-sent{padding:2.2rem 1.4rem;text-align:center;font-size:1rem;font-weight:600;color:#16A34A}
      `}</style>
    </div>
  );
}