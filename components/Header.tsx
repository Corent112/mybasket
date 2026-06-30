"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type HeaderUser = {
  id: string;
  email?: string | null;
};

export default function Header() {
  const supabase = createClient();

  const [user, setUser] = useState<HeaderUser | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartPulse, setCartPulse] = useState(false);

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
      setCartCount(0);
      return;
    }

    const total = (data ?? []).reduce(
      (sum: number, item: { quantity?: number | string | null }) =>
        sum + Number(item.quantity ?? 1),
      0
    );

    if (total > previousCountRef.current) {
      setCartPulse(true);

      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
      }

      pulseTimeoutRef.current = window.setTimeout(() => {
        setCartPulse(false);
      }, 650);
    }

    previousCountRef.current = total;
    setCartCount(total);
  }, [loadUser, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setCartCount(0);
    window.location.href = "/";
  }

  useEffect(() => {
    loadCartCount();

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadCartCount();
    });

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
    localStorage.removeItem("mybasket_plaquette_load");
    localStorage.removeItem("mybasket_plaquette_result");
    localStorage.removeItem("mybasket_plaquette_mode");
    localStorage.removeItem("mybasket_plaquette_return");
    localStorage.removeItem("mb_plaquette_return_to");
    localStorage.removeItem("mybasket_edit_exercise_id");
    localStorage.removeItem("mybasket_edit_schema_index");
  };

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="site-logo">
            <img
              src="/logo-mybasket02.png"
              alt="MyBasket"
              className="site-logo-img"
            />
          </Link>

          <nav className="site-nav">
            <div className="nav-item">
              <Link href="/bibliotheque">BIBLIOTHÈQUE</Link>

              <div className="dropdown">
                <Link href="/exercices">EXERCICES</Link>
                <Link href="/systemes">SYSTÈMES</Link>
                <Link href="/seances">SÉANCES</Link>
              </div>
            </div>

            <Link href="/plaquette?new=1" onClick={resetPlaquette}>
              PLAQUETTE
            </Link>

            <div className="nav-item">
              <Link href="/accompagnement">ACCOMPAGNEMENT</Link>

              <div className="dropdown">
                <Link href="/accompagnement/direction-technique">
                  DIRECTION TECHNIQUE
                </Link>
                <Link href="/accompagnement/formation">FORMATION</Link>
                <Link href="/accompagnement/scouting-video">
                  SCOUTING VIDEO
                </Link>
              </div>
            </div>

            <Link href="/annonces">ANNONCES</Link>
            <Link href="/abonnements">ABONNEMENTS</Link>
            <Link href="/boutique">BOUTIQUE</Link>
          </nav>

          <div className="site-actions">
            {user ? (
              <div className="account-menu">
                <Link href="/mon-compte" className="login-link account-trigger">
                  MON COMPTE 👤
                </Link>

                <div className="account-dropdown">
                  <Link href="/mon-compte">TABLEAU DE BORD</Link>
                  <Link href="/mon-compte/favoris">MES FAVORIS</Link>
                  <Link href="/mon-compte/playbooks">MES PLAYBOOKS</Link>
                  <button type="button" onClick={signOut}>
                    DÉCONNEXION
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/connexion" className="login-link">
                S&apos;IDENTIFIER 👤
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="blackbar">
        <button type="button" className="burger" aria-label="Menu">
          ☰
        </button>

        <div className="search">
          <input type="text" placeholder="Rechercher..." />
        </div>

        <div className="icons">
          <button type="button" aria-label="Vue grille" className="grid-btn">
            ▦
          </button>

          <Link href="/mon-compte/favoris" className="icon-link" aria-label="Favoris">
            ♥
          </Link>

          <Link
            href="/panier"
            className={`cart-link ${cartPulse ? "pulse" : ""}`}
            aria-label={`Ouvrir le panier, ${cartCount} produit${
              cartCount > 1 ? "s" : ""
            }`}
          >
            <svg className="cart-svg" viewBox="0 0 64 54" fill="none" aria-hidden="true">
              <path
                d="M10 8H17L22 32C22.7 35.4 25.6 38 29.1 38H45.3C48.7 38 51.7 35.6 52.5 32.3L56 18H20"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <circle cx="30" cy="47" r="4" fill="white" />
              <circle cx="47" cy="47" r="4" fill="white" />

              {cartCount > 0 && (
                <g className="badge-group">
                  <circle cx="51" cy="12" r="10" fill="#d4a24c" stroke="#000" strokeWidth="3" />
                  <text x="51" y="16" textAnchor="middle" fontSize="12" fontWeight="900" fill="#111">
                    {cartCount > 99 ? "99" : cartCount}
                  </text>
                </g>
              )}
            </svg>

            <span className="mini-cart">
              <strong>Panier</strong>
              <small>
                {cartCount} produit{cartCount > 1 ? "s" : ""}
              </small>
              <span>Voir mon panier →</span>
            </span>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .site-header {
          width: 100%;
          height: 76px;
          background: #fff;
          border-bottom: 1px solid #eee;
          position: relative;
          z-index: 1000;
        }

        .site-header-inner {
          max-width: 1400px;
          height: 76px;
          margin: 0 auto;
          padding: 0 20px;
          display: grid;
          grid-template-columns: 120px 1fr 220px;
          align-items: center;
          gap: 20px;
        }

        .site-logo {
          display: flex;
          align-items: center;
        }

        .site-logo-img {
          width: 76px;
          height: 76px;
          object-fit: contain;
        }

        .site-nav {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 28px;
        }

        .site-nav > :global(a),
        .nav-item > :global(a),
        .site-actions :global(a),
        .login-link {
          text-decoration: none;
          color: #111;
          text-transform: uppercase;
          font-family: Arial, Roboto, sans-serif;
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1;
          white-space: nowrap;
        }

        .site-nav > :global(a:hover),
        .nav-item > :global(a:hover),
        .site-actions :global(a:hover) {
          color: #6b1a2c;
        }

        .nav-item,
        .account-menu {
          position: relative;
          height: 76px;
          display: flex;
          align-items: center;
        }

        .dropdown,
        .account-dropdown {
          display: none;
          position: absolute;
          top: 76px;
          left: 50%;
          transform: translateX(-50%);
          min-width: 230px;
          background: #fff;
          border-top: 3px solid #c9a227;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
          border-radius: 0 0 10px 10px;
          overflow: hidden;
          z-index: 2000;
        }

        .account-dropdown {
          right: 0;
          left: auto;
          transform: none;
          min-width: 220px;
        }

        .dropdown :global(a),
        .account-dropdown :global(a),
        .account-dropdown button {
          display: block;
          width: 100%;
          padding: 16px 18px;
          color: #111;
          background: #fff;
          border: 0;
          text-align: left;
          text-transform: uppercase;
          text-decoration: none;
          font-family: Arial, Roboto, sans-serif;
          font-size: 14px;
          font-weight: 900;
          line-height: 1.2;
          white-space: nowrap;
          cursor: pointer;
        }

        .dropdown :global(a:hover),
        .account-dropdown :global(a:hover),
        .account-dropdown button:hover {
          background: #f5f2eb;
          color: #6b1a2c;
        }

        .nav-item:hover .dropdown,
        .account-menu:hover .account-dropdown {
          display: block;
        }

        .site-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 12px;
        }

        .blackbar {
          height: 62px;
          background: linear-gradient(180deg, #111 0%, #000 100%);
          border-top: 3px solid #c9a227;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          position: relative;
          z-index: 900;
        }

        .burger {
          background: transparent;
          border: none;
          color: #c9a227;
          font-size: 30px;
          cursor: pointer;
        }

        .search {
          flex: 1;
          display: flex;
          justify-content: center;
          margin: 0 40px;
        }

        .search input {
          width: 700px;
          max-width: 100%;
          height: 38px;
          border-radius: 999px;
          border: none;
          padding: 0 18px;
          outline: none;
        }

        .icons {
          display: flex;
          align-items: center;
          gap: 22px;
          position: relative;
        }

        .grid-btn,
        .icon-link {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: #c9a227;
          font-size: 23px;
          cursor: pointer;
          text-decoration: none;
          line-height: 1;
          transition: transform 0.2s ease, color 0.2s ease;
        }

        .cart-link {
          width: 64px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          color: #fff;
          overflow: visible;
          position: relative;
          transition: transform 0.2s ease;
        }

        .cart-svg {
          width: 64px;
          height: 54px;
          display: block;
          overflow: visible;
          filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.18));
          transition: transform 0.2s ease, filter 0.2s ease;
        }

        .cart-link:hover .cart-svg {
          transform: scale(1.06);
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.28));
        }

        .cart-link.pulse .cart-svg {
          animation: cartBounce 0.62s ease;
        }

        .cart-link.pulse .badge-group {
          transform-origin: 51px 12px;
          animation: badgePop 0.62s ease;
        }

        .mini-cart {
          position: absolute;
          top: 58px;
          right: 0;
          width: 190px;
          padding: 14px 16px;
          border-radius: 14px;
          background: #fff;
          color: #111;
          border: 1px solid rgba(212, 162, 76, 0.45);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
          opacity: 0;
          pointer-events: none;
          transform: translateY(8px);
          transition: opacity 0.2s ease, transform 0.2s ease;
          z-index: 3000;
          font-family: Arial, Roboto, sans-serif;
        }

        .mini-cart::before {
          content: "";
          position: absolute;
          top: -7px;
          right: 22px;
          width: 14px;
          height: 14px;
          background: #fff;
          border-left: 1px solid rgba(212, 162, 76, 0.45);
          border-top: 1px solid rgba(212, 162, 76, 0.45);
          transform: rotate(45deg);
        }

        .mini-cart strong {
          display: block;
          color: #6b1a2c;
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .mini-cart small {
          display: block;
          color: #555;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .mini-cart span {
          display: block;
          color: #d4a24c;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .cart-link:hover .mini-cart {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .grid-btn:hover,
        .icon-link:hover,
        .cart-link:hover {
          transform: translateY(-2px);
        }

        @keyframes cartBounce {
          0% { transform: scale(1); }
          30% { transform: scale(1.16) rotate(-5deg); }
          55% { transform: scale(0.94) rotate(3deg); }
          80% { transform: scale(1.05) rotate(0deg); }
          100% { transform: scale(1); }
        }

        @keyframes badgePop {
          0% { transform: scale(1); }
          35% { transform: scale(1.35); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }

        @media (max-width: 1200px) {
          .site-header-inner {
            grid-template-columns: 110px 1fr 210px;
          }

          .site-nav {
            gap: 18px;
          }

          .site-nav > :global(a),
          .nav-item > :global(a),
          .site-actions :global(a),
          .login-link {
            font-size: 13px;
          }
        }

        @media (max-width: 820px) {
          .site-header {
            height: auto;
          }

          .site-header-inner {
            height: auto;
            grid-template-columns: 80px 1fr;
            padding: 10px 16px;
          }

          .site-nav {
            grid-column: 1 / -1;
            justify-content: flex-start;
            overflow-x: auto;
            padding-bottom: 8px;
          }

          .blackbar {
            padding: 0 18px;
          }

          .search {
            margin: 0 18px;
          }

          .mini-cart {
            display: none;
          }
        }
      `}</style>
    </>
  );
}