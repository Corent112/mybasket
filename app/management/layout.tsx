'use client';

/**
 * Layout du Management : fournit le contexte partagé (équipe + données) à toutes
 * les pages d'onglet, affiche l'en-tête (sélecteur d'équipe) + la navigation par
 * onglets (vraies routes), et porte le CSS global `.mg-*` commun à toutes les pages.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MgmtProvider, useMgmt, TABS } from '../../lib/management';

function Chrome({ children }: { children: React.ReactNode }) {
  const { teams, teamId, setTeamId } = useMgmt();
  const path = usePathname();
  const isActive = (href: string) => (href === '/management' ? path === '/management' : path.startsWith(href));
  return (
    <div className="mg-wrap">
      <header className="mg-head">
        <div><div className="mg-kick">MON COMPTE</div><h1>Management</h1></div>
        <select className="mg-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.cat ? ` (${t.cat})` : ''}</option>)}
        </select>
      </header>
      <nav className="mg-tabs">
        {TABS.map((t) => <Link key={t.id} href={t.href} className={`mg-tab ${isActive(t.href) ? 'on' : ''}`}>{t.label}</Link>)}
      </nav>
      <section className="mg-panel">{children}</section>
    </div>
  );
}

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.clearTimeout((flash as any)._t); (flash as any)._t = window.setTimeout(() => setToast(null), 1600); };
  return (
    <div className="mg-root">
      <MgmtProvider onToast={flash}><Chrome>{children}</Chrome></MgmtProvider>
      {toast && <div className="mg-toast">{toast}</div>}
      <style jsx global>{`
        .mg-root{--bordeaux:#9e1b32;--bordeaux2:#c12a44;--gold:#c79a3b;--ink:#1a1f2b;--mute:#6b7385;--line:#e6e8ee;--bg:#f4f5f8;--card:#fff;--green:#1f9d57;--red:#d5384c;
          min-height:100vh;background:var(--bg);color:var(--ink);font-family:'Roboto','Segoe UI',system-ui,sans-serif}
        .mg-root *{box-sizing:border-box}
        .mg-root button{font:inherit;cursor:pointer}
        .mg-root h1,.mg-root h2,.mg-root h3{font-family:'Oswald','Roboto',sans-serif;letter-spacing:.01em}
        .mg-wrap{max-width:1180px;margin:0 auto;padding:22px 18px 60px}
        .mg-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px}
        .mg-kick{font-size:11px;letter-spacing:.16em;color:var(--gold);font-weight:700}.mg-head h1{font-size:28px;margin:2px 0 0}
        .mg-team{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;color:var(--ink);min-width:230px}
        .mg-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
        .mg-tab{padding:9px 13px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:13px;font-weight:600;text-decoration:none}
        .mg-tab:hover{border-color:var(--gold)}.mg-tab.on{background:var(--bordeaux);border-color:var(--bordeaux);color:#fff}
        .mg-panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;box-shadow:0 8px 30px -22px #000;min-height:320px}
        .mg-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
        .mg-bar h2{font-size:19px;margin:0}.mg-bar h2 small,.mg-bar h3 small{font-weight:400;color:var(--mute);font-size:12.5px;margin-left:8px}
        .mg-steps{display:flex;gap:8px;flex-wrap:wrap;background:#faf7f1;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;color:var(--mute)}
        .mg-steps b{color:var(--bordeaux)}
        .mg-actions{display:flex;gap:8px;flex-wrap:wrap}
        .mg-btn{padding:9px 14px;border-radius:9px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:13px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
        .mg-btn:hover{border-color:var(--gold)}.mg-btn.primary{background:var(--bordeaux);border-color:var(--bordeaux);color:#fff}.mg-btn.primary:hover{background:var(--bordeaux2)}
        .mg-btn.danger{color:var(--red);border-color:#f0c6cc}.mg-btn.danger:hover{background:#fdecee}.mg-btn.big{padding:13px 22px;font-size:15px}
        .mg-btn.sm{padding:6px 10px;font-size:12px}
        .mg-tablewrap{overflow:auto;border:1px solid var(--line);border-radius:10px}
        .mg-table{width:100%;border-collapse:collapse;font-size:13px}
        .mg-table th,.mg-table td{padding:9px 8px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
        .mg-table th{background:#faf7f1;color:var(--bordeaux);font-family:'Oswald';font-weight:600;text-transform:uppercase;font-size:11px;position:sticky;top:0}
        .mg-table td.l,.mg-table th.l{text-align:left}
        .mg-table tbody tr:hover{background:#faf9f7}
        .mg-input td{padding:5px 6px}.mg-num{width:54px;padding:6px;border:1px solid var(--line);border-radius:6px;text-align:center;font-size:13px}
        .mg-input tr.off{opacity:.5}
        .mg-av{width:22px;height:22px;border-radius:50%;background:#eee;display:inline-grid;place-items:center;font-size:9px;font-weight:700;color:var(--bordeaux);object-fit:cover;margin-right:6px;vertical-align:middle}
        .mg-note{color:var(--mute);font-size:12.5px;margin:14px 0 0}
        .mg-cards{display:flex;gap:12px;flex-wrap:wrap}
        .mg-card{flex:1;min-width:140px;background:#faf7f1;border:1px solid var(--line);border-radius:11px;padding:14px}
        .mg-card-l{font-size:12px;color:var(--mute)}.mg-card-v{font-family:'Oswald';font-size:26px;font-weight:700;margin-top:2px}
        .mg-shoots{display:flex;flex-direction:column;gap:14px;margin-top:18px}
        .mg-shoot-h{display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:5px}
        .mg-bar2{height:10px;background:#eef0f4;border-radius:6px;overflow:hidden}.mg-bar2 i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--bordeaux))}
        .mg-shoot small{color:var(--mute);font-size:11.5px}
        .mg-live{display:grid;place-items:center;padding:24px}
        .mg-live-card{max-width:520px;text-align:center;background:linear-gradient(180deg,#fff,#fbf6ef);border:1px solid var(--line);border-radius:16px;padding:30px}
        .mg-live-ic{font-size:34px}.mg-live-card h2{font-size:22px;margin:8px 0}.mg-live-card p{color:var(--mute);font-size:14px;margin:0 0 16px}
        .mg-live-card small{display:block;color:var(--mute);font-size:11.5px;margin-top:10px}
        .mg-list{display:flex;flex-direction:column;gap:8px}
        .mg-row{display:flex;align-items:center;gap:12px;padding:11px 13px;background:#fff;border:1px solid var(--line);border-radius:10px}
        .mg-row-l{display:flex;align-items:center;gap:10px;flex:1;min-width:0;flex-wrap:wrap}
        .mg-tag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;text-transform:uppercase}.mg-tag.match{background:var(--bordeaux);color:#fff}.mg-tag.train{background:#e9edf3;color:var(--mute)}
        .mg-vs{color:var(--mute);font-size:13px}
        .mg-score{font-family:'Oswald';font-weight:700;font-size:16px;display:flex;align-items:center;gap:7px}.mg-score i{font-style:normal;font-size:11px;padding:2px 7px;border-radius:6px;color:#fff}
        .mg-score.w i{background:var(--green)}.mg-score.l i{background:var(--red)}.mg-score.d i{background:var(--mute)}
        .mg-x{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--mute);font-size:13px;flex-shrink:0}.mg-x:hover{border-color:var(--red);color:var(--red)}
        .mg-empty{color:var(--mute);font-size:13.5px;padding:18px;text-align:center}
        .mg-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin-bottom:14px}
        .mg-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--mute)}
        .mg-form input,.mg-form select,.mg-form textarea{background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 10px;font-size:14px;color:var(--ink);font-family:inherit}
        .mg-form .mg-btn{height:38px}.mg-scoreus{align-self:center;font-size:14px}
        .mg-time{display:flex;flex-direction:column;gap:9px}
        .mg-timerow{display:flex;align-items:center;gap:12px}.mg-timerow .nm{width:210px;font-size:13px;display:flex;align-items:center}.mg-timerow .mg-bar2{flex:1}.mg-timerow b{font-family:'Oswald';width:54px;text-align:right}
        .mg-pill{font-family:'Oswald';font-weight:700;padding:6px 11px;border-radius:8px;color:#fff;font-size:13px}.mg-pill.w{background:var(--green)}.mg-pill.l{background:var(--red)}.mg-pill.d{background:var(--mute)}
        .mg-form-line{display:flex;gap:8px;flex-wrap:wrap}
        .mg-textarea{width:100%;min-height:120px;border:1px solid var(--line);border-radius:11px;padding:12px;font-size:14px;font-family:inherit;resize:vertical;color:var(--ink)}
        .mg-links{display:flex;gap:10px;flex-wrap:wrap}.mg-link{padding:12px 16px;border:1px solid var(--line);border-radius:11px;background:#faf7f1;text-decoration:none;color:var(--ink);font-weight:600;font-size:13.5px}.mg-link:hover{border-color:var(--gold)}
        .mg-modal{position:fixed;inset:0;background:rgba(20,24,34,.55);display:grid;place-items:center;padding:18px;z-index:60}
        .mg-modal-card{width:min(980px,100%);max-height:92vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden}
        .mg-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}.mg-modal-head h3{margin:0;font-size:18px}
        .mg-modal-body{padding:16px 18px;overflow:auto}
        .mg-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid var(--line)}
        .mg-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;z-index:70}
        /* rotation */
        .mg-rotbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
        .mg-roster{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
        .mg-rchip{display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:13px}
        .mg-rchip.sel{border-color:var(--bordeaux);background:#fbeef0}.mg-rchip .mn{color:var(--mute);font-size:11px}
        .mg-qts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .mg-qt{border:1px solid var(--line);border-radius:11px;padding:10px;background:#faf7f1}
        .mg-qt h4{margin:0 0 8px;font-family:'Oswald';color:var(--bordeaux);font-size:14px;display:flex;justify-content:space-between;align-items:center}
        .mg-qt h4 input{width:48px;padding:3px 5px;border:1px solid var(--line);border-radius:6px;text-align:center;font-size:12px}
        .mg-slot{display:flex;align-items:center;gap:6px;min-height:38px;padding:6px 8px;border:1px dashed var(--line);border-radius:8px;background:#fff;margin-bottom:6px;font-size:13px;cursor:pointer}
        .mg-slot.filled{border-style:solid;border-color:var(--gold);background:#fffdf5}.mg-slot.empty{color:var(--mute)}
        .mg-slot:hover{border-color:var(--bordeaux)}
        @media(max-width:920px){.mg-qts{grid-template-columns:repeat(2,1fr)}.mg-timerow .nm{width:150px}}
        @media print{.mg-tabs,.mg-head .mg-team,.mg-actions,.mg-toast{display:none!important}.mg-panel{box-shadow:none;border:none}}
      `}</style>
    </div>
  );
}