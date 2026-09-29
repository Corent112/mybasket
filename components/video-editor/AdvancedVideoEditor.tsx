"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DrawItem = {
  id: string;
  kind: "line" | "arrow" | "circle" | "text";
  x1: number; y1: number; x2: number; y2: number;
  color: string; width: number; text?: string;
  start: number; end: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  action: any;
  videoUrl: string | null;
  montageId: string;
  teamId: string;
  playerId: string;
  montageTitle: string;
  saveTarget?: "montage" | "match-action";
  onActionClipSaved?: (value: { actionId: string; start: number; end: number | null }) => void;
};

export default function AdvancedVideoEditor({
  open,
  onClose,
  action,
  videoUrl,
  montageId,
  teamId,
  playerId,
  montageTitle,
  saveTarget = "montage",
  onActionClipSaved,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const initialStart = () =>
    Number(action?.edited_clip_start ?? action?.resolved_clip_start ?? action?.clip_start ?? action?.video_time ?? 0);
  const initialEnd = () =>
    Number(action?.edited_clip_end ?? action?.resolved_clip_end ?? action?.clip_end ?? 0);

  const [start, setStart] = useState(initialStart());
  const [end, setEnd] = useState(initialEnd());
  const [freezeTime, setFreezeTime] = useState<number | null>(null);
  const [freezeDuration, setFreezeDuration] = useState(2);
  const [drawMode, setDrawMode] = useState<DrawItem["kind"]>("arrow");
  const [drawings, setDrawings] = useState<DrawItem[]>([]);
  const [color, setColor] = useState("#ffd34d");
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [exportUrl, setExportUrl] = useState<string>("");
  const [savedMessage, setSavedMessage] = useState("");
  const drag = useRef<{x:number;y:number}|null>(null);

  useEffect(() => {
    setStart(initialStart());
    setEnd(initialEnd());
    setFreezeTime(action?.freeze_time == null ? null : Number(action.freeze_time));
    setFreezeDuration(Number(action?.freeze_duration ?? 2));
    setDrawings(Array.isArray(action?.annotations) ? action.annotations : []);
    setSavedMessage("");
  }, [action]);

  useEffect(() => {
    if (!open || !videoUrl || !videoRef.current) return;
    const video = videoRef.current;
    const seek = () => {
      try { video.currentTime = Math.max(0, initialStart()); } catch {}
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => video.removeEventListener("loadedmetadata", seek);
  }, [open, videoUrl, action]);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const d of drawings) {
      ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.lineWidth = d.width;
      if (d.kind === "circle") {
        const radius = Math.hypot(d.x2-d.x1,d.y2-d.y1);
        ctx.beginPath(); ctx.arc(d.x1,d.y1,radius,0,Math.PI*2); ctx.stroke();
      } else if (d.kind === "text") {
        ctx.font = "bold 24px Arial"; ctx.fillText(d.text || "Texte", d.x1, d.y1);
      } else {
        ctx.beginPath(); ctx.moveTo(d.x1,d.y1); ctx.lineTo(d.x2,d.y2); ctx.stroke();
        if (d.kind === "arrow") {
          const a = Math.atan2(d.y2-d.y1,d.x2-d.x1); const s=14;
          ctx.beginPath(); ctx.moveTo(d.x2,d.y2);
          ctx.lineTo(d.x2-s*Math.cos(a-.5),d.y2-s*Math.sin(a-.5));
          ctx.lineTo(d.x2-s*Math.cos(a+.5),d.y2-s*Math.sin(a+.5));
          ctx.closePath(); ctx.fill();
        }
      }
    }
  }, [drawings, open]);

  if (!open) return null;

  const currentTime = () => Number(videoRef.current?.currentTime ?? start);
  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect=e.currentTarget.getBoundingClientRect();
    return {
      x:(e.clientX-rect.left)*(e.currentTarget.width/rect.width),
      y:(e.clientY-rect.top)*(e.currentTarget.height/rect.height)
    };
  };

  const previewClip = () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    try {
      video.currentTime = Math.max(0, Number(start) || 0);
      void video.play();
    } catch {}
  };

  async function saveEdits() {
    if (!action?.id) return alert("Action vidéo introuvable.");
    if (!Number.isFinite(start) || start < 0) return alert("Le début du clip est invalide.");
    if (!Number.isFinite(end) || end <= start) return alert("La fin doit être après le début du clip.");

    setBusy(true);
    setSavedMessage("");

    try {
      if (saveTarget === "match-action") {
        // SOURCE DE VÉRITÉ DU CLIP JOUEUR :
        // les bornes sont sauvegardées directement sur match_actions.
        // Elles seront donc retrouvées à la prochaine ouverture et réutilisées
        // par la fiche joueur / les montages qui lisent cette action.
        const { error } = await supabase
          .from("match_actions")
          .update({
            clip_start: start,
            clip_end: end,
          })
          .eq("id", action.id)
          .eq("team_id", teamId);

        if (error) throw error;

        onActionClipSaved?.({
          actionId: String(action.id),
          start,
          end,
        });
        setSavedMessage("Découpage sauvegardé ✓");
        return;
      }

      if (!montageId) return alert("Enregistre d’abord le montage.");
      const payload = {
        clip_start:start,
        clip_end:end || null,
        freeze_time:freezeTime,
        freeze_duration:freezeTime == null ? null : freezeDuration,
        annotations:drawings
      };
      const { error } = await supabase
        .from("livestat_montage_items")
        .update(payload)
        .eq("montage_id",montageId)
        .eq("action_id",action.id);
      if (error) throw error;
      setSavedMessage("Modifications enregistrées ✓");
    } catch (error: any) {
      alert(error?.message || "Impossible d'enregistrer le découpage.");
    } finally {
      setBusy(false);
    }
  }

  async function renderMp4() {
    if (!montageId) return alert("Enregistre d’abord le montage.");
    setBusy(true);
    const res = await fetch("/api/montages/render", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({montageId})
    });
    const data = await res.json(); setBusy(false);
    if (!res.ok) return alert(data.error || "Rendu impossible");
    alert("Rendu lancé. Le MP4 sera disponible dès la fin du traitement.");
  }

  async function refreshExport() {
    const { data } = await supabase.from("livestat_montages").select("export_url").eq("id",montageId).maybeSingle();
    setExportUrl(data?.export_url || ""); setShareOpen(true);
  }

  function share(kind:"mail"|"whatsapp"|"native"|"copy") {
    const url=exportUrl; if(!url) return alert("Le MP4 n’est pas encore disponible.");
    const text=`${montageTitle} - ${url}`;
    if(kind==="mail") location.href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(montageTitle)}&body=${encodeURIComponent(text)}`;
    if(kind==="whatsapp") window.open(`https://wa.me/${recipient.replace(/\D/g,"")}?text=${encodeURIComponent(text)}`,"_blank");
    if(kind==="copy") navigator.clipboard.writeText(url);
    if(kind==="native" && navigator.share) navigator.share({title:montageTitle,text:montageTitle,url});
  }

  const actionMode = saveTarget === "match-action";

  return <div className="ave-bg" onClick={onClose}><div className="ave" onClick={e=>e.stopPropagation()}>
    <header>
      <div>
        <b>Éditeur vidéo</b>
        <span>{actionMode ? "Définir précisément le début et la fin du clip" : "Rogner · Dessiner · Arrêt sur image · Exporter"}</span>
      </div>
      <button onClick={onClose}>×</button>
    </header>
    <div className="ave-grid">
      <section>
        <div className="ave-stage">
          {videoUrl ? <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            onTimeUpdate={(e) => {
              if (end > start && e.currentTarget.currentTime >= end) e.currentTarget.pause();
            }}
          /> : <div className="ave-empty">Vidéo non synchronisée</div>}
          {!actionMode && <canvas ref={canvasRef} width={960} height={540}
            onPointerDown={e=>drag.current=pointer(e)}
            onPointerUp={e=>{
              if(!drag.current)return;
              const p=pointer(e),s=drag.current;drag.current=null;
              const text=drawMode==="text"?prompt("Texte à afficher")||"Texte":undefined;
              setDrawings(v=>[...v,{id:crypto.randomUUID(),kind:drawMode,x1:s.x,y1:s.y,x2:p.x,y2:p.y,color,width:5,text,start:currentTime(),end:currentTime()+3}])
            }}
          />}
        </div>
        {actionMode ? (
          <div className="ave-player-help">
            <b>Clip de la fiche joueur</b>
            <span>Place la vidéo au bon endroit puis utilise « Ici » pour le début et la fin. La vidéo originale n'est jamais modifiée.</span>
          </div>
        ) : (
          <div className="ave-tools">
            <button onClick={()=>setDrawMode("arrow")} className={drawMode==="arrow"?"on":""}>➜ Flèche</button>
            <button onClick={()=>setDrawMode("line")} className={drawMode==="line"?"on":""}>╱ Trait</button>
            <button onClick={()=>setDrawMode("circle")} className={drawMode==="circle"?"on":""}>◯ Cercle</button>
            <button onClick={()=>setDrawMode("text")} className={drawMode==="text"?"on":""}>T Texte</button>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)}/>
            <button onClick={()=>setDrawings(v=>v.slice(0,-1))}>↶</button>
            <button onClick={()=>setDrawings([])}>Effacer</button>
          </div>
        )}
      </section>
      <aside>
        <h3>Découpage</h3>
        <div className="ave-cut">
          <span>Début du clip</span>
          <input type="number" min="0" step="0.1" value={start} onChange={e=>setStart(Number(e.target.value))}/>
          <button onClick={()=>setStart(currentTime())}>⏱ Ici = début</button>
        </div>
        <div className="ave-cut">
          <span>Fin du clip</span>
          <input type="number" min="0" step="0.1" value={end} onChange={e=>setEnd(Number(e.target.value))}/>
          <button onClick={()=>setEnd(currentTime())}>⏱ Ici = fin</button>
        </div>
        <button onClick={previewClip} disabled={!videoUrl || end <= start}>▶ Prévisualiser le clip</button>
        <div className="ave-duration">Durée : <b>{end > start ? (end-start).toFixed(1) : "0.0"} s</b></div>

        {!actionMode && <>
          <h3>Arrêt sur image</h3>
          <button onClick={()=>setFreezeTime(currentTime())}>📸 Créer à {currentTime().toFixed(1)} s</button>
          {freezeTime!=null && <label>Durée<input type="number" min="0.5" step="0.5" value={freezeDuration} onChange={e=>setFreezeDuration(Number(e.target.value))}/><button onClick={()=>setFreezeTime(null)}>Supprimer</button></label>}
          <h3>Montage</h3>
        </>}

        <button className="gold" disabled={busy || !videoUrl || end <= start} onClick={saveEdits}>
          {busy ? "Sauvegarde…" : actionMode ? "✓ Sauvegarder ce clip" : "Enregistrer les modifications"}
        </button>
        {savedMessage && <div className="ave-saved">{savedMessage}</div>}

        {!actionMode && <>
          <button disabled={busy} onClick={renderMp4}>🎬 Générer le MP4</button>
          <button onClick={refreshExport}>↗ Partager</button>
        </>}
      </aside>
    </div>
    {!actionMode && shareOpen && <div className="ave-share"><h3>Envoyer le montage</h3><input placeholder="E-mail ou téléphone" value={recipient} onChange={e=>setRecipient(e.target.value)}/><div><button onClick={()=>share("mail")}>E-mail</button><button onClick={()=>share("whatsapp")}>WhatsApp</button><button onClick={()=>share("copy")}>Copier le lien</button><button onClick={()=>share("native")}>Partager</button></div></div>}
    <style jsx>{`.ave-bg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:20px}.ave{width:min(1200px,96vw);max-height:94vh;overflow:auto;background:#141112;color:#fff;border:1px solid #4a3b3d;border-radius:18px;box-shadow:0 30px 90px #000}.ave header{display:flex;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #31282a}.ave header span{display:block;color:#a99b9e;font-size:12px}.ave header button{border:0;background:#2a2224;color:#fff;width:34px;height:34px;border-radius:50%;font-size:22px}.ave-grid{display:grid;grid-template-columns:1fr 300px;gap:16px;padding:16px}.ave-stage{position:relative;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden}.ave-stage video,.ave-stage canvas{position:absolute;inset:0;width:100%;height:100%}.ave-stage canvas{z-index:2;touch-action:none}.ave-empty{display:grid;place-items:center;height:100%;color:#aaa}.ave-tools{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ave-tools button,.ave aside button,.ave-share button{background:#262022;color:#fff;border:1px solid #493d40;border-radius:8px;padding:9px 11px;font-weight:800;cursor:pointer}.ave-tools button.on,.ave aside button.gold{background:#d4a24c;color:#1e191a}.ave aside{display:grid;align-content:start;gap:10px}.ave aside h3{margin:8px 0 0;color:#efbd58}.ave aside label{display:grid;grid-template-columns:1fr 90px;gap:7px;align-items:center;font-size:12px}.ave aside input,.ave-share input{background:#211b1d;border:1px solid #4b3f41;color:#fff;border-radius:8px;padding:9px}.ave aside label button{grid-column:1/-1}.ave-share{margin:0 16px 16px;padding:15px;background:#201a1c;border-radius:12px}.ave-share div{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ave-player-help{display:grid;gap:4px;margin-top:10px;padding:10px 12px;border:1px solid #3d3234;background:#1d1819;border-radius:10px}.ave-player-help b{color:#efbd58}.ave-player-help span{font-size:12px;color:#b9aca4;line-height:1.4}.ave-cut{display:grid;grid-template-columns:1fr 88px;gap:7px;align-items:center;padding:10px;background:#1d1819;border:1px solid #352c2e;border-radius:10px}.ave-cut span{font-size:12px;font-weight:800}.ave-cut input{width:88px}.ave-cut button{grid-column:1/-1}.ave-duration{padding:8px 10px;background:#211b1d;border-radius:8px;color:#b9aca4;font-size:12px}.ave-duration b{color:#fff}.ave-saved{padding:8px 10px;border-radius:8px;background:rgba(65,173,106,.16);color:#7be0a4;font-size:12px;font-weight:800;text-align:center}@media(max-width:850px){.ave-grid{grid-template-columns:1fr}}`}</style>
  </div></div>;
}
