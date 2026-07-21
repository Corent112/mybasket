"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const SERVICES = [
  { ico: "🎯", lbl: "Construire le projet sportif du club" },
  { ico: "👨‍🏫", lbl: "Former et accompagner les entraîneurs" },
  { ico: "🏀", lbl: "Définir une identité et une philosophie de jeu" },
  { ico: "📅", lbl: "Structurer les plannings et les contenus" },
  { ico: "📋", lbl: "Accompagner l’organisation administrative" },
  { ico: "🏅", lbl: "Préparer les labels et projets de développement" },
];

export default function DirectionTechniquePage() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    setSending(true);

    try {
      const response = await fetch("/api/accompagnement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "Direction technique",
          type_demande: formData.get("type"),
          nom: formData.get("nom"),
          prenom: formData.get("prenom"),
          email: formData.get("email"),
          telephone: formData.get("telephone"),
          club: formData.get("club"),
          message: formData.get("message"),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Envoi impossible");
      }

      form.reset();
      setSent(true);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de l’envoi de la demande."
      );
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
        <h1>DIRECTION TECHNIQUE</h1>
        <div className="acc-hero-rule" />
      </div>

      <div className="acc-grid">
        <div className="acc-text">
          <p className="lead">
            <b>Vous souhaitez structurer durablement votre club ?</b>
          </p>
          <p>
            MyBasket intervient comme un <b>directeur technique externe</b> pour
            construire avec vous un projet sportif clair, cohérent et applicable
            sur le terrain.
          </p>
          <p>
            Nous définissons une philosophie de club, une identité de jeu, une
            progression par catégorie et une méthode commune pour accompagner les
            entraîneurs.
          </p>
          <p>
            L’accompagnement peut également inclure les plannings, les contenus
            de séances, la formation des cadres, le développement du basket
            féminin, les opérations basket école et les dossiers de labels.
          </p>
          <p className="italic">
            Chaque mission est adaptée à la taille de la structure, à ses moyens,
            à son niveau et à ses objectifs.
          </p>
        </div>

        <div className="acc-illus">
          <div className="acc-illus-box acc-illus-box--light">
            <div className="acc-blob acc-blob--orange" />
            <div className="acc-blob acc-blob--noir" />
            <div className="acc-illus-inner">
              <div className="acc-illus-emoji">🏛️</div>
              <div className="acc-illus-label">PROJET SPORTIF</div>
              <div className="acc-illus-sub">Club · Méthode · Identité</div>
            </div>
          </div>
        </div>
      </div>

      <div className="acc-panel">
        <h2>Notre accompagnement complet</h2>
        <div className="acc-tile-grid">
          {SERVICES.map((service) => (
            <div className="acc-tile" key={service.lbl}>
              <div className="ico">{service.ico}</div>
              <div className="lbl">{service.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="acc-cta">
        <Link className="acc-cta-btn" href="#demande-direction-technique">
          📅 DEMANDER UN ÉCHANGE
        </Link>
        <div className="acc-cta-note">
          La demande arrivera directement dans le dashboard Direction technique
        </div>
      </div>

      <div id="demande-direction-technique" className="acc-request-block">
        <h2>Demander un accompagnement</h2>
        <p>
          Présentez votre club et votre besoin. La demande sera classée
          automatiquement dans Direction technique.
        </p>

        {sent ? (
          <div className="acc-form-success" role="status">
            ✓ Demande envoyée. Nous revenons vers vous rapidement.
          </div>
        ) : (
          <form className="acc-form-grid" onSubmit={handleSubmit}>
            <div className="acc-form-field">
              <label htmlFor="dt-prenom">Prénom *</label>
              <input id="dt-prenom" name="prenom" required />
            </div>

            <div className="acc-form-field">
              <label htmlFor="dt-nom">Nom *</label>
              <input id="dt-nom" name="nom" required />
            </div>

            <div className="acc-form-field">
              <label htmlFor="dt-email">E-mail *</label>
              <input id="dt-email" type="email" name="email" required />
            </div>

            <div className="acc-form-field">
              <label htmlFor="dt-phone">Téléphone</label>
              <input id="dt-phone" type="tel" name="telephone" />
            </div>

            <div className="acc-form-field">
              <label htmlFor="dt-club">Club / structure *</label>
              <input id="dt-club" name="club" required />
            </div>

            <div className="acc-form-field">
              <label htmlFor="dt-type">Besoin principal</label>
              <select id="dt-type" name="type">
                <option>Projet sportif global</option>
                <option>Philosophie et identité de jeu</option>
                <option>Formation des entraîneurs</option>
                <option>Structuration de l’école de basket</option>
                <option>Organisation technique et plannings</option>
                <option>Labels et développement du club</option>
                <option>Autre besoin de direction technique</option>
              </select>
            </div>

            <div className="acc-form-field acc-form-field--full">
              <label htmlFor="dt-message">Votre contexte et vos objectifs</label>
              <textarea
                id="dt-message"
                name="message"
                placeholder="Catégories concernées, nombre d’équipes, problématiques actuelles, objectifs du club…"
              />
            </div>

            <button
              type="submit"
              className="acc-form-primary"
              disabled={sending}
            >
              {sending ? "Envoi en cours…" : "Envoyer la demande"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
