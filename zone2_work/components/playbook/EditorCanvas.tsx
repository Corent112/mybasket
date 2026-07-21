"use client";

import { useEffect, useRef } from "react";
import Header from "@/components/Header";

export default function PlaquettePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 900;
    canvas.height = 704;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#E8B96B";
    ctx.fillRect(0, 0, 900, 704);

    ctx.strokeStyle = "white";
    ctx.lineWidth = 6;

    ctx.strokeRect(30, 30, 840, 644);

    ctx.beginPath();
    ctx.moveTo(30, 674);
    ctx.lineTo(870, 674);
    ctx.stroke();

    ctx.strokeRect(330, 30, 240, 280);

    ctx.beginPath();
    ctx.arc(450, 310, 80, 0, Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(450, 674, 90, Math.PI, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(170, 30);
    ctx.lineTo(170, 210);
    ctx.arc(450, 210, 280, Math.PI, 0);
    ctx.lineTo(730, 30);
    ctx.stroke();

    ctx.strokeStyle = "#E8743C";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(450, 70, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "white";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(390, 45);
    ctx.lineTo(510, 45);
    ctx.stroke();
  }, []);

  return (
    <>
      <Header />

      <section style={{ background: "#F0EBE3", minHeight: "80vh" }}>
        <div className="ed-toolbar">
          <button className="ed-tool active">✏️<span>Draw</span></button>
          <button className="ed-tool">▶️<span>Animate</span></button>
          <button className="ed-tool">📝<span>Notes</span></button>
          <input className="ed-title" defaultValue="Nouvelle plaquette" />
          <button className="ed-save">💾 Save</button>
        </div>

        <div className="ed-layout">
          <aside className="ed-left">
            <div className="ed-tabs">
              <button className="ed-tab active">Phases</button>
              <button className="ed-tab">Mes plays</button>
            </div>

            <p className="ph-counter">PHASE 1 / 1</p>

            <div className="ph-actions">
              <button className="ph-act">➕<span>Next</span></button>
              <button className="ph-act">⧉<span>Clone</span></button>
              <button className="ph-act">🧽<span>Empty</span></button>
              <button className="ph-act">🗑<span>Del</span></button>
            </div>
          </aside>

          <main className="ed-canvas-wrap">
            <canvas
              ref={canvasRef}
              id="playCanvas"
              style={{
                width: "100%",
                maxWidth: 760,
                background: "#E8B96B",
                borderRadius: 8,
                boxShadow: "0 4px 20px rgba(0,0,0,.2)",
              }}
            />
          </main>

          <aside className="ed-right">
            <p className="sec-lab">Actions</p>

            <div className="actions-grid">
              <button className="act-btn active">➜ Passe</button>
              <button className="act-btn">✂ Cut</button>
              <button className="act-btn">〰 Dribble</button>
              <button className="act-btn">▌ Screen</button>
              <button className="act-btn">🎯 Shoot</button>
              <button className="act-btn">🏀 Give ball</button>
            </div>

            <p className="sec-lab">Joueurs</p>

            <div className="players-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="pl-btn s-circle">{n}</button>
              ))}
              <button className="pl-btn s-ball">●</button>
            </div>

            <div className="players-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="pl-btn s-defense">X{n}</button>
              ))}
              <button className="pl-btn">C</button>
            </div>

            <p className="sec-lab">Outils</p>

            <div className="misc-grid">
              <button className="misc-btn">🔺</button>
              <button className="misc-btn">■</button>
              <button className="misc-btn">●</button>
              <button className="misc-btn">T</button>
              <button className="misc-btn">↔</button>
              <button className="misc-btn">✏️</button>
              <button className="misc-btn">🧽</button>
            </div>
          </aside>
        </div>

        <div className="timeline">
          <button className="tl-btn">⏮</button>
          <button className="tl-btn">▶</button>
          <button className="tl-btn">⏹</button>
          <button className="tl-btn">⏭</button>
          <div className="tl-progress">
            <div className="tl-progress-bar" style={{ width: "20%" }} />
          </div>
          <span className="tl-status">Phase 1/1</span>
        </div>
      </section>
    </>
  );
}
