"use client";

import type {ReactNode} from "react";

export default function TeamUnifiedChrome({children}:{children:ReactNode}){
  return (
    <div className="teamUnifiedChrome">
      {children}
      <style jsx global>{`
        :root{
          --team-ui-primary:#6B1A2C;
          --team-ui-secondary:#D4A24C;
          --team-ui-border:#eadfd8;
          --team-ui-bg:#f8f5f1;
        }

        body:has(.teamUnifiedChrome){background:var(--team-ui-bg)!important}

        .teamUnifiedChrome .tl-wrap{
          background:var(--team-ui-bg)!important;
          min-height:100vh!important;
          padding-left:278px!important;
        }

        .teamUnifiedChrome .tl-container{
          max-width:none!important;
          width:100%!important;
          margin:0!important;
          padding:0 28px 45px!important;
          min-width:0!important;
        }

        .teamUnifiedChrome .tl-appbar{
          height:72px!important;
          margin:0 -28px 22px!important;
          padding:0 28px!important;
          background:#fff!important;
          border-bottom:1px solid var(--team-ui-border)!important;
          border-radius:0!important;
          position:sticky!important;
          top:0!important;
          z-index:28!important;
          box-shadow:none!important;
        }

        .teamUnifiedChrome .tl-logo{
          color:var(--team-ui-primary)!important;
          font-weight:1000!important;
        }

        .teamUnifiedChrome .tl-logo .my,
        .teamUnifiedChrome .tl-logo .basket{
          color:var(--team-ui-primary)!important;
        }

        .teamUnifiedChrome .tl-season{
          border:1px solid #e7e0d9!important;
          background:#fff!important;
          border-radius:9px!important;
          padding:9px 13px!important;
          color:#55484c!important;
          font-size:.73rem!important;
        }

        /* Les vrais boutons de la fiche deviennent le menu latéral.
           Aucune logique n'est dupliquée : on déplace visuellement les boutons existants. */
        .teamUnifiedChrome .team-tabs{
          position:fixed!important;
          left:0!important;
          top:0!important;
          bottom:0!important;
          width:278px!important;
          height:100vh!important;
          z-index:45!important;
          margin:0!important;
          padding:130px 18px 86px!important;
          border:0!important;
          border-right:1px solid var(--team-ui-border)!important;
          border-radius:0!important;
          background:#fff!important;
          box-shadow:8px 0 28px rgba(56,31,23,.035)!important;
          display:flex!important;
          flex-direction:column!important;
          align-items:stretch!important;
          gap:6px!important;
          overflow-y:auto!important;
        }

        .teamUnifiedChrome .team-tabs::before{
          content:"MYBASKET";
          position:absolute;
          top:30px;
          left:46px;
          color:var(--team-ui-primary);
          font-size:28px;
          line-height:1;
          font-weight:1000;
          letter-spacing:.01em;
        }

        .teamUnifiedChrome .team-tabs::after{
          content:"ÉQUIPE";
          position:absolute;
          top:66px;
          left:72px;
          color:var(--team-ui-secondary);
          font-size:14px;
          line-height:1;
          font-weight:1000;
          letter-spacing:8px;
        }

        .teamUnifiedChrome .team-tabs button{
          width:100%!important;
          min-height:42px!important;
          flex:0 0 auto!important;
          justify-content:flex-start!important;
          gap:9px!important;
          margin:0!important;
          padding:0 14px!important;
          border:0!important;
          border-radius:12px!important;
          background:transparent!important;
          color:#42393c!important;
          font-size:14px!important;
          font-weight:800!important;
          white-space:normal!important;
          text-align:left!important;
          box-shadow:none!important;
        }

        .teamUnifiedChrome .team-tabs .team-back-tab{
          min-height:38px!important;
          margin:0 0 18px!important;
          border:1px solid rgba(107,26,44,.12)!important;
          background:#fffaf6!important;
          color:var(--team-ui-primary)!important;
          font-size:12px!important;
          font-weight:900!important;
        }

        .teamUnifiedChrome .team-tabs .team-back-tab:hover{
          background:#fbf0ea!important;
        }

        .teamUnifiedChrome .team-tabs .team-back-tab .team-back-arrow{
          display:none!important;
        }

        .teamUnifiedChrome .team-tabs button:hover{
          background:#fbf4f0!important;
          color:var(--team-ui-primary)!important;
        }

        .teamUnifiedChrome .team-tabs button.active{
          background:var(--team-ui-primary)!important;
          color:#fff!important;
          box-shadow:0 5px 14px rgba(107,26,44,.15)!important;
        }

        .teamUnifiedChrome .team-tabs button svg{
          flex:0 0 auto!important;
          color:currentColor!important;
        }

        .teamUnifiedChrome .team-tabs button svg{display:none!important}
        .teamUnifiedChrome .team-tabs button::before{width:18px;flex:0 0 18px;text-align:center;font-size:16px}
        .teamUnifiedChrome .team-tabs .team-back-tab::before{content:"←";font-size:18px;font-weight:1000}
        .teamUnifiedChrome .team-tabs button:nth-child(2)::before{content:"👥"}
        .teamUnifiedChrome .team-tabs button:nth-child(3)::before{content:"🗓️"}
        .teamUnifiedChrome .team-tabs button:nth-child(4)::before{content:"🧑"}
        .teamUnifiedChrome .team-tabs button:nth-child(5)::before{content:"📝"}
        .teamUnifiedChrome .team-tabs button:nth-child(6)::before{content:"🏀"}
        .teamUnifiedChrome .team-tabs button:nth-child(7)::before{content:"📈"}
        .teamUnifiedChrome .team-tabs button:nth-child(8)::before{content:"📁"}
        .teamUnifiedChrome .team-tabs button:nth-child(9)::before{content:"📅"}
        .teamUnifiedChrome .team-tabs button:nth-child(10)::before{content:"📊"}
        .teamUnifiedChrome .team-tabs button:nth-child(11)::before{content:"📋"}

        .teamUnifiedChrome .tl-hero{
          border-radius:14px!important;
          box-shadow:0 5px 20px rgba(57,34,25,.035)!important;
          border:1px solid var(--team-ui-border)!important;
        }

        .teamUnifiedChrome .tl-kpi-row{
          gap:9px!important;
        }

        .teamUnifiedChrome .tl-kpi,
        .teamUnifiedChrome .tl-card,
        .teamUnifiedChrome .tl-banner,
        .teamUnifiedChrome .game-stats-card,
        .teamUnifiedChrome .lineups-card{
          border-radius:14px!important;
          border-color:var(--team-ui-border)!important;
          box-shadow:0 5px 20px rgba(57,34,25,.035)!important;
        }

        .teamUnifiedChrome .team-tab-panel{
          min-width:0!important;
        }

        .teamUnifiedChrome table{
          max-width:100%!important;
        }

        @media(max-width:980px){
          .teamUnifiedChrome .tl-wrap{
            padding-left:0!important;
          }
          .teamUnifiedChrome .tl-container{
            padding:0 16px 35px!important;
          }
          .teamUnifiedChrome .tl-appbar{
            margin:0 -16px 18px!important;
            padding:0 16px!important;
          }
          .teamUnifiedChrome .team-tabs{
            position:static!important;
            width:100%!important;
            height:auto!important;
            padding:8px 0!important;
            border-right:0!important;
            background:transparent!important;
            box-shadow:none!important;
            display:flex!important;
            flex-direction:row!important;
            overflow-x:auto!important;
          }
          .teamUnifiedChrome .team-tabs::before,
          .teamUnifiedChrome .team-tabs::after{
            display:none!important;
          }
          .teamUnifiedChrome .team-tabs button{
            width:auto!important;
            white-space:nowrap!important;
            background:#fff!important;
            border:1px solid var(--team-ui-border)!important;
          }
          .teamUnifiedChrome .team-tabs button.active{
            border-color:var(--team-ui-primary)!important;
          }
        }
      `}</style>
    </div>
  );
}
