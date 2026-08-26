"use client";

type AuditItem = {
  label: string;
  detail: string;
  target: string;
};

const ITEMS: AuditItem[] = [
  { label: "Équipes & staff", detail: "Coachs liés, rôles et accès par équipe.", target: "teams" },
  { label: "Calendrier", detail: "Événements, équipes et destinataires.", target: "calendar" },
  { label: "Convocations", detail: "Présents, absents et réponses en attente.", target: "convocations" },
  { label: "Communication", detail: "Ciblage, modèles et identité du club.", target: "communication" },
  { label: "Cotisations", detail: "Paiements, retards et relances.", target: "cotisations" },
  { label: "Performance", detail: "Indicateurs et suivi du club.", target: "performance" },
];

export default function ClubDashboardAuditCards({
  onNavigate,
}: {
  onNavigate?: (target: string) => void;
}) {
  return (
    <section className="auditCards">
      <div className="auditHead">
        <div>
          <p>PILOTAGE</p>
          <h3>Raccourcis de gestion</h3>
        </div>
        <span>Accès direct aux points clés du club</span>
      </div>
      <div className="auditGrid">
        {ITEMS.map((item) => (
          <button key={item.target} onClick={() => onNavigate?.(item.target)}>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
            <b>Ouvrir →</b>
          </button>
        ))}
      </div>
      <style jsx>{`
        .auditCards{min-width:0;background:#fff;border:1px solid #e9e2dc;border-radius:16px;padding:18px}
        .auditHead{display:flex;justify-content:space-between;gap:14px;align-items:end}
        .auditHead p{margin:0;color:var(--club-secondary);font-size:.7rem;font-weight:1000;letter-spacing:.12em}
        .auditHead h3{margin:4px 0 0}.auditHead span{color:#777;font-size:.76rem;font-weight:750}
        .auditGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:15px}
        button{min-width:0;text-align:left;border:1px solid #ece5df;background:#fff;border-radius:12px;padding:13px;cursor:pointer}
        button:hover{border-color:var(--club-secondary);box-shadow:0 5px 16px rgba(0,0,0,.05)}
        strong,small,b{display:block;overflow-wrap:anywhere}strong{color:#222}small{color:#777;margin:5px 0 10px;line-height:1.35}b{color:var(--club-primary);font-size:.72rem}
        @media(max-width:900px){.auditGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:560px){.auditHead{display:grid;align-items:start}.auditGrid{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
