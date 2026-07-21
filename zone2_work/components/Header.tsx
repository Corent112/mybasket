"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HeaderUser = {
  id: string;
  email?: string | null;
};

const MAIN_LINKS = [
  { href: "/plaquette?new=1", label: "PLAQUETTE" },
  { href: "/annonces", label: "ANNONCES" },
  { href: "/abonnements", label: "ABONNEMENTS" },
  { href: "/boutique", label: "BOUTIQUE" },
];

export default function Header() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartPulse, setCartPulse] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousCountRef = useRef(0);
  const pulseTimeoutRef = useRef<number | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.warn("Impossible de charger l'utilisateur du header:", error.message);
        setUser(null);
        return null;
      }

      setUser(user ? { id: user.id, email: user.email } : null);
      return user;
    } catch (error) {
      console.warn(
        "Connexion Supabase indisponible dans le header:",
        error instanceof Error ? error.message : error,
      );
      setUser(null);
      return null;
    }
  }, [supabase]);

  const loadCartCount = useCallback(async () => {
    try {
      const currentUser = await loadUser();

      if (!currentUser) {
        setCartCount(0);
        previousCountRef.current = 0;
        return;
      }

      const { data, error } = await supabase
        .from("cart_items")
        .select("quantity,item_type")
        .eq("user_id", currentUser.id)
        .in("item_type", ["product", "subscription"]);

      if (error) {
        console.warn("Impossible de charger le compteur panier:", error.message);
        return;
      }

      const total = (data ?? []).reduce(
        (sum: number, item: { quantity?: number | string | null }) =>
          sum + Number(item.quantity ?? 1),
        0,
      );

      if (total > previousCountRef.current) {
        setCartPulse(true);

        if (pulseTimeoutRef.current) {
          window.clearTimeout(pulseTimeoutRef.current);
        }

        pulseTimeoutRef.current = window.setTimeout(
          () => setCartPulse(false),
          650,
        );
      }

      previousCountRef.current = total;
      setCartCount(total);
    } catch (error) {
      console.warn(
        "Compteur panier temporairement indisponible:",
        error instanceof Error ? error.message : error,
      );
    }
  }, [loadUser, supabase]);

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn(
        "Erreur pendant la déconnexion:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      window.location.href = "/";
    }
  }

  useEffect(() => {
    void loadCartCount();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadCartCount();
    });

    const refreshCart = () => {
      void loadCartCount();
    };

    window.addEventListener("cart-updated", refreshCart);
    window.addEventListener("focus", refreshCart);

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("cart-updated", refreshCart);
      window.removeEventListener("focus", refreshCart);

      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, [loadCartCount, supabase]);

  const resetPlaquette = () => {
    [
      "mybasket_plaquette_load",
      "mybasket_plaquette_result",
      "mybasket_plaquette_mode",
      "mybasket_plaquette_return",
      "mb_plaquette_return_to",
      "mybasket_edit_exercise_id",
      "mybasket_edit_schema_index",
    ].forEach((key) => localStorage.removeItem(key));
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className="siteHeader">
        <div className="headerInner">
          <Link href="/" className="logoLink" onClick={closeMobile}>
            <img
              src="/logo-mybasket-header.png"
              alt="MyBasket"
              className="logoImage"
            />
          </Link>

          <nav className={`desktopNav ${mobileOpen ? "mobileVisible" : ""}`}>
            <div className="navGroup">
              <Link href="/bibliotheque" onClick={closeMobile}>
                BIBLIOTHÈQUE
              </Link>
              <div className="dropdownMenu">
                <Link href="/exercices" onClick={closeMobile}>EXERCICES</Link>
                <Link href="/systemes" onClick={closeMobile}>SYSTÈMES</Link>
                <Link href="/seances" onClick={closeMobile}>SÉANCES</Link>
              </div>
            </div>

            <Link
              href="/plaquette?new=1"
              onClick={() => {
                resetPlaquette();
                closeMobile();
              }}
            >
              PLAQUETTE
            </Link>

            <div className="navGroup">
              <Link href="/accompagnement" onClick={closeMobile}>
                ACCOMPAGNEMENT
              </Link>
              <div className="dropdownMenu">
                <Link href="/accompagnement/direction-technique" onClick={closeMobile}>
                  DIRECTION TECHNIQUE
                </Link>
                <Link href="/accompagnement/formation" onClick={closeMobile}>
                  FORMATION
                </Link>
                <Link href="/accompagnement/scouting-video" onClick={closeMobile}>
                  SCOUTING VIDÉO
                </Link>
              </div>
            </div>

            {MAIN_LINKS.slice(1).map((link) => (
              <Link key={link.href} href={link.href} onClick={closeMobile}>
                {link.label}
              </Link>
            ))}

            <div className="mobileAccountLinks">
              {user ? (
                <>
                  <Link href="/mon-compte?tab=profil" onClick={closeMobile}>MON PROFIL</Link>
                  <Link href="/mon-compte?tab=equipes" onClick={closeMobile}>MES ÉQUIPES</Link>
                  <Link href="/mon-compte?tab=management" onClick={closeMobile}>MANAGEMENT</Link>
                  <button type="button" onClick={signOut}>DÉCONNEXION</button>
                </>
              ) : (
                <Link href="/connexion" onClick={closeMobile}>S&apos;IDENTIFIER</Link>
              )}
            </div>
          </nav>

          <div className="headerActions">
            {user ? (
              <div className="accountMenu">
                <Link href="/mon-compte?tab=profil" className="accountTrigger">
                  MON COMPTE
                  <span className="accountIcon" aria-hidden="true">●</span>
                </Link>
                <div className="accountDropdown">
                  <Link href="/mon-compte">MON PROFIL</Link>
                  <Link href="/mon-compte?tab=equipes">MES ÉQUIPES</Link>
                  <Link href="/mon-compte?tab=management">MANAGEMENT</Link>
                  <button type="button" onClick={signOut}>DÉCONNEXION</button>
                </div>
              </div>
            ) : (
              <Link href="/connexion" className="accountTrigger">
                S&apos;IDENTIFIER
                <span className="accountIcon" aria-hidden="true">●</span>
              </Link>
            )}

            <button
              type="button"
              className={`mobileToggle ${mobileOpen ? "open" : ""}`}
              onClick={() => setMobileOpen((value) => !value)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div className="blackBar">
        <div className="blackBarInner">
          <Link
            href="/panier"
            className={`cartLink ${cartPulse ? "pulse" : ""}`}
            aria-label={`Ouvrir le panier, ${cartCount} produit${cartCount > 1 ? "s" : ""}`}
          >
            <span className="cartIcon" aria-hidden="true">
              <svg viewBox="0 0 64 54">
                <path d="M8 8h9l5 24c.7 3.4 3.6 6 7.1 6h16.2c3.4 0 6.4-2.4 7.2-5.7L56 18H20" />
                <circle cx="30" cy="47" r="4" />
                <circle cx="47" cy="47" r="4" />
              </svg>
            </span>
            <span className="cartLabel">PANIER</span>
            <span className="cartBadge">{cartCount > 99 ? "99+" : cartCount}</span>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .siteHeader {
          position: relative;
          z-index: 1000;
          width: 100%;
          height: 94px;
          background: #ffffff;
          border-bottom: 2px solid #d4a24c;
          font-family: "Arial Black", Arial, Helvetica, sans-serif;
        }

        .headerInner {
          width: min(1380px, calc(100% - 56px));
          height: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 170px minmax(0, 1fr) 190px;
          align-items: center;
          column-gap: 28px;
        }

        .logoLink {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          text-decoration: none;
        }

        .logoImage {
          display: block;
          width: 112px;
          height: 72px;
          object-fit: contain;
          object-position: left center;
        }

        .desktopNav {
          min-width: 0;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 40px;
        }

        .desktopNav > a,
        .navGroup > a,
        .accountTrigger,
        .mobileAccountLinks a,
        .mobileAccountLinks button {
          color: #000000 !important;
          text-decoration: none;
          font-family: "Arial Black", Arial, Helvetica, sans-serif !important;
          font-size: 14px;
          line-height: 1;
          font-weight: 900 !important;
          letter-spacing: -0.02em;
          white-space: nowrap;
          text-transform: uppercase;
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
          text-shadow:
            0.3px 0 #000000,
            -0.3px 0 #000000,
            0 0.3px #000000,
            0 -0.3px #000000;
          transition: color 0.16s ease;
        }

        .desktopNav > a:hover,
        .navGroup > a:hover,
        .accountTrigger:hover {
          color: #6b1a2c !important;
          text-shadow:
            0.3px 0 #6b1a2c,
            -0.3px 0 #6b1a2c,
            0 0.3px #6b1a2c,
            0 -0.3px #6b1a2c;
        }

        .navGroup,
        .accountMenu {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
        }

        .dropdownMenu,
        .accountDropdown {
          position: absolute;
          top: 100%;
          z-index: 1200;
          display: grid;
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
          background: #ffffff;
          border-top: 2px solid #d4a24c;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
          overflow: hidden;
          transform: translateY(5px);
          transition:
            opacity 0.15s ease,
            transform 0.15s ease,
            visibility 0.15s ease;
        }

        .dropdownMenu {
          left: -14px;
          width: 212px;
        }

        .accountDropdown {
          right: 0;
          width: 220px;
        }

        .navGroup:hover .dropdownMenu,
        .navGroup:focus-within .dropdownMenu,
        .accountMenu:hover .accountDropdown,
        .accountMenu:focus-within .accountDropdown {
          visibility: visible;
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .dropdownMenu a,
        .accountDropdown a,
        .accountDropdown a {
          padding-left: 82px;
          padding-right: 24px;
        }

        .accountDropdown button {
          width: 100%;
          height: 66px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          padding: 0 24px 0 82px;
          border: 0;
          border-radius: 0;
          background: #ffffff;
          color: #000000 !important;
          text-align: left;
          text-decoration: none;
          font-family: "Arial Black", Arial, Helvetica, sans-serif !important;
          font-size: 14px;
          line-height: 1;
          font-weight: 900 !important;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
          text-shadow:
            0.35px 0 #000000,
            -0.35px 0 #000000,
            0 0.35px #000000,
            0 -0.35px #000000;
          cursor: pointer;
          transition:
            background 0.15s ease,
            color 0.15s ease;
        }

        .dropdownMenu a:hover,
        .accountDropdown a:hover,
        .accountDropdown button:hover {
          background: #f5f5f5;
          color: #6b1a2c !important;
          text-shadow:
            0.35px 0 #6b1a2c,
            -0.35px 0 #6b1a2c,
            0 0.35px #6b1a2c,
            0 -0.35px #6b1a2c;
        }

        .accountDropdown button {
          justify-content: center;
          padding: 0 24px;
          color: #6b1a2c !important;
          text-align: center;
          font-weight: 600 !important;
          text-shadow: none;
        }


        .accountDropdown a {
          padding-left: 82px !important;
          padding-right: 20px;
          justify-content: flex-start;
          text-align: left;
        }

        .accountDropdown button {
          padding-left: 20px !important;
          padding-right: 20px;
          justify-content: center;
          text-align: center;
        }

        .headerActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
        }

        .accountTrigger {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .accountIcon {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          display: inline-block;
          overflow: hidden;
          color: transparent;
          background: #d4a24c;
          font-size: 0;
          line-height: 0;
          text-shadow: none;
        }

        .mobileToggle,
        .mobileAccountLinks {
          display: none;
        }

        .blackBar {
          position: relative;
          z-index: 900;
          width: 100%;
          height: 48px;
          background: #0d0d0f;
          font-family: "Arial Black", Arial, Helvetica, sans-serif;
        }

        .blackBarInner {
          width: min(1380px, calc(100% - 56px));
          height: 100%;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .cartLink {
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 8px;
          border-radius: 8px;
          color: #ffffff !important;
          text-decoration: none;
          font-family: "Arial Black", Arial, Helvetica, sans-serif;
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0;
          text-shadow: none;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .cartLink:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .cartIcon {
          width: 26px;
          height: 24px;
          display: inline-grid;
          place-items: center;
          flex: 0 0 auto;
        }

        .cartIcon svg {
          width: 26px;
          height: 24px;
          display: block;
          fill: none;
          stroke: #ffffff !important;
          stroke-width: 3.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .cartIcon svg circle {
          fill: #ffffff !important;
          stroke: none !important;
        }

        .cartLabel {
          color: #ffffff !important;
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
          text-shadow: none;
        }

        .cartBadge {
          position: static;
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border: 0;
          border-radius: 999px;
          background: #d4a24c;
          color: #111111;
          display: inline-grid;
          place-items: center;
          flex: 0 0 auto;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
          text-shadow: none;
        }

        .pulse {
          animation: cartPulse 0.65s ease;
        }

        @keyframes cartPulse {
          50% {
            transform: scale(1.1);
          }
        }

        @media (max-width: 1180px) {
          .headerInner {
            width: min(100%, calc(100% - 36px));
            grid-template-columns: 145px minmax(0, 1fr) 165px;
            column-gap: 18px;
          }

          .logoImage {
            width: 98px;
          }

          .desktopNav {
            gap: 22px;
          }

          .desktopNav > a,
          .navGroup > a,
          .accountTrigger {
            font-size: 12px;
          }

          .blackBarInner {
            width: calc(100% - 36px);
          }
        }

        @media (max-width: 900px) {
          .siteHeader {
            height: 78px;
          }

          .headerInner {
            width: calc(100% - 28px);
            grid-template-columns: 1fr auto;
            column-gap: 12px;
          }

          .logoImage {
            width: 88px;
            height: 62px;
          }

          .desktopNav {
            position: absolute;
            top: 78px;
            left: 0;
            right: 0;
            z-index: 1300;
            display: none;
            height: auto;
            max-height: calc(100vh - 126px);
            overflow-y: auto;
            padding: 14px 18px 22px;
            background: #ffffff;
            border-top: 1px solid #ececec;
            box-shadow: 0 18px 30px rgba(0, 0, 0, 0.14);
            align-items: stretch;
            justify-content: flex-start;
            flex-direction: column;
            gap: 0;
          }

          .desktopNav.mobileVisible {
            display: flex;
          }

          .desktopNav > a,
          .navGroup > a,
          .mobileAccountLinks a,
          .mobileAccountLinks button {
            width: 100%;
            min-height: 48px;
            display: flex;
            align-items: center;
            box-sizing: border-box;
            padding: 0 6px;
            border-bottom: 1px solid #efefef;
            font-size: 13px;
          }

          .navGroup {
            width: 100%;
            height: auto;
            display: block;
          }

          .dropdownMenu,
          .accountDropdown {
            position: static;
            display: grid;
            visibility: visible;
            opacity: 1;
            pointer-events: auto;
            width: 100%;
            transform: none;
            border-top: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .dropdownMenu a,
          .accountDropdown a,
          .accountDropdown button {
            height: 48px;
            padding: 0 0 0 20px;
            font-size: 12px;
          }

          .accountMenu,
          .headerActions > .accountTrigger {
            display: none;
          }

          .mobileAccountLinks {
            display: grid;
            margin-top: 8px;
          }

          .mobileAccountLinks button {
            border: 0;
            border-bottom: 1px solid #efefef;
            background: transparent;
            text-align: left;
            cursor: pointer;
          }

          .mobileToggle {
            width: 44px;
            height: 44px;
            display: grid;
            place-content: center;
            gap: 5px;
            padding: 0;
            border: 0;
            border-radius: 8px;
            background: transparent;
            cursor: pointer;
          }

          .mobileToggle span {
            width: 24px;
            height: 2px;
            border-radius: 4px;
            background: #111111;
            transition: transform 0.2s ease, opacity 0.2s ease;
          }

          .mobileToggle.open span:nth-child(1) {
            transform: translateY(7px) rotate(45deg);
          }

          .mobileToggle.open span:nth-child(2) {
            opacity: 0;
          }

          .mobileToggle.open span:nth-child(3) {
            transform: translateY(-7px) rotate(-45deg);
          }

          .blackBar {
            height: 46px;
          }

          .blackBarInner {
            width: calc(100% - 28px);
          }
        }
      `}</style>
    </>
  );
}
