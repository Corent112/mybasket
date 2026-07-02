"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const PLAYER_OFFERS = [
  {
    titre: "Édition Standard",
    prix: "50€",
    tag: "Highlight",
    desc: "Une vidéo courte et efficace pour mettre en valeur les meilleures actions du joueur.",
    items: [
      "3 matchs analysés",
      "Choix de la musique",
      "Montage highlights",
      "Vidéo envoyée par mail",
    ],
  },
  {
    titre: "Édition Scouting",
    prix: "180€",
    tag: "Profil joueur",
    desc: "Une vidéo plus complète avec une vraie mise en valeur du profil et des points forts du joueur.",
    items: [
      "5 matchs analysés",
      "Choix de la musique",
      "Montage highlights",
      "Scouting du joueur",
      "Mise en valeur des points forts",
    ],
    highlighted: true,
  },
  {
    titre: "Édition Luxe",
    prix: "450€",
    tag: "Saison complète",
    desc: "Un suivi vidéo complet sur la saison avec highlights, statistiques et scouting final.",
    items: [
      "Édition Standard chaque mois",
      "Réalisation des statistiques",
      "Suivi sur 8 mois",
      "Édition Scouting en fin d’année",
      "Bilan complet du joueur",
    ],
  },
];

const CLUB_OFFERS = [
  {
    titre: "Scouting adverse",
    desc: "Préparer un match avec une analyse claire et exploitable de l’adversaire.",
    items: [
      "Analyse offensive",
      "Analyse défensive",
      "Joueurs clés",
      "Tendances collectives",
      "Rapport PDF professionnel",
    ],
  },
  {
    titre: "Retour performance",
    desc: "Comprendre un match pour identifier les forces, faiblesses et axes de progression.",
    items: [
      "Analyse équipe",
      "Analyse individuelle",
      "Clips vidéo annotés",
      "Axes de progression",
      "Plan d’action",
    ],
  },
  {
    titre: "Accompagnement saison",
    desc: "Un suivi vidéo régulier pour accompagner une équipe ou un staff toute la saison.",
    items: [
      "Scouting régulier",
      "Retours vidéo",
      "Rapports mensuels",
      "Préparation des matchs",
      "Suivi des performances",
    ],
  },
];

export default function ScoutingVideoPage() {
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
          page: "Scouting Vidéo",
          type_demande: formData.get("type"),
          nom: formData.get("nom"),
          email: formData.get("email"),
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
        <h1>SCOUTING VIDÉO</h1>
        <div className="acc-hero-rule" />
      </div>

      <div
        style={{
          margin: "1.5rem auto 2rem",
          maxWidth: "1000px",
          background: "#111116",
          color: "white",
          borderRadius: "18px",
          padding: "1.2rem 1.8rem",
          textAlign: "center",
          border: "2px solid #d4a24c",
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        📊 Diplômé Analyste du Jeu Basketball
        &nbsp;&nbsp;•&nbsp;&nbsp; 🏀 Entraîneur Professionnel de Basketball
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr .9fr",
          gap: "2.5rem",
          alignItems: "center",
          marginBottom: "3rem",
        }}
      >
        <div>
          <h3 className="acc-block-title">
            Analyse vidéo, scouting et performance
          </h3>

          <p style={{ fontSize: "1.05rem", lineHeight: 1.8 }}>
            La vidéo est aujourd’hui un outil incontournable pour comprendre le
            jeu, préparer les rencontres, développer les joueurs et optimiser la
            performance collective.
          </p>

          <p style={{ lineHeight: 1.8 }}>
            Grâce à une expertise acquise sur le terrain et validée par le{" "}
            <b>Diplôme d’Analyste du Jeu Basketball</b>, MyBasket accompagne les
            joueurs, les entraîneurs et les clubs dans l’exploitation de la vidéo
            comme un véritable levier de progression.
          </p>

          <p style={{ lineHeight: 1.8 }}>
            Chaque prestation est construite pour répondre à un objectif précis :
            mettre en valeur un joueur, préparer un adversaire, analyser une
            performance ou accompagner une structure dans son développement.
          </p>

          <div
            className="acc-note"
            style={{
              marginTop: "1.5rem",
              borderLeft: "4px solid #d4a24c",
            }}
          >
            <b>Notre mission :</b> transformer les images en informations utiles,
            les informations en décisions et les décisions en performance.
          </div>
        </div>

        <div
          style={{
            minHeight: "310px",
            borderRadius: "26px",
            background:
              "radial-gradient(circle at 80% 15%, rgba(212,162,76,.35), transparent 28%), linear-gradient(135deg, #111116, #25232b)",
            color: "white",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 25px 60px rgba(0,0,0,.25)",
            border: "2px solid #d4a24c",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "180px",
              height: "180px",
              border: "7px solid rgba(212,162,76,.55)",
              borderRadius: "999px",
              right: "-60px",
              top: "-60px",
            }}
          />

          <div
            style={{
              position: "absolute",
              width: "220px",
              height: "220px",
              border: "7px solid rgba(212,162,76,.45)",
              borderRadius: "999px",
              left: "-90px",
              bottom: "-90px",
            }}
          />

          <div style={{ textAlign: "center", zIndex: 2, padding: "1.5rem" }}>
            <div
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "999px",
                border: "4px solid #d4a24c",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 1rem",
                fontSize: "2.6rem",
                color: "#d4a24c",
              }}
            >
              ▶
            </div>

            <h3
              style={{
                margin: 0,
                fontSize: "1.8rem",
                letterSpacing: "1px",
              }}
            >
              ANALYSE VIDÉO
            </h3>

            <p
              style={{
                marginTop: ".5rem",
                color: "#d4a24c",
                fontWeight: 900,
              }}
            >
              ANALYSTE DU JEU • PERFORMANCE
            </p>

            <p
              style={{
                marginTop: ".8rem",
                color: "#bdbdc7",
                fontSize: ".9rem",
                maxWidth: "280px",
              }}
            >
              Highlights joueurs • Scouting adverse • Retours de performance •
              Analyse stratégique
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#f8f2e8",
          border: "1px solid rgba(107,26,44,.12)",
          borderRadius: "24px",
          padding: "2rem",
          marginBottom: "3rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.7rem" }}>
          <span
            style={{
              display: "inline-block",
              background: "#d4a24c",
              color: "#211315",
              padding: ".45rem .85rem",
              borderRadius: "999px",
              fontWeight: 900,
              fontSize: ".8rem",
              textTransform: "uppercase",
            }}
          >
            Espace joueurs
          </span>

          <h3
            style={{
              margin: ".9rem 0 0",
              fontSize: "2rem",
              color: "#6b1a2c",
              textTransform: "uppercase",
            }}
          >
            Se mettre en valeur
          </h3>

          <p
            style={{
              maxWidth: "680px",
              margin: ".7rem auto 0",
              lineHeight: 1.7,
            }}
          >
            Des offres pensées pour les joueurs qui souhaitent créer une vidéo
            highlights professionnelle, valoriser leur profil et partager leurs
            meilleures actions.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1rem",
          }}
        >
          {PLAYER_OFFERS.map((offer) => (
            <article
              key={offer.titre}
              style={{
                background: offer.highlighted ? "#6b1a2c" : "white",
                color: offer.highlighted ? "white" : "#1f1f1f",
                borderRadius: "18px",
                padding: "1.4rem",
                boxShadow: "0 15px 35px rgba(0,0,0,.08)",
                border: offer.highlighted
                  ? "2px solid #d4a24c"
                  : "1px solid rgba(0,0,0,.08)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  marginBottom: ".8rem",
                  padding: ".35rem .7rem",
                  borderRadius: "999px",
                  background: "#d4a24c",
                  color: "#211315",
                  fontWeight: 900,
                  fontSize: ".75rem",
                }}
              >
                {offer.tag}
              </span>

              <h3 style={{ margin: 0, fontSize: "1.35rem" }}>{offer.titre}</h3>

              <strong
                style={{
                  display: "block",
                  marginTop: ".6rem",
                  fontSize: "2rem",
                  color: offer.highlighted ? "#d4a24c" : "#6b1a2c",
                }}
              >
                {offer.prix}
              </strong>

              <p style={{ lineHeight: 1.6 }}>{offer.desc}</p>

              <ul style={{ paddingLeft: "1.1rem", lineHeight: 1.8 }}>
                {offer.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#111116",
          color: "white",
          borderRadius: "24px",
          padding: "2rem",
          marginBottom: "3rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.7rem" }}>
          <span
            style={{
              display: "inline-block",
              background: "#d4a24c",
              color: "#211315",
              padding: ".45rem .85rem",
              borderRadius: "999px",
              fontWeight: 900,
              fontSize: ".8rem",
              textTransform: "uppercase",
            }}
          >
            Espace clubs & coachs
          </span>

          <h3
            style={{
              margin: ".9rem 0 0",
              fontSize: "2rem",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            Préparer, analyser, performer
          </h3>

          <p
            style={{
              maxWidth: "740px",
              margin: ".7rem auto 0",
              lineHeight: 1.7,
              color: "#c9c9d2",
            }}
          >
            Des prestations professionnelles adaptées au niveau, au volume de
            matchs, au staff et aux objectifs de la structure. Chaque mission est
            construite sur devis.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1rem",
          }}
        >
          {CLUB_OFFERS.map((offer) => (
            <article
              key={offer.titre}
              style={{
                background: "#1c1c22",
                borderLeft: "5px solid #d4a24c",
                borderRadius: "14px",
                padding: "1.4rem",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  marginBottom: ".8rem",
                  padding: ".35rem .7rem",
                  borderRadius: "999px",
                  background: "rgba(212,162,76,.15)",
                  color: "#d4a24c",
                  fontWeight: 900,
                  fontSize: ".75rem",
                }}
              >
                SUR DEVIS
              </span>

              <h3 style={{ margin: 0, fontSize: "1.35rem" }}>{offer.titre}</h3>

              <p style={{ lineHeight: 1.6, color: "#c9c9d2" }}>{offer.desc}</p>

              <ul style={{ paddingLeft: "1.1rem", lineHeight: 1.8 }}>
                {offer.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div>
        <h3 className="acc-block-title">Demander une prestation vidéo</h3>

        {sent ? (
          <div className="acc-note" role="status">
            ✅ <b>Demande envoyée !</b> Nous revenons vers vous rapidement.
          </div>
        ) : (
          <form className="acc-form" onSubmit={handleSubmit}>
            <div className="acc-form-row">
              <label htmlFor="v-nom">NOM *</label>
              <input id="v-nom" type="text" name="nom" required />
            </div>

            <div className="acc-form-row">
              <label htmlFor="v-email">EMAIL *</label>
              <input id="v-email" type="email" name="email" required />
            </div>

            <div className="acc-form-row">
              <label htmlFor="v-type">TYPE DE DEMANDE</label>
              <select id="v-type" name="type">
                <option>Joueur - Édition Standard 50€</option>
                <option>Joueur - Édition Scouting 180€</option>
                <option>Joueur - Édition Luxe 450€</option>
                <option>Club / Coach - Scouting adverse sur devis</option>
                <option>Club / Coach - Retour performance sur devis</option>
                <option>Club / Coach - Accompagnement saison sur devis</option>
              </select>
            </div>

            <div className="acc-form-row" style={{ alignItems: "flex-start" }}>
              <label htmlFor="v-msg">BESOIN</label>
              <textarea
                id="v-msg"
                name="message"
                rows={4}
                placeholder="Expliquez votre besoin : joueur, club, équipe, nombre de matchs, objectifs..."
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