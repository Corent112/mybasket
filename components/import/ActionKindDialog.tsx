"use client";

import { useEffect, useRef, useState } from "react";

export function ActionKindDialog({
  current, choices, receiver, receivers, onChange, onClose,
}: {
  current: string;
  choices: readonly { value: string; label: string }[];
  receiver?: string;
  receivers: readonly { value: string; label: string }[];
  onChange: (value: string, receiver: string) => void;
  onClose: () => void;
}) {
  const [action, setAction] = useState(current);
  const [target, setTarget] = useState(receiver ?? "");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog className="action-kind-dialog" ref={ref} aria-label="Modifier l’action" onCancel={onClose}
      style={{ position: "fixed", inset: 0, margin: "auto", height: "fit-content", maxHeight: "90dvh",
        overflowY: "auto", border: "1px solid #e1dad3", borderRadius: 22, padding: "1.4rem", boxShadow:"0 24px 100px #20091250", fontFamily:"system-ui, sans-serif",
        width: "min(440px, 92vw)", background: "#fff", color: "#271b1e" }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{ margin:0,color:"#6B1A2C",fontSize:21 }}>Modifier l’action</h3><button type="button" aria-label="Fermer" onClick={onClose} style={{border:0,background:"#f8f3f6",borderRadius:10,width:32,height:32,color:"#6b1a2c",cursor:"pointer"}}>×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: ".45rem" }}>
        {choices.map(choice => (
          <button key={choice.value} type="button" aria-pressed={choice.value === action}
            style={{ padding: "1rem .6rem", borderRadius: 12, border: "1px solid #e1d5dc",fontSize:14,fontWeight:750,
              background: choice.value === action ? "#6B1A2C" : "#fff",
              color: choice.value === action ? "#fff" : "#271b1e", cursor: "pointer" }}
            onClick={() => setAction(choice.value)}>{choice.label}</button>
        ))}
      </div>
      {action === "pass" && (
        <label style={{ display: "grid", gap: ".3rem", marginTop: ".75rem" }}>
          Destinataire de la passe
          <select value={target} onChange={event => setTarget(event.target.value)} style={{ padding: ".75rem", width: "100%",border:"1px solid #e1d5dc",borderRadius:10,background:"#fff",color:"#352630",fontSize:14 }}>
            <option value="">Point libre</option>
            {receivers.map(player => <option key={player.value} value={player.value}>{player.label}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: ".65rem", marginTop: "1.25rem", borderTop:"1px solid #eee5eb",paddingTop:18 }}>
        <button type="button" onClick={onClose} style={{border:"1px solid #e5dbe1",background:"white",padding:"12px 16px",borderRadius:11,color:"#75616e",fontWeight:700,cursor:"pointer"}}>Annuler</button>
        <button type="button" onClick={() => onChange(action, action === "pass" ? target : "")} style={{border:0,background:"#6b1a2c",color:"#fff",padding:"12px 20px",borderRadius:11,fontWeight:800,cursor:"pointer"}}>Appliquer</button>
      </div>
      <style>{`.action-kind-dialog::backdrop{background:#24101d80;backdrop-filter:blur(4px)}.action-kind-dialog button:focus-visible,.action-kind-dialog select:focus-visible{outline:3px solid #d4a24c;outline-offset:2px}`}</style>
    </dialog>
  );
}
