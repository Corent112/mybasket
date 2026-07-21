"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const PLAYER_OFFERS = [
  {
    title: "Édition Standard",
    price: "50 €",
    tag: "Highlight",
    description:
      "Une vidéo courte et efficace pour mettre en valeur les meilleures actions du joueur.",
    items: ["3 matchs analysés", "Montage highlights", "Choix de la musique", "Envoi par mail"],
  },
  {
    title: "Édition Scouting",
    price: "180 €",
    tag: "Profil joueur",
    description:
      "Une vidéo complète avec une lecture claire du profil et des points forts du joueur.",
    items: ["5 matchs analysés", "Montage highlights", "Scouting du joueur", "Points forts mis en valeur"],
    highlighted: true,
  },
  {
    title: "Édition Luxe",
    price: "450 €",
    tag: "Saison complète",
    description:
      "Un suivi vidéo sur la saison avec highlights, statistiques et scouting final.",
    items: ["Suivi sur 8 mois", "Statistiques", "Montages mensuels", "Bilan final"],
  },
];

const CLUB_OFFERS = [
  {
    title: "Scouting adverse",
    description: "Préparer un match avec une analyse claire et immédiatement exploitable.",
    items: ["Analyse offensive", "Analyse défensive", "Joueurs clés", "Rapport professionnel"],
  },
  {
    title: "Retour performance",
    description: "Comprendre un match et dégager les priorités de progression.",
    items: ["Analyse collective", "Analyse individuelle", "Clips annotés", "Plan d’action"],
  },
  {
    title: "Accompagnement saison",
    description: "Un suivi vidéo régulier pour le staff et l’équipe.",
    items: ["Scouting régulier", "Rapports mensuels", "Préparation des matchs", "Suivi des performances"],
  },
];

export default function ScoutingVideoPage() {
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
          page: "Scouting vidéo",
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
        <h1>SCOUTING VIDÉO</h1>
        <div className="acc-hero-rule" />
      </div>

      <div className="acc-service-intro">
        <div className="acc-service-copy">
          <h2>Analyser pour mieux décider</h2>
          <p>
            MyBasket accompagne les joueurs, les entraîneurs et les clubs dans
            l’exploitation de la vidéo comme un véritable outil de progression
            et de préparation.
          </p>
          <p>
            Les prestations s’appuient sur une expertise terrain, le diplôme
            d’Analyste du Jeu Basketball et une expérience d’entraîneur
            professionnel.
          </p>
          <p>
            Highlights, scouting adverse, retour de performance ou suivi de
            saison : chaque livrable répond à un objectif précis.
          </p>
          <div className="acc-note">
            <b>Notre mission :</b> transformer les images en informations utiles,
            puis les informations en décisions.
          </div>
        </div>

        <div className="acc-service-visual">
          <div className="acc-service-visual-inner">
            <div className="acc-service-visual-icon">▶</div>
            <strong>ANALYSE VIDÉO</strong>
            <span>
              Highlights joueurs · Scouting adverse · Retours de performance
            </span>
          </div>
        </div>
      </div>

      <section className="acc-offers-section">
        <div className="acc-offers-head">
          <span>Espace joueurs</span>
          <h2>Se mettre en valeur</h2>
          <p>
            Des offres pensées pour présenter le profil du joueur avec une vidéo
            propre, lisible et professionnelle.
          </p>
        </div>

        <div className="acc-offers-grid">
          {PLAYER_OFFERS.map((offer) => (
            <article
              key={offer.title}
              className={`acc-offer-card ${
                offer.highlighted ? "acc-offer-card--highlight" : ""
              }`}
            >
              <span className="acc-offer-price">{offer.price}</span>
              <h3>{offer.title}</h3>
              <p>{offer.description}</p>
              <ul>
                {offer.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="acc-offers-section acc-offers-section--dark">
        <div className="acc-offers-head">
          <span>Clubs & coachs</span>
          <h2>Préparer, analyser, performer</h2>
          <p>
            Des prestations construites sur devis selon le nombre de matchs,
            l’objectif et le niveau de détail attendu.
          </p>
        </div>

        <div className="acc-offers-grid">
          {CLUB_OFFERS.map((offer) => (
            <article
              key={offer.title}
              className="acc-offer-card acc-offer-card--dark"
            >
              <h3>{offer.title}</h3>
              <p>{offer.description}</p>
              <ul>
                {offer.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <div id="demande-scouting-video" className="acc-request-block">
        <h2>Demander une prestation vidéo</h2>
        <p>
          Cette demande arrivera uniquement dans l’onglet Scouting vidéo du
          dashboard.
        </p>

        {sent ? (
          <div className="acc-form-success" role="status">
            ✓ Demande envoyée. Nous revenons vers vous rapidement.
          </div>
        ) : (
          <form className="acc-form-grid" onSubmit={handleSubmit}>
            <div className="acc-form-field">
              <label htmlFor="sv-prenom">Prénom</label>
              <input id="sv-prenom" name="prenom" />
            </div>

            <div className="acc-form-field">
              <label htmlFor="sv-nom">Nom *</label>
              <input id="sv-nom" name="nom" required />
            </div>

            <div className="acc-form-field">
              <label htmlFor="sv-email">E-mail *</label>
              <input id="sv-email" type="email" name="email" required />
            </div>

            <div className="acc-form-field">
              <label htmlFor="sv-phone">Téléphone</label>
              <input id="sv-phone" type="tel" name="telephone" />
            </div>

            <div className="acc-form-field">
              <label htmlFor="sv-club">Club / équipe</label>
              <input id="sv-club" name="club" />
            </div>

            <div className="acc-form-field">
              <label htmlFor="sv-type">Type de prestation</label>
              <select id="sv-type" name="type">
                <option>Joueur - Édition Standard</option>
                <option>Joueur - Édition Scouting</option>
                <option>Joueur - Édition Luxe</option>
                <option>Club / Coach - Scouting adverse</option>
                <option>Club / Coach - Retour performance</option>
                <option>Club / Coach - Accompagnement saison</option>
              </select>
            </div>

            <div className="acc-form-field acc-form-field--full">
              <label htmlFor="sv-message">Votre besoin</label>
              <textarea
                id="sv-message"
                name="message"
                placeholder="Nombre de matchs, objectif, délai, contexte du joueur ou de l’équipe…"
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
