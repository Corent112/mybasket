"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ContactModal from "@/components/annonces/contactModal";

type Annonce = {
  id: string;
  titre: string;
  description: string;
  type?: string;
  categorie?: string;
  ville?: string;
  club?: string;
  date?: string;
  auteurNom: string;
  auteurEmail?: string;
};

const STORAGE_KEY = "mybasket_annonces";

function fallbackAnnonce(id: string): Annonce {
  return {
    id,
    titre: "Annonce MyBasket",
    description: "Aucune description disponible.",
    type: "Annonce",
    categorie: "Basketball",
    ville: "",
    club: "",
    date: new Date().toISOString(),
    auteurNom: "Utilisateur MyBasket",
    auteurEmail: "",
  };
}

function getAnnonce(id: string): Annonce | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(list)) return null;

    const found = list.find((a: any) => String(a.id) === String(id));

    if (!found) return null;

    return {
      id: String(found.id),
      titre: found.titre || found.title || "Annonce MyBasket",
      description: found.description || found.desc || "",
      type: found.type || "",
      categorie: found.categorie || found.category || "",
      ville: found.ville || found.city || "",
      club: found.club || "",
      date: found.date || found.createdAt || new Date().toISOString(),
      auteurNom:
        found.auteurNom ||
        found.authorName ||
        found.nom ||
        found.userName ||
        "Utilisateur MyBasket",
      auteurEmail: found.auteurEmail || found.email || "",
    };
  } catch {
    return null;
  }
}

export default function AnnonceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;

    const data = getAnnonce(id);
    setAnnonce(data || fallbackAnnonce(id));
    setReady(true);
  }, [id]);

  const formattedDate = useMemo(() => {
    if (!annonce?.date) return "—";

    try {
      return new Date(annonce.date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }, [annonce]);

  if (!ready) {
    return (
      <main className="ad-page">
        <style>{CSS}</style>
        <p>Chargement...</p>
      </main>
    );
  }

  if (!annonce) {
    return (
      <main className="ad-page">
        <style>{CSS}</style>

        <button className="ad-back" onClick={() => router.push("/annonces")}>
          ← Retour aux annonces
        </button>

        <div className="ad-empty">
          <h1>Annonce introuvable</h1>
          <p>Cette annonce n’existe plus ou n’est pas disponible.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="ad-page">
      <style>{CSS}</style>

      <button className="ad-back" onClick={() => router.push("/annonces")}>
        ← Retour aux annonces
      </button>

      <section className="ad-hero">
        <div>
          <span className="ad-kicker">ANNONCE MYBASKET</span>
          <h1>{annonce.titre}</h1>

          <div className="ad-tags">
            {annonce.type && <span>{annonce.type}</span>}
            {annonce.categorie && <span>{annonce.categorie}</span>}
            {annonce.ville && <span>{annonce.ville}</span>}
          </div>
        </div>

        <button className="ad-contact" onClick={() => setContactOpen(true)}>
          💬 Contacter
        </button>
      </section>

      <section className="ad-layout">
        <article className="ad-card">
          <h2>Description</h2>
          <p>{annonce.description || "Aucune description renseignée."}</p>
        </article>

        <aside className="ad-card ad-side">
          <h2>Informations</h2>

          <div className="ad-row">
            <span>Auteur</span>
            <b>{annonce.auteurNom}</b>
          </div>

          <div className="ad-row">
            <span>Club</span>
            <b>{annonce.club || "—"}</b>
          </div>

          <div className="ad-row">
            <span>Ville</span>
            <b>{annonce.ville || "—"}</b>
          </div>

          <div className="ad-row">
            <span>Date</span>
            <b>{formattedDate}</b>
          </div>

          <button className="ad-side-btn" onClick={() => setContactOpen(true)}>
            Je suis intéressé
          </button>
        </aside>
      </section>

      {contactOpen && (
        <ContactModal
          type="annonce"
          sujet={`Annonce : ${annonce.titre}`}
          annonceId={annonce.id}
          annonceTitre={annonce.titre}
          destinataireNom={annonce.auteurNom}
          onClose={() => setContactOpen(false)}
        />
      )}
    </main>
  );
}

const CSS = `
.ad-page{
  max-width:1280px;
  margin:0 auto;
  padding:1.6rem;
  font-family:'Roboto',system-ui,sans-serif;
  color:#0F0F12;
}

.ad-back{
  border:2px solid #0F0F12;
  background:#fff;
  border-radius:999px;
  padding:.55rem 1.1rem;
  font-weight:900;
  cursor:pointer;
  margin-bottom:1.3rem;
}

.ad-back:hover{
  background:#0F0F12;
  color:#fff;
}

.ad-hero{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1.5rem;
  border-radius:24px;
  padding:2rem;
  background:linear-gradient(135deg,#0F0F12,#261019);
  color:#fff;
  margin-bottom:1.5rem;
}

.ad-kicker{
  color:#D4A24C;
  font-size:.8rem;
  font-weight:900;
  letter-spacing:.08em;
}

.ad-hero h1{
  margin:.4rem 0 1rem;
  font-size:2.6rem;
  line-height:1;
  font-weight:1000;
  text-transform:uppercase;
}

.ad-tags{
  display:flex;
  flex-wrap:wrap;
  gap:.5rem;
}

.ad-tags span{
  background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.22);
  padding:.35rem .7rem;
  border-radius:999px;
  font-size:.85rem;
  font-weight:800;
}

.ad-contact,
.ad-side-btn{
  border:none;
  background:#D4A24C;
  color:#111;
  border-radius:999px;
  padding:.9rem 1.4rem;
  font-weight:1000;
  cursor:pointer;
  white-space:nowrap;
}

.ad-contact:hover,
.ad-side-btn:hover{
  background:#f0bc5d;
}

.ad-layout{
  display:grid;
  grid-template-columns:1fr 340px;
  gap:1.4rem;
  align-items:start;
}

.ad-card{
  border:1px solid #e6e6e6;
  border-radius:18px;
  background:#fff;
  padding:1.4rem;
  box-shadow:0 8px 24px rgba(0,0,0,.045);
}

.ad-card h2{
  margin:0 0 1rem;
  font-size:1.1rem;
  font-weight:1000;
  text-transform:uppercase;
}

.ad-card h2:after{
  content:"";
  display:block;
  width:52px;
  height:3px;
  background:#D4A24C;
  margin-top:8px;
}

.ad-card p{
  white-space:pre-line;
  line-height:1.7;
  color:#333;
}

.ad-side{
  position:sticky;
  top:1rem;
}

.ad-row{
  display:flex;
  justify-content:space-between;
  gap:1rem;
  border-bottom:1px solid #eee;
  padding:.9rem 0;
}

.ad-row span{
  text-transform:uppercase;
  font-weight:900;
  color:#555;
  font-size:.8rem;
}

.ad-row b{
  text-align:right;
}

.ad-side-btn{
  width:100%;
  margin-top:1.2rem;
}

.ad-empty{
  border:1px solid #eee;
  border-radius:18px;
  padding:2rem;
}

@media(max-width:900px){
  .ad-hero,
  .ad-layout{
    grid-template-columns:1fr;
  }

  .ad-hero{
    flex-direction:column;
    align-items:flex-start;
  }

  .ad-contact{
    width:100%;
  }

  .ad-hero h1{
    font-size:2rem;
  }
}
`;