"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HeaderUser = {
  id: string;
  email?: string | null;
};

const MAIN_LINKS = [
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user ? { id: user.id, email: user.email } : null);
    return user;
  }, [supabase]);

  const loadCartCount = useCallback(async () => {
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
      console.error("Erreur chargement compteur panier:", error);
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
  }, [loadUser, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  useEffect(() => {
    loadCartCount();

    const { data } = supabase.auth.onAuthStateChange(() => loadCartCount());
    window.addEventListener("cart-updated", loadCartCount);
    window.addEventListener("focus", loadCartCount);

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("cart-updated", loadCartCount);
      window.removeEventListener("focus", loadCartCount);

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

          <nav
            className={`desktopNav ${mobileOpen ? "mobileVisible" : ""}`}
            aria-label="Navigation principale"
          >
            <div className="navGroup">
              <Link href="/bibliotheque" className="navLink" onClick={closeMobile}>
                BIBLIOTHÈQUE
              </Link>

              <div className="dropdownMenu">
                <Link href="/exercices" className="dropdownItem" onClick={closeMobile}>
                  <span>EXERCICES</span>
                  <small>Consulter les exercices</small>
                </Link>

                <Link href="/systemes" className="dropdownItem" onClick={closeMobile}>
                  <span>SYSTÈMES</span>
                  <small>Accéder aux systèmes</small>
                </Link>

                <Link href="/seances" className="dropdownItem" onClick={closeMobile}>
                  <span>SÉANCES</span>
                  <small>Voir les séances prêtes</small>
                </Link>
              </div>
            </div>

            <Link
              href="/plaquette?new=1"
              className="navLink"
              onClick={() => {
                resetPlaquette();
                closeMobile();
              }}
            >
              DESSIN
            </Link>

            <div className="navGroup">
              <Link href="/accompagnement" className="navLink" onClick={closeMobile}>
                ACCOMPAGNEMENT
              </Link>

              <div className="dropdownMenu dropdownMenuWide">
                <Link
                  href="/accompagnement/direction-technique"
                  className="dropdownItem"
                  onClick={closeMobile}
                >
                  <span>DIRECTION TECHNIQUE</span>
                  <small>Structurer et développer votre projet</small>
                </Link>

                <Link
                  href="/accompagnement/formation"
                  className="dropdownItem"
                  onClick={closeMobile}
                >
                  <span>FORMATION</span>
                  <small>Faire progresser les entraîneurs</small>
                </Link>

                <Link
                  href="/accompagnement/scouting-video"
                  className="dropdownItem"
                  onClick={closeMobile}
                >
                  <span>SCOUTING VIDÉO</span>
                  <small>Analyser vos matchs et adversaires</small>
                </Link>
              </div>
            </div>

            {MAIN_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="navLink"
                onClick={closeMobile}
              >
                {link.label}
              </Link>
            ))}

            <div className="mobileAccountLinks">
              {user ? (
                <>
                  <Link href="/mon-compte" onClick={closeMobile}>
                    MON PROFIL
                  </Link>
                  <Link href="/mon-compte?tab=equipes" onClick={closeMobile}>
                    MES ÉQUIPES
                  </Link>
                  <Link href="/management" onClick={closeMobile}>
                    MANAGEMENT
                  </Link>
                  <button type="button" onClick={signOut}>
                    DÉCONNEXION
                  </button>
                </>
              ) : (
                <Link href="/connexion" onClick={closeMobile}>
                  S&apos;IDENTIFIER
                </Link>
              )}
            </div>
          </nav>

          <div className="headerActions">
            {user ? (
              <div className="accountMenu">
                <Link href="/mon-compte" className="accountTrigger">
                  MON COMPTE
                  <span className="accountDot" aria-hidden="true" />
                </Link>

                <div className="accountDropdown">
                  <Link href="/mon-compte" className="accountDropdownItem">
                    MON PROFIL
                  </Link>
                  <Link
                    href="/mon-compte?tab=equipes"
                    className="accountDropdownItem"
                  >
                    MES ÉQUIPES
                  </Link>
                  <Link href="/management" className="accountDropdownItem">
                    MANAGEMENT
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="accountDropdownItem"
                  >
                    DÉCONNEXION
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/connexion" className="accountTrigger">
                S&apos;IDENTIFIER
                <span className="accountDot" aria-hidden="true" />
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

            <span className="cartBadge">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .siteHeader {
          position: relative;
          z-index: 1000;
          width: 100%;
          height: 96px;
          background: #ffffff;
          border-bottom: 1px solid #eeeeee;
          font-family: var(--font-roboto), Roboto, Arial, sans-serif;
        }

        .headerInner {
          width: min(1440px, calc(100% - 64px));
          height: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 180px minmax(0, 1fr) 190px;
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
          width: 126px;
          height: 74px;
          object-fit: contain;
          object-position: left center;
        }

        .desktopNav {
          min-width: 0;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(20px, 2vw, 34px);
        }

        .navLink,
        .accountTrigger,
        .mobileAccountLinks a,
        .mobileAccountLinks button {
          color: #111111;
          text-decoration: none;
          font-family: var(--font-roboto), Roboto, Arial, sans-serif;
          font-size: 13px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: 0.025em;
          white-space: nowrap;
          transition:
            color 0.2s ease,
            opacity 0.2s ease;
        }

        .navLink:hover,
        .accountTrigger:hover {
          color: #6b1a2c;
        }

        .navGroup,
        .accountMenu {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
        }

        .navGroup::after,
        .accountMenu::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -10px;
          height: 14px;
        }

        .dropdownMenu,
        .accountDropdown {
          position: absolute;
          top: calc(100% - 4px);
          z-index: 1200;
          visibility: hidden;
          opacity: 0;
          transform: translateY(8px);
          pointer-events: none;
          background: #ffffff;
          border: 1px solid #e8e8e8;
          border-radius: 14px;
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.16);
          transition:
            opacity 0.18s ease,
            transform 0.18s ease,
            visibility 0.18s ease;
        }

        .dropdownMenu {
          left: -16px;
          width: 270px;
          padding: 10px;
        }

        .dropdownMenuWide {
          width: 310px;
        }

        .accountDropdown {
          right: 0;
          width: 220px;
          padding: 10px;
        }

        .navGroup:hover .dropdownMenu,
        .navGroup:focus-within .dropdownMenu,
        .accountMenu:hover .accountDropdown,
        .accountMenu:focus-within .accountDropdown {
          visibility: visible;
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        .dropdownItem,
        .accountDropdownItem {
          width: 100%;
          box-sizing: border-box;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #171717;
          text-align: left;
          text-decoration: none;
          font-family: var(--font-roboto), Roboto, Arial, sans-serif;
          cursor: pointer;
          transition:
            background 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease;
        }

        .dropdownItem {
          display: grid;
          gap: 5px;
          padding: 13px 14px;
        }

        .dropdownItem + .dropdownItem,
        .accountDropdownItem + .accountDropdownItem {
          margin-top: 3px;
        }

        .dropdownItem span,
        .accountDropdownItem {
          font-size: 12px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: 0.025em;
        }

        .dropdownItem small {
          color: #6b6b6b;
          font-size: 11px;
          line-height: 1.35;
          font-weight: 500;
          letter-spacing: 0;
        }

        .accountDropdownItem {
          display: flex;
          align-items: center;
          min-height: 42px;
          padding: 0 13px;
        }

        .dropdownItem:hover,
        .accountDropdownItem:hover {
          background: #f6efe8;
          color: #6b1a2c;
          transform: translateX(2px);
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

        .accountDot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #d4a24c;
          flex: 0 0 auto;
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
          background: #0c0c0e;
          font-family: var(--font-roboto), Roboto, Arial, sans-serif;
        }

        .blackBarInner {
          width: min(1440px, calc(100% - 64px));
          height: 100%;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .cartLink {
          min-width: 136px;
          height: 40px;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border-radius: 8px;
          color: #ffffff;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          transition:
            background 0.2s ease,
            transform 0.2s ease;
        }

        .cartLink:hover {
          background: rgba(255, 255, 255, 0.09);
        }

        .cartIcon {
          width: 26px;
          height: 24px;
          display: grid;
          place-items: center;
        }

        .cartIcon svg {
          width: 26px;
          height: 24px;
          fill: none;
          stroke: #ffffff;
          stroke-width: 3.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .cartIcon svg circle {
          fill: #ffffff;
          stroke: none;
        }

        .cartLabel {
          line-height: 1;
        }

        .cartBadge {
          min-width: 24px;
          height: 22px;
          padding: 0 6px;
          border-radius: 999px;
          background: #d4a24c;
          color: #111111;
          display: inline-grid;
          place-items: center;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
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
            grid-template-columns: 145px minmax(0, 1fr) 160px;
            column-gap: 16px;
          }

          .logoImage {
            width: 108px;
          }

          .desktopNav {
            gap: 15px;
          }

          .navLink,
          .accountTrigger {
            font-size: 11px;
          }

          .blackBarInner {
            width: calc(100% - 36px);
          }
        }

        @media (max-width: 920px) {
          .siteHeader {
            height: 78px;
          }

          .headerInner {
            width: calc(100% - 28px);
            grid-template-columns: 1fr auto;
            column-gap: 12px;
          }

          .logoImage {
            width: 94px;
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

          .navLink,
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

          .navGroup::after,
          .accountMenu::after {
            display: none;
          }

          .dropdownMenu,
          .accountDropdown {
            position: static;
            width: 100%;
            visibility: visible;
            opacity: 1;
            transform: none;
            pointer-events: auto;
            padding: 2px 0 8px 14px;
            border: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .dropdownItem {
            padding: 10px 8px;
            border-bottom: 1px solid #f1f1f1;
          }

          .dropdownItem span {
            font-size: 11px;
          }

          .dropdownItem small {
            font-size: 10px;
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
            transition:
              transform 0.2s ease,
              opacity 0.2s ease;
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

          .cartLink {
            min-width: 126px;
            height: 38px;
          }
        }
      `}</style>
    </>
  );
}
