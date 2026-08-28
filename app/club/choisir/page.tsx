"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ChoisirClubPage() {
  const router = useRouter();
  const [clubName, setClubName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = clubName.trim();
    if (!value) return;
    try {
      window.sessionStorage.setItem("mybasket_club_search", value);
    } catch {}
    router.push("/club");
  }

  return (
    <main className="page">
      <form className="card" onSubmit={submit}>
        <div className="mark">🏀</div>
        <div className="overline">MYBASKET · ESPACE CLUB</div>
        <h1>Accéder à mon club</h1>
        <p>Entre le nom du club pour accéder à ton espace.</p>

        <label>
          <span>Nom du club</span>
          <input
            autoFocus
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="Nom du club"
            autoComplete="organization"
          />
        </label>

        <button type="submit" disabled={!clubName.trim()}>
          Continuer
        </button>

        <button type="button" className="back" onClick={() => router.back()}>
          Retour
        </button>
      </form>

      <style jsx>{`
        .page{min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f0ec}
        .card{width:min(100%,480px);background:#fff;border:1px solid #eaded8;border-radius:24px;padding:34px;box-shadow:0 20px 55px rgba(70,31,40,.09)}
        .mark{width:58px;height:58px;margin:0 auto 12px;border-radius:18px;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-size:27px}
        .overline{text-align:center;color:#d4a24c;font-size:10px;font-weight:900;letter-spacing:.13em}
        h1{text-align:center;color:#4b1522;font-size:28px;margin:8px 0 5px}
        p{text-align:center;color:#88767b;font-size:13px;margin:0 0 26px}
        label{display:grid;gap:8px;color:#5b474c;font-size:13px;font-weight:800}
        input{height:50px;border:1px solid #d8cbc7;border-radius:13px;padding:0 14px;font-size:16px;outline:none}
        input:focus{border-color:#6b1a2c;box-shadow:0 0 0 3px rgba(107,26,44,.08)}
        button[type="submit"]{width:100%;height:49px;margin-top:15px;border:0;border-radius:13px;background:#6b1a2c;color:#fff;font-size:15px;font-weight:900;cursor:pointer}
        button[type="submit"]:disabled{opacity:.4;cursor:not-allowed}
        .back{width:100%;padding:12px;border:0;background:transparent;color:#8a787d;font-weight:800;cursor:pointer}
      `}</style>
    </main>
  );
}
