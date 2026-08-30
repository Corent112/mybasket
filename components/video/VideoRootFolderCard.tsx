"use client";

/**
 * components/video/VideoRootFolderCard.tsx
 * ---------------------------------------------------------------------------
 * Un seul endroit pour tout comprendre : où sont rangées les vidéos, et si le
 * navigateur courant y a accès.
 *
 * Deux notions volontairement distinctes :
 *  - le DOSSIER DÉCLARÉ, enregistré sur le compte : identique sur Chrome, Edge
 *    ou Safari, et sur toutes tes machines ;
 *  - l'AUTORISATION du navigateur, forcément locale (sécurité du système de
 *    fichiers). Là où l'API existe, la vidéo se recharge toute seule ; ailleurs,
 *    on affiche le chemin exact pour aller droit au fichier.
 */

import { useEffect, useState } from "react";
import VideoLibraryButton from "@/components/video/VideoLibraryButton";
import { getVideoRootFolder, readCachedVideoRootFolder, setVideoRootFolder } from "@/lib/video/video-root-folder";

const PLACEHOLDER = "~/Movies/MyBasket";

export default function VideoRootFolderCard() {
  const [value, setValue] = useState(readCachedVideoRootFolder());
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "error">("idle");

  useEffect(() => {
    let active = true;
    void getVideoRootFolder().then((folder) => {
      if (active && folder) setValue(folder);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaved("saving");
    const ok = await setVideoRootFolder(value);
    setSaved(ok ? "ok" : "error");
    window.setTimeout(() => setSaved("idle"), 2500);
  };

  return (
    <section className="vrf">
      <h2>Vidéos de match</h2>

      <label className="vrf-lab" htmlFor="vrf-input">
        Le dossier racine des matchs est ici
      </label>

      <div className="vrf-row">
        <input
          id="vrf-input"
          className="vrf-input"
          value={value}
          placeholder={PLACEHOLDER}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
        />
        <button type="button" className="vrf-save" onClick={save} disabled={saved === "saving"}>
          {saved === "saving" ? "…" : "Enregistrer"}
        </button>
      </div>

      {saved === "ok" && <p className="vrf-note ok">✓ Dossier enregistré sur ton compte.</p>}
      {saved === "error" && <p className="vrf-note err">Enregistrement impossible. Réessaie.</p>}

      <p className="vrf-note">
        Range toutes tes vidéos de match dans ce dossier. Tu peux créer des
        sous-dossiers par saison ou par équipe : l’autorisation couvre tout
        l’arbre. Ce chemin est enregistré sur ton compte, donc il reste le même
        quel que soit le navigateur et la machine.
      </p>

      <div className="vrf-access">
        <span className="vrf-access-title">Accès depuis ce navigateur</span>
        <VideoLibraryButton />
        <p className="vrf-note">
          L’autorisation d’accès à un dossier ne peut pas être partagée entre
          navigateurs : c’est une sécurité du système. Là où elle est possible,
          la vidéo se recharge sans rien te demander ; sinon MyBasket t’indique
          le fichier exact à désigner.
        </p>
      </div>

      <style jsx>{`
        .vrf {
          border: 1px solid #e4e4e4;
          border-radius: 18px;
          padding: 1.4rem;
          background: #fff;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
          max-width: 720px;
        }
        .vrf h2 {
          font-weight: 900;
          font-size: 1.25rem;
          margin: 0 0 1rem;
          border-bottom: 2px solid #eee;
          padding-bottom: 0.6rem;
        }
        .vrf-lab {
          display: block;
          font-weight: 900;
          text-transform: uppercase;
          font-size: 0.78rem;
          letter-spacing: 0.03em;
          margin-bottom: 0.4rem;
        }
        .vrf-row {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .vrf-input {
          flex: 1 1 260px;
          border: 1px solid #d6d6d6;
          border-radius: 10px;
          padding: 0.7rem 0.9rem;
          font-size: 0.95rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .vrf-input:focus {
          outline: 2px solid #6b1a2c;
          border-color: #6b1a2c;
        }
        .vrf-save {
          border: 2px solid #0f0f12;
          background: #0f0f12;
          color: #fff;
          border-radius: 999px;
          padding: 0.65rem 1.2rem;
          font-weight: 800;
          cursor: pointer;
        }
        .vrf-save:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .vrf-note {
          margin: 0.55rem 0 0;
          color: #666;
          font-size: 0.85rem;
          line-height: 1.5;
        }
        .vrf-note.ok {
          color: #2f7a3f;
          font-weight: 600;
        }
        .vrf-note.err {
          color: #a12626;
          font-weight: 600;
        }
        .vrf-access {
          margin-top: 1.3rem;
          padding-top: 1rem;
          border-top: 1px dashed #e0e0e0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: center;
          text-align: center;
        }
        .vrf-access-title {
          font-weight: 900;
          text-transform: uppercase;
          font-size: 0.78rem;
          letter-spacing: 0.03em;
        }
      `}</style>
    </section>
  );
}
