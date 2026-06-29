"use client";

import { useState, type FormEvent } from "react";

const CONTACT_ITEMS = [
  { icon: "✉️", label: "EMAIL", value: "contact@mybasket.fr" },
  { icon: "📞", label: "TÉLÉPHONE", value: "06 00 00 00 00" },
  { icon: "📍", label: "ZONE D’INTERVENTION", value: "France entière · Déplacements possibles" },
  { icon: "🏀", label: "NOS DOMAINES", value: "Formation · Scouting · Direction technique" },
  { icon: "💬", label: "PREMIER ÉCHANGE", value: "Premier échange gratuit" },
];

const REASSURANCE = [
  {
    icon: "🎯",
    title: "Projet clair",
    text: "On analyse votre besoin avant de proposer une solution adaptée.",
  },
  {
    icon: "📋",
    title: "Expertise terrain",
    text: "Coaching, formation, vidéo et structuration sportive au service de votre progression.",
  },
  {
    icon: "🤝",
    title: "Accompagnement humain",
    text: "Un échange simple, transparent et personnalisé pour trouver la bonne formule.",
  },
];

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    setSending(true);

    try {
      const res = await fetch("/api/contact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    sujet: formData.get("sujet"),
    message: formData.get("message"),
  }),
});

      if (!res.ok) {
        alert("Erreur lors de l'envoi du message.");
        return;
      }

      setSent(true);
      form.reset();
    } catch (error) {
      alert("Erreur lors de l'envoi du message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <div className="acc-hero">
          <h1>CONTACT</h1>
          <div className="acc-hero-rule" />
        </div>

        <p style={styles.subtitle}>
          Un projet club, une formation, une analyse vidéo ou une demande
          d’accompagnement ? Écrivez-nous,{" "}
          <b>on revient vers vous rapidement.</b>
        </p>

        <div style={styles.grid}>
          <aside style={styles.contactCard}>
            <div style={styles.roundIcon}>🏀</div>

            <h2 style={styles.cardTitle}>
              CONTACT <span>MYBASKET</span>
            </h2>

            <div style={styles.smallRule} />

            <div style={styles.contactList}>
              {CONTACT_ITEMS.map((item) => (
                <div key={item.label} style={styles.contactItem}>
                  <div style={styles.itemIcon}>{item.icon}</div>
                  <div>
                    <div style={styles.itemLabel}>{item.label}</div>
                    <div style={styles.itemValue}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section style={styles.formCard}>
            {sent ? (
              <div className="acc-note" role="status">
                ✅ <b>Message envoyé !</b> Nous revenons vers vous rapidement.
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.twoCols}>
                  <label style={styles.label}>
                    NOM *
                    <input style={styles.input} name="nom" placeholder="Votre nom" required />
                  </label>

                  <label style={styles.label}>
                    PRÉNOM *
                    <input
                      style={styles.input}
                      name="prenom"
                      placeholder="Votre prénom"
                      required
                    />
                  </label>
                </div>

                <div style={styles.twoCols}>
                  <label style={styles.label}>
                    EMAIL *
                    <input
                      style={styles.input}
                      type="email"
                      name="email"
                      placeholder="Votre email"
                      required
                    />
                  </label>

                  <label style={styles.label}>
                    TÉLÉPHONE
                    <input
                      style={styles.input}
                      type="tel"
                      name="phone"
                      placeholder="Votre numéro"
                    />
                  </label>
                </div>

                <label style={styles.label}>
                  SUJET *
                  <select style={styles.input} name="sujet" required defaultValue="">
                    <option value="" disabled>
                      Sélectionnez le sujet
                    </option>
                    <option>Direction technique</option>
                    <option>Mentorat & Formation</option>
                    <option>Scouting vidéo</option>
                    <option>Accompagnement joueur</option>
                    <option>Consulting club</option>
                    <option>Autre demande</option>
                  </select>
                </label>

                <label style={styles.label}>
                  MESSAGE *
                  <textarea
                    style={styles.textarea}
                    name="message"
                    rows={5}
                    placeholder="Décrivez votre projet, vos besoins, vos objectifs..."
                    required
                  />
                </label>

                <button type="submit" style={styles.button} disabled={sending}>
                  {sending ? "ENVOI EN COURS..." : "🚀 ENVOYER MA DEMANDE"}
                </button>
              </form>
            )}
          </section>
        </div>

        <div style={styles.reassuranceGrid}>
          {REASSURANCE.map((item) => (
            <article key={item.title} style={styles.reassuranceCard}>
              <div style={styles.reassuranceIcon}>{item.icon}</div>
              <div>
                <h3 style={styles.reassuranceTitle}>{item.title}</h3>
                <div style={styles.smallRuleLeft} />
                <p style={styles.reassuranceText}>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#fffaf2",
    padding: "55px 20px 80px",
  },
  container: {
    maxWidth: "1180px",
    margin: "0 auto",
  },
  subtitle: {
    maxWidth: "720px",
    margin: "0 auto 40px",
    textAlign: "center",
    fontSize: "1.05rem",
    lineHeight: 1.7,
    color: "#333",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "0.95fr 1.65fr",
    gap: "28px",
    alignItems: "stretch",
  },
  contactCard: {
    position: "relative",
    background: "#fff7ea",
    border: "1px solid rgba(199, 144, 44, .45)",
    borderRadius: "18px",
    padding: "42px 38px",
    boxShadow: "0 18px 45px rgba(0,0,0,.07)",
  },
  roundIcon: {
    width: "95px",
    height: "95px",
    margin: "-15px auto 25px",
    borderRadius: "999px",
    border: "2px solid #c7902c",
    display: "grid",
    placeItems: "center",
    fontSize: "2.4rem",
    background: "#fffaf2",
  },
  cardTitle: {
    textAlign: "center",
    fontSize: "1.9rem",
    margin: 0,
    textTransform: "uppercase",
    fontWeight: 900,
  },
  smallRule: {
    width: "55px",
    height: "3px",
    background: "#c7902c",
    margin: "16px auto 28px",
  },
  contactList: {
    display: "grid",
    gap: "18px",
  },
  contactItem: {
    display: "grid",
    gridTemplateColumns: "44px 1fr",
    gap: "14px",
    alignItems: "center",
    borderBottom: "1px solid rgba(0,0,0,.08)",
    paddingBottom: "16px",
  },
  itemIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    background: "#111",
    color: "white",
    display: "grid",
    placeItems: "center",
  },
  itemLabel: {
    color: "#9a6d20",
    fontWeight: 900,
    fontSize: ".78rem",
    letterSpacing: ".04em",
  },
  itemValue: {
    marginTop: "3px",
    fontWeight: 700,
    color: "#111",
  },
  formCard: {
    background: "white",
    borderRadius: "18px",
    padding: "38px",
    boxShadow: "0 18px 45px rgba(0,0,0,.08)",
    border: "1px solid rgba(0,0,0,.08)",
  },
  form: {
    display: "grid",
    gap: "22px",
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "22px",
  },
  label: {
    display: "grid",
    gap: "8px",
    fontWeight: 900,
    fontSize: ".85rem",
    color: "#111",
  },
  input: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "15px 16px",
    fontSize: "1rem",
    background: "white",
  },
  textarea: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "15px 16px",
    fontSize: "1rem",
    resize: "vertical",
    background: "white",
  },
  button: {
    width: "100%",
    border: "none",
    borderRadius: "12px",
    background: "#111",
    color: "white",
    padding: "18px",
    fontWeight: 900,
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: "inset 0 -3px 0 #c7902c",
  },
  reassuranceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "22px",
    marginTop: "28px",
  },
  reassuranceCard: {
    background: "#fff7ea",
    borderRadius: "18px",
    padding: "30px",
    display: "grid",
    gridTemplateColumns: "60px 1fr",
    gap: "18px",
    boxShadow: "0 15px 35px rgba(0,0,0,.06)",
  },
  reassuranceIcon: {
    fontSize: "2.2rem",
    color: "#c7902c",
  },
  reassuranceTitle: {
    margin: 0,
    textTransform: "uppercase",
    fontSize: "1.1rem",
  },
  smallRuleLeft: {
    width: "35px",
    height: "2px",
    background: "#c7902c",
    margin: "10px 0",
  },
  reassuranceText: {
    margin: 0,
    lineHeight: 1.6,
    color: "#444",
  },
};