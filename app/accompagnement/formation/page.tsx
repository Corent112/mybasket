"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const FORMATS = [
  {
    titre: "Tutorat Coach",
    prix: "49€ / mois",
    tag: "Pour démarrer",
    desc: "Un suivi simple et régulier pour aider les jeunes entraîneurs à progresser, structurer leurs séances et prendre confiance.",
    items: [
      "1 visio par mois",
      "Aide à la planification",
      "Conseils sur les séances",
      "Accompagnement diplômes",
      "Questions par message",
    ],
  },
  {
    titre: "Mentorat Performance",
    prix: "149€ / mois",
    tag: "Le plus complet",
    desc: "Un accompagnement individualisé pour construire ton projet de jeu, analyser tes matchs et faire évoluer ton coaching.",
    items: [
      "2 visios par mois",
      "Analyse vidéo",
      "Construction du playbook",
      "Préparation des matchs",
      "Débriefs personnalisés",
    ],
    highlighted: true,
  },
  {
    titre: "Suivi Élite",
    prix: "349€ / mois",
    tag: "Premium",
    desc: "Un accompagnement poussé pour les coachs ambitieux, les staffs ou les structures qui veulent passer un cap.",
    items: [
      "Suivi hebdomadaire",
      "Disponibilité renforcée",
      "Analyse vidéo avancée",
      "Leadership & management",
      "Projet sportif complet",
    ],
  },
];

const MISSIONS = [
  { ico: "🏛️", lbl: "Consulting club et structuration du projet sportif" },
  { ico: "🎬", lbl: "Analyse vidéo, scouting et retours de performance" },
  { ico: "🏀", lbl: "Accompagnement joueur et suivi individualisé" },
  { ico: "📋", lbl: "Création de contenus, séances et documents de travail" },
  { ico: "👨‍🏫", lbl: "Tutorat des entraîneurs et accompagnement diplômes" },
  { ico: "🎯", lbl: "Construction d’une méthode de coaching claire" },
];

export default function FormationPage() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    setSending(true);

    try {
      const res = await fetch("/api/accompagnement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page: "Mentorat & Formation",
          type_demande: formData.get("format"),
          nom: formData.get("nom"),
          prenom: formData.get("prenom"),
          email: formData.get("email"),
          telephone: formData.get("phone"),
          message: formData.get("message"),
        }),
      });

      if (!res.ok) {
        alert("Erreur lors de l'envoi de la demande.");
        return;
      }

      setSent(true);
      form.reset();
    } catch (error) {
      alert("Erreur lors de l'envoi de la demande.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="acc-container acc-container--narrow acc-section">
      <div className="acc-back">
        <Link className="acc-btn-outline" href="/accompagnement">
          ← Retour
        </Link>
      </div>

      <div className="acc-hero">
        <h1>MENTORAT & FORMATION</h1>
        <div className="acc-hero-rule" />
      </div>

      <div className="acc-grid">
        <div className="acc-text">
          <p className="lead">
            <b>Vous souhaitez progresser dans votre coaching ?</b>
          </p>

          <p>
            MyBasket vous propose un accompagnement personnalisé pour aider les{" "}
            <b>entraîneurs</b>, les <b>joueurs</b> et les <b>structures</b> à
            passer un cap.
          </p>

          <p>
            L’objectif est de vous accompagner dans la construction d’une méthode
            claire : mieux préparer vos séances, mieux analyser vos matchs, mieux
            gérer votre groupe et mieux faire progresser vos joueurs.
          </p>

          <p>
            Cet accompagnement repose sur l’expérience terrain, l’analyse vidéo,
            la construction de projet sportif et le suivi individualisé.
          </p>

          <p style={{ marginBottom: ".6rem" }}>
            Le mentorat peut s’articuler autour de plusieurs axes :
          </p>

          <ul>
            <li>
              la <b>planification</b> des séances et de la saison
            </li>
            <li>
              la <b>construction du projet de jeu</b>
            </li>
            <li>
              l’<b>analyse vidéo</b> et les débriefs
            </li>
            <li>
              le <b>management</b> du groupe et des joueurs
            </li>
          </ul>

          <p className="italic">
            L’idée n’est pas de proposer une formation théorique de plus, mais un
            vrai suivi terrain, adapté à votre contexte, votre niveau et vos
            objectifs.
          </p>

          <p style={{ marginBottom: 0 }}>
            Chaque formule peut être adaptée selon le profil du coach, du joueur
            ou du club accompagné.
          </p>
        </div>

        <div className="acc-illus">
          <div className="acc-illus-box acc-illus-box--light">
            <div className="acc-blob acc-blob--orange" />
            <div className="acc-blob acc-blob--noir" />
            <div className="acc-illus-inner">
              <div className="acc-illus-emoji">🎓</div>
              <div className="acc-illus-label">MENTORAT COACH</div>
              <div className="acc-illus-sub">Formation · Suivi · Tutorat</div>
            </div>
          </div>
        </div>
      </div>

      <div className="acc-panel">
        <h2>Nos accompagnements</h2>

        <div className="acc-tile-grid">
          {FORMATS.map((f) => (
            <div className="acc-tile" key={f.titre}>
              <div className="ico">🏀</div>
              <div className="lbl">{f.titre}</div>

              <div
                style={{
                  marginTop: ".4rem",
                  color: "#c7902c",
                  fontWeight: 900,
                }}
              >
                {f.prix}
              </div>

              <p
                style={{
                  margin: ".6rem 0",
                  fontSize: ".85rem",
                  lineHeight: 1.5,
                }}
              >
                {f.desc}
              </p>

              <ul
                style={{
                  textAlign: "left",
                  paddingLeft: "1.1rem",
                  marginBottom: 0,
                }}
              >
                {f.items.map((item) => (
                  <li key={item} style={{ marginBottom: ".35rem" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="acc-panel">
        <h2>Missions à la carte</h2>

        <div className="acc-tile-grid">
          {MISSIONS.map((m) => (
            <div className="acc-tile" key={m.lbl}>
              <div className="ico">{m.ico}</div>
              <div className="lbl">{m.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="acc-cta">
        <Link className="acc-cta-btn" href="#demande-accompagnement">
          📅 DEMANDER UN ACCOMPAGNEMENT
        </Link>
        <div className="acc-cta-note">
          Un échange gratuit pour comprendre votre besoin
        </div>
      </div>

      <div id="demande-accompagnement" style={{ marginTop: "2rem" }}>
        <h2 style={{ textAlign: "center" }}>Demander un accompagnement</h2>

        {sent ? (
          <div className="acc-note" role="status">
            ✅ <b>Demande envoyée !</b> Nous revenons vers vous rapidement.
          </div>
        ) : (
          <form className="acc-form" onSubmit={handleSubmit}>
            <div className="acc-form-row">
              <label htmlFor="f-nom">NOM *</label>
              <input id="f-nom" type="text" name="nom" required />
            </div>

            <div className="acc-form-row">
              <label htmlFor="f-prenom">PRÉNOM *</label>
              <input id="f-prenom" type="text" name="prenom" required />
            </div>

            <div className="acc-form-row">
              <label htmlFor="f-email">EMAIL *</label>
              <input id="f-email" type="email" name="email" required />
            </div>

            <div className="acc-form-row">
              <label htmlFor="f-tel">TÉLÉPHONE</label>
              <input id="f-tel" type="tel" name="phone" />
            </div>

            <div className="acc-form-row">
              <label htmlFor="f-format">ACCOMPAGNEMENT</label>
              <select id="f-format" name="format">
                <option>Tutorat Coach</option>
                <option>Mentorat Performance</option>
                <option>Suivi Élite</option>
                <option>Consulting Club</option>
                <option>Analyse Vidéo & Scouting</option>
                <option>Accompagnement Joueur</option>
                <option>Je ne sais pas encore</option>
              </select>
            </div>

            <div className="acc-form-row" style={{ alignItems: "flex-start" }}>
              <label htmlFor="f-msg">OBJECTIFS</label>
              <textarea
                id="f-msg"
                name="message"
                rows={4}
                placeholder="Expliquez votre contexte, votre rôle, votre niveau et vos besoins..."
              />
            </div>

            <button type="submit" className="acc-form-submit" disabled={sending}>
              {sending ? "Envoi en cours..." : "Envoyer la demande"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}