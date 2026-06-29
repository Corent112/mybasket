"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";

type CartItem = {
  id: string;
  user_id: string;
  item_type: "product" | "exercise" | "system" | "session" | "subscription";
  item_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  quantity: number;
  duration_minutes: number | null;
  assigned_to: string | null;
  sort_order: number;
  consignes?: string | string[] | null;
  instructions?: string | string[] | null;
  schemaImages?: string[];
  schema_images?: string[];
};

type TeamPlayer = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  poste?: string;
  position?: string;
};

type Team = {
  id: string;
  name?: string;
  clubName?: string;
  category?: string;
  categorie?: string;
  logo?: string;
  logoUrl?: string;
  logo_url?: string;
  clubLogo?: string;
  clubLogoUrl?: string;
  club_logo_url?: string;
  players?: TeamPlayer[];
  effectif?: TeamPlayer[];
};

type PlayerPosition = "guard" | "forward" | "center";
type SessionPlayers = Record<PlayerPosition, TeamPlayer[]>;

const COACHES = [
  "Coach principal",
  "Assistant coach",
  "Préparateur physique",
  "Responsable vidéo",
];

const emptyPlayers: SessionPlayers = {
  guard: [],
  forward: [],
  center: [],
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function playerName(player: TeamPlayer) {
  return (
    player.name ||
    `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim() ||
    "Joueur"
  );
}

function coachCode(value: string | null) {
  if (value === "Assistant coach") return "AC";
  if (value === "Préparateur physique") return "PP";
  if (value === "Responsable vidéo") return "RV";
  return "CP";
}

function formatText(value: unknown) {
  if (!value) return "—";

  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String).join("<br />");
  }

  const text = String(value).trim();

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).map(String).join("<br />");
    }

    return String(parsed).replace(/\n/g, "<br />");
  } catch {
    return text
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .replace(/^"/, "")
      .replace(/"$/, "")
      .replace(/\\"/g, '"')
      .replace(/\n/g, "<br />");
  }
}

function normalizePosition(player: TeamPlayer): PlayerPosition {
  const raw = String(player.poste ?? player.position ?? "").toLowerCase();

  if (raw.includes("pivot") || raw.includes("center") || raw.includes("5")) {
    return "center";
  }

  if (
    raw.includes("ailier") ||
    raw.includes("forward") ||
    raw.includes("3") ||
    raw.includes("4")
  ) {
    return "forward";
  }

  return "guard";
}

function uniqueImages(images: Array<string | null | undefined>) {
  return Array.from(new Set(images.filter(Boolean) as string[]));
}
function subscriptionImage(title: string) {
  const slug = title.toLowerCase();

  if (slug.includes("basic")) return "/images/abonnement-basic.png";
  if (slug.includes("pro")) return "/images/abonnement-pro.png";
  if (slug.includes("premium")) return "/images/abonnement-premium.png";

  if (slug.includes("bronze")) return "/images/club-bronze.png";
  if (slug.includes("silver")) return "/images/club-silver.png";
  if (slug.includes("gold")) return "/images/club-gold.png";

  return "/images/abonnement-basic.png";
}
function notifyCartUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("cart-updated"));
}
export default function PanierPage() {
  const supabase = createClient();

  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionStartTime, setSessionStartTime] = useState("");
  const [sessionEndTime, setSessionEndTime] = useState("");
  const [sessionTheme, setSessionTheme] = useState("");
  const [sessionPlayers, setSessionPlayers] =
    useState<SessionPlayers>(emptyPlayers);
  const [draggedPlayer, setDraggedPlayer] = useState<{
    player: TeamPlayer;
    from: PlayerPosition;
  } | null>(null);

  const productItems = items.filter((item) => item.item_type === "product");
  const subscriptionItems = items.filter(
  (item) => item.item_type === "subscription"
);
  const sessionItems = items.filter(
    (item) =>
      item.item_type === "exercise" ||
      item.item_type === "system" ||
      item.item_type === "session"
  );

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);

const purchaseItems = useMemo(
  () => [...productItems, ...subscriptionItems],
  [productItems, subscriptionItems]
);

const subtotal = useMemo(() => {
  return purchaseItems.reduce((total, item) => {
    return total + Number(item.price ?? 0) * Number(item.quantity ?? 1);
  }, 0);
}, [purchaseItems]);

  const tax = subtotal * 0.2;
  const total = subtotal + tax;

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    await Promise.all([loadCart(), loadTeams()]);
  }

  async function loadTeams() {
    try {
      const data = await getTeams();
      setTeams((data ?? []) as Team[]);
    } catch (error) {
      console.error("Erreur chargement équipes:", error);
      setTeams([]);
    }
  }

  async function loadCart() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("cart_items")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const cartItems = (data ?? []) as CartItem[];

    const exerciseIds = cartItems
      .filter((item) => item.item_type === "exercise" && item.item_id)
      .map((item) => item.item_id as string);

    let exercisesById: Record<string, any> = {};

    if (exerciseIds.length > 0) {
      const { data: exercisesData } = await supabase
        .from("exercises")
        .select("*")
        .in("id", exerciseIds);

      exercisesById = Object.fromEntries(
        (exercisesData ?? []).map((exercise: { id: string; [key: string]: unknown }) => [exercise.id, exercise])
      );
    }

    const enrichedItems = cartItems.map((item) => {
      if (item.item_type !== "exercise" || !item.item_id) return item;

      const exercise = exercisesById[item.item_id];

      if (!exercise) return item;

      const schemas = uniqueImages([
        ...(exercise.schema_images ?? []),
        ...(exercise.schemaImages ?? []),
      ]);

      return {
        ...item,
        title: exercise.title ?? item.title,
        description:
          exercise.organisation ?? exercise.description ?? item.description,
        image_url: schemas[0] ?? item.image_url,
        schema_images: schemas,
        schemaImages: schemas,
        consignes:
          exercise.consignes ??
          exercise.instructions ??
          item.consignes ??
          item.instructions ??
          null,
        instructions:
          exercise.instructions ??
          exercise.consignes ??
          item.instructions ??
          item.consignes ??
          null,
      };
    });

    setItems(enrichedItems);

window.dispatchEvent(
  new CustomEvent("cart-updated", {
    detail: {
      count: enrichedItems.reduce(
        (sum, item) => sum + (item.quantity ?? 1),
        0
      ),
    },
  })
);

setLoading(false);
  }

  async function removeItem(id: string) {
  setItems((prev) => prev.filter((item) => item.id !== id));

  const { error } = await supabase.from("cart_items").delete().eq("id", id);

  notifyCartUpdated();

  if (error) {
    console.error("Erreur suppression panier:", error);
    loadCart();
    return;
  }

  loadCart();
}

  async function updateQuantity(id: string, quantity: number) {
  const nextQuantity = Math.max(1, Number(quantity) || 1);

  setItems((prev) =>
    prev.map((item) =>
      item.id === id ? { ...item, quantity: nextQuantity } : item
    )
  );

  const { error } = await supabase
    .from("cart_items")
    .update({ quantity: nextQuantity })
    .eq("id", id);

  notifyCartUpdated();

  if (error) {
    console.error("Erreur update quantité:", error);
    loadCart();
    return;
  }

  loadCart();
}

  async function updateDuration(id: string, duration: number) {
    const nextDuration = Math.max(1, duration || 1);

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, duration_minutes: nextDuration } : item
      )
    );

    await supabase
      .from("cart_items")
      .update({ duration_minutes: nextDuration })
      .eq("id", id);
  }

  async function updateAssignedTo(id: string, assignedTo: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, assigned_to: assignedTo } : item
      )
    );

    await supabase
      .from("cart_items")
      .update({ assigned_to: assignedTo })
      .eq("id", id);
  }

  async function moveSessionItem(id: string, direction: "up" | "down") {
    const sessionOnly = [...sessionItems].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    const index = sessionOnly.findIndex((item) => item.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= sessionOnly.length) return;

    const current = sessionOnly[index];
    const target = sessionOnly[targetIndex];

    setItems((prev) =>
      prev.map((item) => {
        if (item.id === current.id) {
          return { ...item, sort_order: target.sort_order };
        }

        if (item.id === target.id) {
          return { ...item, sort_order: current.sort_order };
        }

        return item;
      })
    );

    await supabase
      .from("cart_items")
      .update({ sort_order: target.sort_order })
      .eq("id", current.id);

    await supabase
      .from("cart_items")
      .update({ sort_order: current.sort_order })
      .eq("id", target.id);
  }

  function importPlayersFromSelectedTeam() {
    if (!selectedTeam) {
      alert("Sélectionne d'abord une équipe.");
      return;
    }

    const players = selectedTeam.players ?? selectedTeam.effectif ?? [];

    const next: SessionPlayers = {
      guard: [],
      forward: [],
      center: [],
    };

    players.forEach((player) => {
      next[normalizePosition(player)].push(player);
    });

    setSessionPlayers(next);
  }

  function removePlayer(position: PlayerPosition, playerId: string) {
    setSessionPlayers((prev) => ({
      ...prev,
      [position]: prev[position].filter((player) => player.id !== playerId),
    }));
  }

  function dropPlayer(to: PlayerPosition) {
    if (!draggedPlayer) return;

    const { player } = draggedPlayer;

    setSessionPlayers((prev) => {
      const withoutPlayer = {
        guard: prev.guard.filter((p) => p.id !== player.id),
        forward: prev.forward.filter((p) => p.id !== player.id),
        center: prev.center.filter((p) => p.id !== player.id),
      };

      return {
        ...withoutPlayer,
        [to]: [...withoutPlayer[to], player],
      };
    });

    setDraggedPlayer(null);
  }

  async function createCheckout(provider: "stripe" | "paypal" | "apple_pay") {
  if (provider !== "stripe") {
    alert("Ce moyen de paiement arrive bientôt.");
    return;
  }

  try {
    const response = await fetch("/api/checkout/stripe", {
      method: "POST",
    });

    const text = await response.text();

    let data: { url?: string; error?: string } = {};

    try {
      data = JSON.parse(text);
    } catch {
      console.error("Réponse non JSON /api/checkout/stripe :", text);
      alert("Erreur serveur Stripe. Détail affiché dans la console.");
      return;
    }

    if (!response.ok) {
      alert(data.error ?? "Erreur paiement");
      return;
    }

    if (!data.url) {
      alert("Stripe n'a pas renvoyé d'URL de paiement.");
      return;
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur checkout:", error);
    alert("Erreur technique lors du paiement.");
  }
}

  async function saveSessionToCalendar() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    alert("Connecte-toi pour ajouter la séance au calendrier.");
    return;
  }

  const isUuid = (value: string | null | undefined) =>
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
      value
    );

  const teamName = selectedTeam?.name ?? selectedTeam?.clubName ?? "Équipe";

  const { data: createdSession, error: sessionError } = await supabase
    .from("practice_sessions")
    .insert({
      user_id: user.id,
      owner_id: user.id,
      team_id: isUuid(selectedTeamId) ? selectedTeamId : null,
      title: `Séance ${teamName}`,
      theme: sessionTheme,
      session_date: sessionDate,
      start_time: sessionStartTime,
      end_time: sessionEndTime,
      location: teamName,
      club_logo_url:
        selectedTeam?.logo ||
        selectedTeam?.logoUrl ||
        selectedTeam?.logo_url ||
        selectedTeam?.clubLogo ||
        selectedTeam?.clubLogoUrl ||
        selectedTeam?.club_logo_url ||
        null,
      mybasket_logo_url: "/logo-mybasket02.png",
      notes: null,
      visibility: "private",
      pdf_generated: true,
      pdf_generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !createdSession) {
    console.error("Erreur création practice_sessions:", {
      code: sessionError?.code,
      message: sessionError?.message,
      details: sessionError?.details,
      hint: sessionError?.hint,
    });

    alert(
      `La fiche est générée, mais la séance Supabase n'a pas été créée : ${sessionError?.message}`
    );

    return;
  }

  const { error } = await supabase.from("calendar_events").insert({
    user_id: user.id,
    owner_id: user.id,

    title: `Séance ${teamName}`,
    description: `Thème : ${sessionTheme}`,

    event_date: sessionDate,
    start_time: sessionStartTime,
    end_time: sessionEndTime,

    location: teamName,
    event_type: "training",

    session_id: createdSession.id,
    attachment_url: null,

    visibility: "private",
  });

  if (error) {
    console.error("Erreur ajout calendrier:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    alert(
      `La fiche est générée, mais l’ajout au calendrier a échoué : ${error.message}`
    );
  }
}

  async function generateSessionPdf() {
    if (!sessionDate || !sessionStartTime || !sessionEndTime || !sessionTheme) {
      alert("Renseigne la date, l'heure de début, l'heure de fin et le thème.");
      return;
    }

    if (!selectedTeam) {
      alert("Sélectionne une équipe associée.");
      return;
    }

    const sortedItems = [...sessionItems].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    if (sortedItems.length === 0) {
      alert("Ajoute au moins un exercice ou système dans ta séance.");
      return;
    }

    const totalMinutes = sortedItems.reduce(
      (sum, item) => sum + Number(item.duration_minutes ?? 15),
      0
    );

    const myBasketLogo = "/logo-mybasket02.png";

    const logoClub =
      selectedTeam.logo ||
      selectedTeam.logoUrl ||
      selectedTeam.logo_url ||
      selectedTeam.clubLogo ||
      selectedTeam.clubLogoUrl ||
      selectedTeam.club_logo_url ||
      "";

    const rows = sortedItems
      .map((item) => {
        const duration = item.duration_minutes ?? 15;

        const schemas = uniqueImages([
          ...(item.schemaImages ?? []),
          ...(item.schema_images ?? []),
        ]);

        const images =
          schemas.length > 0 ? schemas : item.image_url ? [item.image_url] : [];

        const situationImages =
          images.length > 0
            ? images
                .map(
                  (image) => `
                    <img src="${image}" alt="${item.title}" />
                  `
                )
                .join("")
            : `<div class="emptySchema">Schéma</div>`;

        return `
          <tr>
            <td class="who">${coachCode(item.assigned_to)}</td>
            <td class="time">${duration}'</td>
            <td class="situation">
              <div class="schemasGrid schemasCount${Math.min(images.length, 6)}">
                ${situationImages}
              </div>
            </td>
            <td class="explain">
              <strong>${item.title}</strong>
              <p>${item.description ?? "—"}</p>
            </td>
            <td class="instructions">
              <p>${formatText(item.consignes ?? item.instructions)}</p>
            </td>
          </tr>
        `;
      })
      .join("");

    const playersColumn = (title: string, players: TeamPlayer[]) => `
      <div class="playersCol">
        <h3>${title}</h3>
        ${players.map((player) => `<p>${playerName(player)}</p>`).join("")}
      </div>
    `;

    const clubLogoHtml = logoClub
      ? `<img src="${logoClub}" />`
      : `<div class="missingLogo">LOGO CLUB</div>`;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Fiche séance MyBasket</title>
          <style>
            * { box-sizing: border-box; }

            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              color: #111;
              background: white;
            }

            .page {
              width: 1120px;
              min-height: 790px;
              margin: 0 auto;
              padding: 24px;
              background: white;
            }

            .header {
              display: grid;
              grid-template-columns: 150px 1fr 150px;
              align-items: center;
              border-bottom: 3px solid #111;
              padding-bottom: 18px;
            }

            .logoBox {
              width: 120px;
              height: 90px;
              display: grid;
              place-items: center;
            }

            .logoBox img {
              max-width: 120px;
              max-height: 90px;
              object-fit: contain;
            }

            .missingLogo {
              width: 110px;
              height: 80px;
              display: grid;
              place-items: center;
              border: 2px dashed #ccc;
              font-size: 11px;
              font-weight: 900;
              color: #999;
            }

            .title {
              text-align: center;
            }

            .title h1 {
              margin: 0 0 12px;
              font-size: 38px;
              letter-spacing: 8px;
              font-weight: 900;
            }

            .title p {
              margin: 4px 0;
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }

            .players {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              border: 2px solid #111;
              border-top: 0;
            }

            .playersCol {
              min-height: 100px;
              border-right: 2px solid #111;
              text-align: center;
              padding-bottom: 12px;
            }

            .playersCol:last-child {
              border-right: 0;
            }

            .playersCol h3 {
              margin: 0 0 12px;
              padding: 10px;
              border-bottom: 2px solid #111;
              background: #f3f3f3;
              font-size: 14px;
              letter-spacing: 2px;
            }

            .playersCol p {
              margin: 5px 0;
              font-size: 14px;
              font-weight: 700;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 18px;
              border: 2px solid #111;
            }

            th {
              height: 34px;
              border: 2px solid #111;
              background: #f3f3f3;
              font-size: 13px;
              letter-spacing: 2px;
            }

            td {
              border: 2px solid #111;
              vertical-align: middle;
              padding: 10px;
            }

            .who {
              width: 55px;
              text-align: center;
              font-size: 18px;
              font-weight: 900;
            }

            .time {
              width: 60px;
              text-align: center;
              font-size: 24px;
              font-weight: 900;
            }

            .situation {
              width: 340px;
              text-align: center;
            }

            .schemasGrid {
              display: grid;
              gap: 6px;
              justify-items: center;
              align-items: center;
            }

            .schemasCount1 {
              grid-template-columns: 1fr;
            }

            .schemasCount2,
            .schemasCount3,
            .schemasCount4 {
              grid-template-columns: repeat(2, 1fr);
            }

            .schemasCount5,
            .schemasCount6 {
              grid-template-columns: repeat(3, 1fr);
            }

            .situation img {
              width: 125px;
              height: 90px;
              object-fit: contain;
              border: 1px solid #ddd;
              border-radius: 6px;
              background: white;
            }

            .emptySchema {
              width: 230px;
              height: 120px;
              margin: 0 auto;
              border: 1px solid #ddd;
              border-radius: 6px;
              display: grid;
              place-items: center;
              color: #aaa;
            }

            .explain {
              width: 360px;
              font-size: 15px;
            }

            .explain strong {
              font-size: 17px;
            }

            .explain p,
            .instructions p {
              margin: 8px 0 0;
              line-height: 1.45;
            }

            .instructions {
              width: 300px;
              color: #555;
            }

            .footer {
              text-align: center;
              margin-top: 16px;
              color: #aaa;
              font-size: 12px;
              letter-spacing: 1px;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .page {
                width: 100%;
                margin: 0;
                padding: 10mm;
              }
            }
          </style>
        </head>

        <body>
          <div class="page">
            <div class="header">
              <div class="logoBox">
                <img src="${myBasketLogo}" />
              </div>

              <div class="title">
                <h1>PRACTICE PLAN</h1>
                <p><strong>Date :</strong> ${sessionDate}</p>
                <p><strong>Horaire :</strong> ${sessionStartTime} - ${sessionEndTime}</p>
                <p><strong>Thème :</strong> ${sessionTheme}</p>
                <p><strong>Équipe :</strong> ${
                  selectedTeam.name ?? selectedTeam.clubName ?? "Équipe"
                }</p>
              </div>

              <div class="logoBox">
                ${clubLogoHtml}
              </div>
            </div>

            <div class="players">
              ${playersColumn("GUARD", sessionPlayers.guard)}
              ${playersColumn("FORWARD", sessionPlayers.forward)}
              ${playersColumn("CENTER", sessionPlayers.center)}
            </div>

            <table>
              <thead>
                <tr>
                  <th>QUI</th>
                  <th>TPS</th>
                  <th>SITUATIONS</th>
                  <th>EXPLICATIONS</th>
                  <th>CONSIGNES</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>

            <div class="footer">
              ${
                selectedTeam.name ?? selectedTeam.clubName ?? "MyBasket"
              } · Practice Plan · ${sortedItems.length} ateliers · ${totalMinutes} min · MyBasket
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Autorise les pop-ups pour générer la fiche séance.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    await saveSessionToCalendar();
    setSessionModalOpen(false);
  }

  if (loading) {
    return (
      <main className="cartPage">
        <p>Chargement du panier...</p>
      </main>
    );
  }

  return (
    <main className="cartPage">
      <section className="hero">
        <h1>MON PANIER</h1>
        <p>Gérez vos achats, vos contenus et construisez votre séance.</p>
      </section>

      <section className="cartGrid">
        <div className="panel">
  <div className="panelTitle">
    <h2>ACHATS PRODUITS</h2>
    <span>{productItems.length + subscriptionItems.length}</span>
  </div>

  {productItems.length === 0 && subscriptionItems.length === 0 ? (
    <div className="empty">Aucun produit dans le panier.</div>
  ) : (
    <>
      {subscriptionItems.map((item) => (
        <article className="productCard" key={item.id}>
          <div className="thumb">
            <img src={subscriptionImage(item.title)} alt={item.title} />
          </div>

          <div className="info">
            <h3>{item.title}</h3>
            <p>
              Abonnement MyBasket ·{" "}
              {item.assigned_to === "yearly" ? "Annuel" : "Mensuel"}
            </p>
            <strong>{formatPrice(Number(item.price ?? 0))}</strong>
          </div>

          <div className="quantity">
            <button
              type="button"
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
            >
              -
            </button>

            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
            />

            <button
              type="button"
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="delete"
            onClick={() => removeItem(item.id)}
          >
            🗑
          </button>
        </article>
      ))}

      {productItems.map((item) => (
        <article className="productCard" key={item.id}>
          <div className="thumb">
            {item.image_url ? (
              <img src={item.image_url} alt={item.title} />
            ) : (
              "🛍️"
            )}
          </div>

          <div className="info">
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <strong>{formatPrice(Number(item.price ?? 0))}</strong>
          </div>

          <div className="quantity">
            <button
              type="button"
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
            >
              -
            </button>

            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
            />

            <button
              type="button"
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="delete"
            onClick={() => removeItem(item.id)}
          >
            🗑
          </button>
        </article>
      ))}
    </>
  )}

  <Link href="/boutique" className="outlineBtn">
    ← Continuer mes achats
  </Link>
</div>

        <div className="panel">
          <div className="panelTitle">
            <h2>CONSTRUCTION DE LA SÉANCE</h2>
            <span>{sessionItems.length}</span>
          </div>

          {sessionItems.length === 0 ? (
            <div className="empty">Aucun exercice ajouté à ta fiche séance.</div>
          ) : (
            <>
              {sessionItems
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item, index) => (
                  <article className="sessionCard" key={item.id}>
                    <div className="order">
                      <button
                        type="button"
                        onClick={() => moveSessionItem(item.id, "up")}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() => moveSessionItem(item.id, "down")}
                      >
                        ↓
                      </button>
                    </div>

                    <div className="sessionThumb">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} />
                      ) : (
                        "🏀"
                      )}
                    </div>

                    <div className="sessionInfo">
                      <div className="sessionTop">
                        <h3>
                          {index + 1}. {item.title}
                        </h3>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                        >
                          🗑
                        </button>
                      </div>

                      <p>{item.description}</p>

                      <div className="settings">
                        <label>
                          Temps en minutes
                          <input
                            type="number"
                            min={1}
                            value={item.duration_minutes ?? ""}
                            placeholder="Ex : 12"
                            onChange={(e) =>
                              updateDuration(item.id, Number(e.target.value))
                            }
                          />
                        </label>

                        <label>
                          Fait par
                          <select
                            value={item.assigned_to ?? "Coach principal"}
                            onChange={(e) =>
                              updateAssignedTo(item.id, e.target.value)
                            }
                          >
                            {COACHES.map((coach) => (
                              <option key={coach} value={coach}>
                                {coach}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </article>
                ))}

              <button
                type="button"
                className="createSessionBtn"
                onClick={() => setSessionModalOpen(true)}
              >
                🏀 GÉNÉRER MA FICHE SÉANCE
              </button>
            </>
          )}
        </div>
      </section>

      <section className="summary">
        <div>
          <h2>RÉSUMÉ DE COMMANDE</h2>
          <p>
            Sous-total <strong>{formatPrice(subtotal)}</strong>
          </p>
          <p>
            TVA 20% <strong>{formatPrice(tax)}</strong>
          </p>
          <div className="total">
            TOTAL TTC <strong>{formatPrice(total)}</strong>
          </div>
        </div>

        <div className="promo">
          <input placeholder="Code promo" />
          <button type="button">OK</button>
        </div>

        <div className="payBox">
          <button type="button" onClick={() => createCheckout("stripe")}>
            💳 Carte bancaire
          </button>

          <button type="button" onClick={() => createCheckout("paypal")}>
            PayPal
          </button>

          <button type="button" onClick={() => createCheckout("apple_pay")}>
             Pay
          </button>
        </div>
      </section>

      {sessionModalOpen && (
        <div className="modalOverlay">
          <div className="sessionModal">
            <button
              type="button"
              className="modalClose"
              onClick={() => setSessionModalOpen(false)}
            >
              ×
            </button>

            <h2>⚙️ Configurer la séance</h2>

            <div className="modalGrid">
              <label>
                Date
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </label>

              <label>
                Heure début
                <input
                  type="time"
                  value={sessionStartTime}
                  onChange={(e) => setSessionStartTime(e.target.value)}
                />
              </label>

              <label>
                Heure fin
                <input
                  type="time"
                  value={sessionEndTime}
                  onChange={(e) => setSessionEndTime(e.target.value)}
                />
              </label>

              <label>
                Thème
                <input
                  value={sessionTheme}
                  placeholder="Ex : Défense tout-terrain"
                  onChange={(e) => setSessionTheme(e.target.value)}
                />
              </label>
            </div>

            <label className="fullLabel">
              Équipe associée
              <select
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  setSessionPlayers(emptyPlayers);
                }}
              >
                <option value="">Sélectionner une équipe</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name ?? team.clubName ?? "Équipe sans nom"}
                    {team.category || team.categorie
                      ? ` (${team.category ?? team.categorie})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="importBtn"
              onClick={importPlayersFromSelectedTeam}
            >
              👥 Importer les joueurs de cette équipe
            </button>

            <p className="help">
              Tu peux supprimer un joueur ou le glisser dans une autre colonne.
            </p>

            <div className="playersBoard">
              {(["guard", "forward", "center"] as PlayerPosition[]).map(
                (position) => (
                  <div
                    key={position}
                    className="playersColumn"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropPlayer(position)}
                  >
                    <h3>
                      {position === "guard"
                        ? "GUARD"
                        : position === "forward"
                          ? "FORWARD"
                          : "CENTER"}
                    </h3>

                    {sessionPlayers[position].length === 0 ? (
                      <div className="emptyPlayer">Aucun joueur</div>
                    ) : (
                      sessionPlayers[position].map((player) => (
                        <div
                          key={player.id}
                          className="playerChip"
                          draggable
                          onDragStart={() =>
                            setDraggedPlayer({ player, from: position })
                          }
                        >
                          <span>{playerName(player)}</span>
                          <button
                            type="button"
                            onClick={() => removePlayer(position, player.id)}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )
              )}
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="cancelBtn"
                onClick={() => setSessionModalOpen(false)}
              >
                Annuler
              </button>

              <button
                type="button"
                className="saveBtn"
                onClick={generateSessionPdf}
              >
                📄 Générer la fiche PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .cartPage {
          background: #fff;
          min-height: 100vh;
          padding: 42px 56px 70px;
          color: #111;
        }

        .hero {
          text-align: center;
          margin-bottom: 38px;
        }

        .hero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 52px;
          font-family: Oswald, Roboto, sans-serif;
          letter-spacing: 1px;
        }

        .hero p {
          color: #666;
        }

        .cartGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 34px;
        }

        .panel,
        .summary {
          background: #fff;
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 22px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.07);
        }

        .panelTitle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #d4a24c;
          padding-bottom: 12px;
          margin-bottom: 18px;
        }

        .panelTitle h2,
        .summary h2 {
          margin: 0;
          color: #7a0d24;
          font-family: Oswald, Roboto, sans-serif;
        }

        .panelTitle span {
          background: #7a0d24;
          color: #fff;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 900;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 12px;
          padding: 38px;
          text-align: center;
          color: #777;
        }

        .productCard {
  display: grid;
  grid-template-columns: 150px 1fr 120px 50px;
  gap: 24px;
  align-items: center;

  border: 1px solid #eee;
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 14px;
}

        .thumb,
.sessionThumb {
  background: #f6f6f6;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb {
  width: 150px;
  height: 150px;
  flex-shrink: 0;
}

.sessionThumb {
  height: 76px;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sessionThumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;

  min-width: 0;
}

.info h3 {
  margin: 0;
  color: #6B1A2C;
  font-size: 22px;
  font-weight: 900;
}

.info p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.info strong {
  color: #6B1A2C;
  font-size: 32px;
  font-weight: 900;
}

        .quantity {
          display: flex;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
        }

        .quantity button {
          width: 36px;
          border: none;
          background: #f7f7f7;
          font-weight: 900;
          cursor: pointer;
        }

        .quantity input {
          width: 50px;
          height: 38px;
          border: none;
          text-align: center;
          font-weight: 800;
        }

        .delete {
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 18px;
        }
.quantity {
  align-items: center;
  justify-content: center;
}

.delete {
  display: flex;
  align-items: center;
  justify-content: center;
}
        .sessionCard {
          display: grid;
          grid-template-columns: 42px 92px 1fr;
          gap: 16px;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 14px;
          align-items: center;
        }

        .order {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .order button {
          height: 28px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          color: #7a0d24;
          font-weight: 900;
          cursor: pointer;
        }

        .sessionTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .sessionTop button {
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .settings {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .settings label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: #7a0d24;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .settings select,
        .settings input {
          height: 38px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
          padding: 0 10px;
        }

        .outlineBtn {
          display: inline-flex;
          margin-top: 10px;
          height: 46px;
          padding: 0 22px;
          align-items: center;
          justify-content: center;
          border: 1px solid #d4a24c;
          border-radius: 8px;
          color: #7a0d24;
          text-decoration: none;
          font-weight: 900;
        }

        .createSessionBtn {
          width: 100%;
          height: 58px;
          background: linear-gradient(90deg, #7a0d24, #9f1738);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 18px;
          font-size: 16px;
          letter-spacing: 0.5px;
          cursor: pointer;
        }

        .summary {
          margin-top: 30px;
          display: grid;
          grid-template-columns: 1fr 1fr 1.5fr;
          gap: 26px;
          align-items: center;
        }

        .summary p,
        .total {
          display: flex;
          justify-content: space-between;
        }

        .total {
          border-top: 1px solid #ddd;
          margin-top: 12px;
          padding-top: 14px;
          color: #7a0d24;
          font-size: 20px;
          font-weight: 900;
        }

        .promo {
          display: flex;
        }

        .promo input {
          flex: 1;
          height: 52px;
          border: 1px solid #ddd;
          border-radius: 8px 0 0 8px;
          padding: 0 14px;
        }

        .promo button {
          width: 70px;
          border: none;
          background: #7a0d24;
          color: white;
          font-weight: 900;
          border-radius: 0 8px 8px 0;
        }

        .payBox {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
        }

        .payBox button {
          height: 56px;
          border: none;
          border-radius: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .payBox button:nth-child(1) {
          background: linear-gradient(90deg, #7a0d24, #a20f36);
          color: white;
        }

        .payBox button:nth-child(2) {
          background: #ffc439;
          color: #111;
        }

        .payBox button:nth-child(3) {
          background: #111;
          color: white;
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.62);
          z-index: 999;
          display: grid;
          place-items: center;
          padding: 24px;
        }

        .sessionModal {
          width: min(850px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: white;
          border-radius: 18px;
          padding: 34px;
          position: relative;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35);
        }

        .modalClose {
          position: absolute;
          top: 20px;
          right: 24px;
          width: 38px;
          height: 38px;
          border: none;
          background: transparent;
          font-size: 36px;
          cursor: pointer;
        }

        .sessionModal h2 {
          margin: 0 0 24px;
          font-size: 30px;
          font-family: Oswald, Roboto, sans-serif;
        }

        .modalGrid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .modalGrid label,
        .fullLabel {
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: #7a0d24;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .modalGrid input,
        .fullLabel select {
          height: 44px;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 14px;
          color: #111;
          background: white;
        }

        .fullLabel {
          margin-top: 14px;
        }

        .importBtn {
          margin-top: 12px;
          height: 46px;
          border: 2px solid #111;
          border-radius: 999px;
          background: white;
          font-weight: 900;
          cursor: pointer;
          padding: 0 20px;
        }

        .help {
          margin: 12px 0 16px;
          color: #777;
          font-size: 13px;
        }

        .playersBoard {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }

        .playersColumn {
          min-height: 210px;
          border: 1px solid #ddd;
          border-radius: 12px;
          padding: 12px;
          background: #fafafa;
        }

        .playersColumn h3 {
          margin: 0 0 12px;
          text-align: center;
          border-bottom: 2px solid #111;
          padding-bottom: 8px;
          font-size: 15px;
          letter-spacing: 1px;
        }

        .playerChip {
          min-height: 38px;
          background: white;
          border: 1px solid #e4e4e4;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          margin-bottom: 8px;
          cursor: grab;
          font-weight: 800;
          font-size: 13px;
        }

        .playerChip button {
          border: none;
          background: #7a0d24;
          color: white;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          cursor: pointer;
        }

        .emptyPlayer {
          border: 1px dashed #ccc;
          border-radius: 10px;
          padding: 20px;
          text-align: center;
          color: #999;
          font-size: 13px;
        }

        .modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        .cancelBtn,
        .saveBtn {
          height: 50px;
          border-radius: 999px;
          padding: 0 24px;
          font-weight: 900;
          cursor: pointer;
        }

        .cancelBtn {
          background: white;
          border: 2px solid #111;
        }

        .saveBtn {
          background: #111;
          color: white;
          border: 2px solid #111;
        }

        @media (max-width: 1100px) {
          .cartPage {
            padding: 28px 20px;
          }

          .cartGrid,
          .summary,
          .payBox,
          .modalGrid,
          .playersBoard {
            grid-template-columns: 1fr;
          }

          .productCard {
  display: grid;
  grid-template-columns: 140px 1fr auto auto;
  gap: 18px;
  align-items: center;

  padding: 18px;
  border: 1px solid #ececec;
  border-radius: 12px;
  margin-bottom: 12px;
}

          .quantity,
          .delete {
            grid-column: 2;
          }

          .sessionCard {
            grid-template-columns: 1fr;
          }

          .settings {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}