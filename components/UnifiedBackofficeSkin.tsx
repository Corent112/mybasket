"use client";

export default function UnifiedBackofficeSkin() {
  return (
    <style jsx global>{`
      /* =========================================================
         MYBASKET — DESIGN SYSTEM UNIFIÉ
         CEO / CLUB / INSTITUTION (Comité, Ligue, Fédération, Pôle)
         Couche uniquement visuelle : aucune logique métier modifiée.
         ========================================================= */

      :root {
        --mb-admin-bordeaux: #6b1a2c;
        --mb-admin-bordeaux-2: #8b1232;
        --mb-admin-gold: #d4a24c;
        --mb-admin-bg: #fffaf2;
        --mb-admin-card: #ffffff;
        --mb-admin-text: #171017;
        --mb-admin-muted: #766a61;
        --mb-admin-border: rgba(107, 26, 44, 0.12);
        --mb-admin-shadow: 0 18px 45px rgba(34, 19, 12, 0.06);
      }

      /* Le header global MyBasket reste visible sur TOUS les espaces. */
      body .site-header {
        display: block !important;
      }

      body .blackbar {
        display: block !important;
      }

      body .footer {
        display: block !important;
      }

      /* Typographie commune back-office. */
      body .adminPage,
      body .institutionShell,
      body .clubApp {
        font-family: var(--font-roboto), Roboto, Arial, sans-serif !important;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }

      body .adminPage h1,
      body .institutionShell h1,
      body .clubApp h1,
      body .adminPage h2,
      body .institutionShell h2,
      body .clubApp h2,
      body .adminPage h3,
      body .institutionShell h3,
      body .clubApp h3 {
        font-family: var(--font-roboto), Roboto, Arial, sans-serif !important;
        letter-spacing: -0.025em;
      }

      /* Même fond général que le Dashboard CEO. */
      body .institutionShell,
      body .clubApp {
        background:
          radial-gradient(circle at top left, rgba(212, 162, 76, 0.18), transparent 32%),
          radial-gradient(circle at 75% 10%, rgba(107, 26, 44, 0.08), transparent 28%),
          linear-gradient(180deg, #fffaf2 0%, #f7f1ea 45%, #ffffff 100%) !important;
      }

      /* ---------------------------------------------------------
         SIDEBARS — même présence visuelle que le CEO
         --------------------------------------------------------- */
      body .institutionShell > .sidebar,
      body .clubApp > .sidebar {
        width: 278px !important;
        background: rgba(255, 255, 255, 0.92) !important;
        border-right: 1px solid rgba(107, 26, 44, 0.1) !important;
        padding: 28px 18px !important;
        box-shadow: 12px 0 45px rgba(42, 20, 10, 0.04) !important;
        backdrop-filter: blur(18px);
      }

      body .institutionShell {
        grid-template-columns: 278px minmax(0, 1fr) !important;
      }

      body .institutionShell .brand,
      body .clubApp .brand {
        height: auto !important;
        min-height: 112px;
        padding: 0 8px 20px !important;
        text-align: center !important;
        display: grid !important;
        place-items: center !important;
        align-content: center !important;
        border-bottom: 1px solid rgba(107, 26, 44, 0.1) !important;
      }

      body .institutionShell .brand strong,
      body .clubApp .brandTitle {
        font-size: 28px !important;
        line-height: 1 !important;
        font-weight: 1000 !important;
        color: var(--inst-primary, var(--club-primary, var(--mb-admin-bordeaux))) !important;
        letter-spacing: -0.03em !important;
      }

      body .institutionShell .brand span,
      body .clubApp .brandSub {
        color: var(--inst-secondary, var(--club-secondary, var(--mb-admin-gold))) !important;
        letter-spacing: 7px !important;
        font-size: 12px !important;
        font-weight: 1000 !important;
        margin-top: 7px !important;
      }

      /* Menu Institution : mêmes emojis que le reste de MyBasket. */
      body .institutionShell .sideNav button i {
        font-size: 0 !important;
        width: 22px !important;
        color: inherit !important;
      }
      body .institutionShell .sideNav button i::before {
        font-size: 16px;
        line-height: 1;
      }
      body .institutionShell .sideNav button:nth-child(1) i::before { content: "📊"; }
      body .institutionShell .sideNav button:nth-child(2) i::before { content: "👥"; }
      body .institutionShell .sideNav button:nth-child(3) i::before { content: "📤"; }
      body .institutionShell .sideNav button:nth-child(4) i::before { content: "🎓"; }
      body .institutionShell .sideNav button:nth-child(5) i::before { content: "📅"; }
      body .institutionShell .sideNav button:nth-child(6) i::before { content: "📁"; }
      body .institutionShell .sideNav button:nth-child(7) i::before { content: "💬"; }
      body .institutionShell .sideNav button:nth-child(8) i::before { content: "📚"; }
      body .institutionShell .sideNav button:nth-child(9) i::before { content: "👥"; }
      body .institutionShell .sideNav button:nth-child(10) i::before { content: "⚙️"; }

      body .institutionShell .sideNav,
      body .clubApp nav {
        gap: 6px !important;
        padding-top: 18px !important;
      }

      body .institutionShell .sideNav button,
      body .clubApp nav button {
        min-height: 42px !important;
        border-radius: 12px !important;
        padding: 0 14px !important;
        gap: 12px !important;
        font-family: var(--font-roboto), Roboto, Arial, sans-serif !important;
        font-size: 14px !important;
        font-weight: 800 !important;
        letter-spacing: 0 !important;
        transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease !important;
      }

      body .institutionShell .sideNav button:hover,
      body .clubApp nav button:hover {
        transform: translateX(2px);
        background: #fbf4f0 !important;
        color: var(--inst-primary, var(--club-primary, var(--mb-admin-bordeaux))) !important;
      }

      body .institutionShell .sideNav button.on,
      body .clubApp nav button.active {
        background: linear-gradient(
          135deg,
          var(--mb-admin-bordeaux-2),
          var(--inst-primary, var(--club-primary, var(--mb-admin-bordeaux)))
        ) !important;
        color: white !important;
        box-shadow: 0 12px 24px rgba(107, 26, 44, 0.18) !important;
      }

      body .institutionShell .sideIdentity,
      body .clubApp .sideBottom {
        border-top: 1px solid rgba(107, 26, 44, 0.1) !important;
      }

      body .institutionShell .backAccount {
        border-radius: 12px !important;
        min-height: 42px;
        font-family: var(--font-roboto), Roboto, Arial, sans-serif !important;
      }

      /* ---------------------------------------------------------
         BARRE SUPÉRIEURE INTERNE
         --------------------------------------------------------- */
      body .institutionShell .topbar,
      body .clubApp .topbar {
        height: 74px !important;
        background: rgba(255, 255, 255, 0.94) !important;
        border-bottom: 1px solid rgba(107, 26, 44, 0.1) !important;
        box-shadow: 0 8px 30px rgba(42, 20, 10, 0.035);
        backdrop-filter: blur(16px);
      }

      body .institutionShell .seasonSelector,
      body .clubApp .season {
        background: white !important;
        border: 1px solid var(--mb-admin-border) !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(42, 20, 10, 0.035);
      }

      body .institutionShell .topRight button,
      body .institutionShell .userBubble,
      body .clubApp .account {
        box-shadow: 0 8px 24px rgba(42, 20, 10, 0.06);
      }

      /* ---------------------------------------------------------
         TITRES DE PAGES — hiérarchie CEO
         --------------------------------------------------------- */
      body .institutionShell .content,
      body .clubApp .clubContent {
        max-width: 1500px !important;
        padding-top: 34px !important;
      }

      body .institutionShell .pageTitle,
      body .clubApp .pageTitle {
        margin-bottom: 28px !important;
      }

      body .institutionShell .pageTitle p,
      body .clubApp .pageTitle p,
      body .institutionShell .sectionHead p {
        color: var(--inst-primary, var(--club-primary, var(--mb-admin-bordeaux))) !important;
        font-size: 11px !important;
        line-height: 1.2;
        letter-spacing: 0.14em !important;
        font-weight: 1000 !important;
      }

      body .institutionShell .pageTitle h1,
      body .clubApp .pageTitle h1 {
        margin: 6px 0 8px !important;
        font-size: clamp(32px, 4vw, 48px) !important;
        line-height: 1 !important;
        font-weight: 1000 !important;
        color: var(--inst-primary, var(--club-primary, var(--mb-admin-bordeaux))) !important;
      }

      body .institutionShell .pageTitle > span,
      body .clubApp .pageTitle span,
      body .institutionShell .sectionHead span {
        color: var(--mb-admin-muted) !important;
        font-size: 14px !important;
        line-height: 1.55;
      }

      /* ---------------------------------------------------------
         CARTES / PANELS — plus poussés sans changer les composants
         --------------------------------------------------------- */
      body .institutionShell .surface,
      body .clubApp .clubContent > section,
      body .clubApp .clubContent > div:not(.pageTitle) {
        border-radius: 22px !important;
      }

      body .institutionShell .surface {
        padding: 22px !important;
        background: rgba(255, 255, 255, 0.96) !important;
        border: 1px solid var(--mb-admin-border) !important;
        box-shadow: var(--mb-admin-shadow) !important;
      }

      body .institutionShell .sectionHead {
        margin-bottom: 20px !important;
      }

      body .institutionShell .sectionHead h2 {
        margin: 4px 0 7px !important;
        font-size: 22px !important;
        font-weight: 1000 !important;
      }

      /* Sections Club historiques : même carte blanche premium. */
      body .clubApp .clubContent .teamsActive,
      body .clubApp .clubContent .coaches,
      body .clubApp .clubContent .engine,
      body .clubApp .clubContent .communication,
      body .clubApp .clubContent .mailing,
      body .clubApp .clubContent .settings,
      body .clubApp .clubContent .finance,
      body .clubApp .clubContent .convocations,
      body .clubApp .clubContent .cotisations,
      body .clubApp .clubContent .performance {
        border: 1px solid var(--mb-admin-border) !important;
        border-radius: 22px !important;
        background: rgba(255, 255, 255, 0.96) !important;
        box-shadow: var(--mb-admin-shadow) !important;
      }

      body .clubApp .clubContent .top {
        padding: 22px !important;
        background: white !important;
        border-bottom: 1px solid rgba(107, 26, 44, 0.09) !important;
      }

      /* Inputs / boutons uniformisés sans imposer leur couleur métier. */
      body .institutionShell input,
      body .institutionShell select,
      body .institutionShell textarea,
      body .clubApp input,
      body .clubApp select,
      body .clubApp textarea {
        font-family: var(--font-roboto), Roboto, Arial, sans-serif !important;
        border-radius: 12px !important;
      }

      body .institutionShell button,
      body .clubApp button,
      body .adminPage button {
        font-family: var(--font-roboto), Roboto, Arial, sans-serif !important;
      }

      /* Les cartes internes gagnent en relief quand les modules utilisent
         des div/article génériques. On reste volontairement léger. */
      body .institutionShell article,
      body .clubApp article {
        border-radius: 18px;
      }

      /* ---------------------------------------------------------
         RESPONSIVE
         --------------------------------------------------------- */
      @media (max-width: 1000px) {
        body .institutionShell {
          grid-template-columns: 1fr !important;
        }

        body .institutionShell > .sidebar,
        body .clubApp > .sidebar {
          width: 278px !important;
        }

        body .institutionShell .content,
        body .clubApp .clubContent {
          padding: 24px 16px 50px !important;
        }
      }

      @media (max-width: 600px) {
        body .institutionShell .pageTitle h1,
        body .clubApp .pageTitle h1 {
          font-size: 30px !important;
        }
      }
    `}</style>
  );
}
