"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";
import { cleanPracticeText, parsePracticeDuration, shortCoachCode } from "@/lib/practice-session-format";

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
  deroulement?: string | string[] | null;
  variantes?: string | string[] | null;
  temps?: string | number | null;
  metadata?: Record<string, unknown> | null;
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

type SessionGroup = {
  id: string;
  name: string;
  playerIds: string[];
};

const COACHES = [
  { value: "Coach principal", code: "CP", label: "Coach principal" },
  { value: "Assistant coach 1", code: "AC1", label: "Assistant coach 1" },
  { value: "Assistant coach 2", code: "AC2", label: "Assistant coach 2" },
  { value: "Préparateur physique", code: "PP", label: "Préparateur physique" },
  { value: "Responsable vidéo", code: "RV", label: "Responsable vidéo" },
] as const;

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

function playerFirstName(player: TeamPlayer) {
  if (player.firstName) return player.firstName;
  const parts = playerName(player).trim().split(/\s+/);
  return parts[0] || "";
}

function playerLastName(player: TeamPlayer) {
  if (player.lastName) return player.lastName;
  const parts = playerName(player).trim().split(/\s+/);
  return parts.slice(1).join(" ");
}

function coachCode(value: string | null) {
  return shortCoachCode(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatText(value: unknown) {
  const text = cleanPracticeText(value);
  return text ? text.split(/\n+/).map(escapeHtml).join("<br />") : "—";
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


type Html2PdfWorker = {
  set: (options: Record<string, unknown>) => Html2PdfWorker;
  from: (source: HTMLElement | string) => Html2PdfWorker;
  outputPdf: (type: "blob") => Promise<Blob>;
  save: (filename?: string) => Promise<void>;
};

type Html2PdfFactory = () => Html2PdfWorker;

declare global {
  interface Window {
    html2pdf?: Html2PdfFactory;
  }
}

const PRACTICE_PDF_BUCKET = "practice-session-pdfs";

function safeFileName(value: string) {
  return String(value || "fiche-seance")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function htmlForPdf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/window\.print\(\)/g, "");
}

async function loadHtml2Pdf() {
  if (typeof window === "undefined") {
    throw new Error("Génération PDF disponible uniquement dans le navigateur.");
  }

  if (window.html2pdf) return window.html2pdf;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-html2pdf]");

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement html2pdf impossible.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.dataset.html2pdf = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chargement html2pdf impossible."));
    document.head.appendChild(script);
  });

  if (!window.html2pdf) {
    throw new Error("html2pdf n'est pas disponible.");
  }

  return window.html2pdf;
}

async function createPdfBlobFromHtml(html: string) {
  const html2pdf = await loadHtml2Pdf();
  const holder = document.createElement("div");

  // Ne jamais placer la source à -10000px : Safari/WebKit peut conserver
  // ce décalage horizontal dans le canvas et couper presque toute la fiche.
  // Le rendu reste dans la page, derrière l'interface, avec une largeur A4 fixe.
  holder.setAttribute("data-practice-pdf-render", "true");
  holder.style.position = "absolute";
  holder.style.left = "0";
  holder.style.top = "0";
  holder.style.zIndex = "-2147483647";
  holder.style.pointerEvents = "none";
  holder.style.width = "794px";
  holder.style.minWidth = "794px";
  holder.style.maxWidth = "794px";
  holder.style.margin = "0";
  holder.style.padding = "0";
  holder.style.overflow = "visible";
  holder.style.background = "#ffffff";
  holder.innerHTML = htmlForPdf(html);
  document.body.appendChild(holder);

  try {
    const page = holder.querySelector<HTMLElement>(".page") || holder;

    // Sécurise la géométrie avant que html2canvas ne clone le document.
    page.style.position = "relative";
    page.style.left = "0";
    page.style.top = "0";
    page.style.margin = "0";
    page.style.transform = "none";
    page.style.transformOrigin = "top left";
    page.style.width = "794px";
    page.style.minWidth = "794px";
    page.style.maxWidth = "794px";

    return await html2pdf()
      .set({
        margin: 0,
        filename: "fiche-seance.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
          onclone: (clonedDocument: Document) => {
            const clonedHolder = clonedDocument.querySelector<HTMLElement>(
              '[data-practice-pdf-render="true"]'
            );
            const clonedPage = clonedHolder?.querySelector<HTMLElement>(".page");

            if (clonedHolder) {
              clonedHolder.style.position = "absolute";
              clonedHolder.style.left = "0";
              clonedHolder.style.top = "0";
              clonedHolder.style.width = "794px";
              clonedHolder.style.minWidth = "794px";
              clonedHolder.style.maxWidth = "794px";
              clonedHolder.style.margin = "0";
              clonedHolder.style.padding = "0";
              clonedHolder.style.transform = "none";
              clonedHolder.style.overflow = "visible";
            }

            if (clonedPage) {
              clonedPage.style.position = "relative";
              clonedPage.style.left = "0";
              clonedPage.style.top = "0";
              clonedPage.style.width = "794px";
              clonedPage.style.minWidth = "794px";
              clonedPage.style.maxWidth = "794px";
              clonedPage.style.margin = "0";
              clonedPage.style.transform = "none";
              clonedPage.style.transformOrigin = "top left";
            }
          },
        },
        jsPDF: { unit: "px", format: [794, 1123], orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] },
      })
      .from(page)
      .outputPdf("blob");
  } finally {
    holder.remove();
  }
}

function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function notifyCartUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("cart-updated"));
}

function notifySessionCartCleared() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("cart-updated"));
  window.dispatchEvent(new Event("mybasket:session-cart-cleared"));
}

function safeLocalJsonArray(key: string): any[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalJsonArray(key: string, value: any[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Erreur localStorage ${key}:`, error);
  }
}

function getSessionItemCategory(item: CartItem, sessionTheme: string) {
  const text = [
    item.title,
    item.description,
    sessionTheme,
    item.item_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("surnombre")) return "Surnombre";
  if (text.includes("pré") || text.includes("pre") || text.includes("collect")) return "Pré-collectif";
  if (text.includes("tir")) return "Tirs";
  if (text.includes("déf") || text.includes("def")) return "Défense";
  if (text.includes("transition") || text.includes("jeu rapide")) return "Transition / Jeu rapide";
  if (text.includes("1c1") || text.includes("1v1")) return "1c1 / Situations";
  if (text.includes("dribble")) return "Dribble";
  if (text.includes("passe")) return "Passe";
  if (text.includes("phys")) return "Physique";

  if (item.item_type === "system") return "Pré-collectif";
  return sessionTheme ? getSessionThemeCategory(sessionTheme) : "Autre";
}
function getSessionThemeCategory(theme: string) {
  const text = String(theme || "").toLowerCase();
  if (text.includes("surnombre")) return "Surnombre";
  if (text.includes("pré") || text.includes("pre") || text.includes("collect")) return "Pré-collectif";
  if (text.includes("tir")) return "Tirs";
  if (text.includes("déf") || text.includes("def")) return "Défense";
  if (text.includes("transition") || text.includes("jeu rapide")) return "Transition / Jeu rapide";
  if (text.includes("1c1") || text.includes("1v1")) return "1c1 / Situations";
  if (text.includes("dribble")) return "Dribble";
  if (text.includes("passe")) return "Passe";
  if (text.includes("phys")) return "Physique";
  return theme || "Autre";
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
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([
    { id: "group-1", name: "Équipe 1", playerIds: [] },
    { id: "group-2", name: "Équipe 2", playerIds: [] },
  ]);

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

  const allSessionPlayers = useMemo(
    () => [
      ...sessionPlayers.guard,
      ...sessionPlayers.forward,
      ...sessionPlayers.center,
    ],
    [sessionPlayers]
  );

const purchaseItems = useMemo(
  () => [...productItems, ...subscriptionItems],
  [productItems, subscriptionItems]
);

const subtotal = useMemo(() => {
  return purchaseItems.reduce((total, item) => {
    return total + Number(item.price ?? 0) * Number(item.quantity ?? 1);
  }, 0);
}, [purchaseItems]);

  // Les prix affichés et administrés dans MyBasket sont TTC.
  // On extrait la part de TVA uniquement pour information, sans la rajouter.
  const total = subtotal;
  const tax = total - total / 1.2;

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
        // La colonne Explications reprend uniquement le DÉROULEMENT.
        description:
          cleanPracticeText(exercise.deroulement) ||
          cleanPracticeText(exercise.description) ||
          cleanPracticeText(item.metadata?.explanation) ||
          cleanPracticeText(item.description) ||
          null,
        deroulement: exercise.deroulement ?? item.deroulement ?? null,
        variantes: exercise.variantes ?? item.variantes ?? null,
        temps: exercise.temps ?? item.temps ?? null,
        image_url: schemas[0] ?? item.image_url,
        schema_images: schemas,
        schemaImages: schemas,
        // Si aucune consigne n'est renseignée, on affiche les variantes.
        consignes:
          exercise.consignes ??
          exercise.instructions ??
          exercise.variantes ??
          item.consignes ??
          item.instructions ??
          item.variantes ??
          null,
        instructions:
          cleanPracticeText(exercise.consignes) ||
          cleanPracticeText(exercise.instructions) ||
          cleanPracticeText(exercise.variantes) ||
          cleanPracticeText(item.consignes) ||
          cleanPracticeText(item.instructions) ||
          cleanPracticeText(item.variantes) ||
          cleanPracticeText(item.metadata?.instructions) ||
          null,
        // La durée vient d'abord du critère TEMPS de l'exercice.
        duration_minutes: parsePracticeDuration(
          exercise.temps ?? item.temps ?? exercise.duration ?? item.duration_minutes,
          10
        ),
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

  function addSessionGroup() {
    setSessionGroups((prev) => [
      ...prev,
      {
        id: `group-${Date.now()}`,
        name: `Équipe ${prev.length + 1}`,
        playerIds: [],
      },
    ]);
  }

  function renameSessionGroup(groupId: string, name: string) {
    setSessionGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, name } : group))
    );
  }

  function removeSessionGroup(groupId: string) {
    setSessionGroups((prev) => prev.filter((group) => group.id !== groupId));
  }

  function dropPlayerInGroup(groupId: string) {
    if (!draggedPlayer) return;
    const playerId = draggedPlayer.player.id;

    setSessionGroups((prev) =>
      prev.map((group) => ({
        ...group,
        playerIds:
          group.id === groupId
            ? Array.from(new Set([...group.playerIds, playerId]))
            : group.playerIds.filter((id) => id !== playerId),
      }))
    );
    setDraggedPlayer(null);
  }

  function removePlayerFromGroup(groupId: string, playerId: string) {
    setSessionGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, playerIds: group.playerIds.filter((id) => id !== playerId) }
          : group
      )
    );
  }

  async function createCheckout(provider: "stripe" | "paypal" | "apple_pay") {
  try {
    const endpoint = provider === "paypal"
      ? "/api/checkout/paypal"
      : "/api/checkout/stripe";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredMethod: provider }),
    });

    const text = await response.text();

    let data: { url?: string; error?: string } = {};

    try {
      data = JSON.parse(text);
    } catch {
      console.error("Réponse non JSON /api/checkout/stripe :", text);
      alert("Le service de paiement a renvoyé une réponse invalide. Détail dans la console.");
      return;
    }

    if (!response.ok) {
      alert(data.error ?? "Erreur paiement");
      return;
    }

    if (!data.url) {
      alert("Le service de paiement n'a pas renvoyé d'URL.");
      return;
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur checkout:", error);
    alert("Erreur technique lors du paiement.");
  }
}

  async function clearSessionCart(userId: string) {
    const sessionTypes: CartItem["item_type"][] = ["exercise", "system", "session"];

    setItems((prev) => prev.filter((item) => !sessionTypes.includes(item.item_type)));

    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", userId)
      .in("item_type", sessionTypes);

    if (error) {
      console.error("Erreur vidage panier séance:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      await loadCart();
      return;
    }

    notifySessionCartCleared();
  }

  async function saveSessionToCalendar(pdfHtml: string, pdfUrl: string | null) {
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
    const sortedSessionItems = [...sessionItems].sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const totalMinutes = sortedSessionItems.reduce(
      (sum, item) => sum + parsePracticeDuration(item.duration_minutes, 10),
      0
    );
    const clubLogoUrl =
      selectedTeam?.logo ||
      selectedTeam?.logoUrl ||
      selectedTeam?.logo_url ||
      selectedTeam?.clubLogo ||
      selectedTeam?.clubLogoUrl ||
      selectedTeam?.club_logo_url ||
      null;

    const sessionItemsPayload = sortedSessionItems.map((item, index) => ({
      item_type: item.item_type,
      item_id: item.item_id,
      title: item.title,
      description: item.description,
      category: getSessionItemCategory(item, sessionTheme),
      duration_minutes: parsePracticeDuration(item.duration_minutes, 10),
      assigned_to: item.assigned_to ?? "Coach principal",
      sort_order: index + 1,
      image_url: item.image_url,
      schema_images: uniqueImages([
        ...(item.schemaImages ?? []),
        ...(item.schema_images ?? []),
      ]),
      deroulement:
        item.deroulement ??
        item.description ??
        null,
      consignes:
        item.consignes ??
        item.instructions ??
        item.variantes ??
        null,
      variantes: item.variantes ?? null,
      instructions:
        item.instructions ??
        item.consignes ??
        item.variantes ??
        null,
    }));

    const fullSessionPayload = {
      user_id: user.id,
      team_id: isUuid(selectedTeamId) ? selectedTeamId : null,
      team_local_id: selectedTeamId || null,
      team_name: teamName,
      title: `${teamName} • ${sessionTheme}`,
      theme: sessionTheme,
      session_date: sessionDate,
      start_time: sessionStartTime,
      end_time: sessionEndTime,
      location: null,
      duration_minutes: totalMinutes,
      total_minutes: totalMinutes,
      club_logo_url: clubLogoUrl,
      mybasket_logo_url: "/logo-mybasket02.png",
      player_groups: Object.fromEntries(
        sessionGroups
          .filter((group) => group.name.trim())
          .map((group) => [group.name.trim(), group.playerIds])
      ),
      notes: null,
      visibility: "private",
      pdf_generated: true,
      pdf_generated_at: new Date().toISOString(),
      pdf_html: pdfHtml,
      pdf_url: pdfUrl,
      attachment_url: pdfUrl,
      session_content: {
        theme: sessionTheme,
        total_minutes: totalMinutes,
        pdf_html: pdfHtml,
        pdf_url: pdfUrl,
        items: sessionItemsPayload,
        players: sessionPlayers,
        player_groups: Object.fromEntries(
          sessionGroups
            .filter((group) => group.name.trim())
            .map((group) => [group.name.trim(), group.playerIds])
        ),
        team: {
          id: selectedTeamId,
          name: teamName,
          logo_url: clubLogoUrl,
        },
      },
    };

    const legacySessionPayload = {
      user_id: user.id,
      team_id: isUuid(selectedTeamId) ? selectedTeamId : null,
      title: `${teamName} • ${sessionTheme}`,
      theme: sessionTheme,
      session_date: sessionDate,
      start_time: sessionStartTime,
      end_time: sessionEndTime,
      location: null,
      club_logo_url: clubLogoUrl,
      mybasket_logo_url: "/logo-mybasket02.png",
      notes: JSON.stringify({
        team_local_id: selectedTeamId,
        team_name: teamName,
        total_minutes: totalMinutes,
        pdf_html: pdfHtml,
        pdf_url: pdfUrl,
        items: sessionItemsPayload,
        players: sessionPlayers,
        player_groups: Object.fromEntries(
          sessionGroups
            .filter((group) => group.name.trim())
            .map((group) => [group.name.trim(), group.playerIds])
        ),
      }),
      visibility: "private",
      pdf_generated: true,
      pdf_generated_at: new Date().toISOString(),
      pdf_html: pdfHtml,
      pdf_url: pdfUrl,
      attachment_url: pdfUrl,
    };

    let createdSession: { id: string } | null = null;
    let sessionError: any = null;

    const fullInsert = await supabase
      .from("practice_sessions")
      .insert(fullSessionPayload)
      .select("id")
      .single();

    if (fullInsert.error) {
      console.warn("Insertion practice_sessions complète impossible, fallback legacy :", {
        code: fullInsert.error.code,
        message: fullInsert.error.message,
        details: fullInsert.error.details,
        hint: fullInsert.error.hint,
      });

      const legacyInsert = await supabase
        .from("practice_sessions")
        .insert(legacySessionPayload)
        .select("id")
        .single();

      createdSession = legacyInsert.data as { id: string } | null;
      sessionError = legacyInsert.error;
    } else {
      createdSession = fullInsert.data as { id: string } | null;
    }

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

    const fullItemRows = sessionItemsPayload.map((item) => ({
      session_id: createdSession.id,
      team_id: isUuid(selectedTeamId) ? selectedTeamId : null,
      team_local_id: selectedTeamId || null,
      ...item,
    }));

    const legacyItemRows = sessionItemsPayload.map((item) => ({
      session_id: createdSession.id,
      item_type: item.item_type,
      item_id: item.item_id,
      title: item.title,
      category: item.category,
      duration_minutes: item.duration_minutes,
      sort_order: item.sort_order,
    }));

    if (fullItemRows.length > 0) {
      const { error: itemsError } = await supabase
        .from("practice_session_items")
        .insert(fullItemRows);

      if (itemsError) {
        console.warn("Insertion complète practice_session_items impossible, fallback legacy :", {
          code: itemsError.code,
          message: itemsError.message,
          details: itemsError.details,
          hint: itemsError.hint,
        });

        const { error: legacyItemsError } = await supabase
          .from("practice_session_items")
          .insert(legacyItemRows);

        if (legacyItemsError) {
          console.warn("Séance créée sans lignes practice_session_items :", {
            code: legacyItemsError.code,
            message: legacyItemsError.message,
            details: legacyItemsError.details,
            hint: legacyItemsError.hint,
          });
        }
      }
    }

    const practiceExerciseRows = sessionItemsPayload.map((item) => ({
      session_id: createdSession.id,
      user_id: user.id,
      exercise_id: item.item_type === "exercise" ? item.item_id : null,
      title: item.title,
      who: coachCode(item.assigned_to),
      duration_minutes: item.duration_minutes,
      situation_image_url:
        item.schema_images?.[0] || item.image_url || null,
      explanation:
        cleanPracticeText(item.deroulement) ||
        cleanPracticeText(item.description) ||
        null,
      instructions:
        cleanPracticeText(item.consignes) ||
        cleanPracticeText(item.instructions) ||
        cleanPracticeText(item.variantes) ||
        null,
      sort_order: item.sort_order,
    }));

    if (practiceExerciseRows.length > 0) {
      const fullExerciseInsert = await supabase
        .from("practice_session_exercises")
        .insert(practiceExerciseRows);

      if (fullExerciseInsert.error) {
        console.warn(
          "Insertion complète practice_session_exercises impossible, fallback legacy :",
          fullExerciseInsert.error
        );

        const legacyExerciseInsert = await supabase
          .from("practice_session_exercises")
          .insert(
            practiceExerciseRows.map(({ user_id, exercise_id, ...row }) => row)
          );

        if (legacyExerciseInsert.error) {
          console.error(
            "Séance créée sans lignes practice_session_exercises :",
            legacyExerciseInsert.error
          );
        }
      }
    }

    const sessionPlayerRows = (Object.entries(sessionPlayers) as Array<[PlayerPosition, TeamPlayer[]]>)
      .flatMap(([position, players]) =>
        players.map((player) => ({
          session_id: createdSession.id,
          user_id: user.id,
          player_id: player.id,
          first_name: playerFirstName(player),
          last_name: playerLastName(player),
          position,
          selected: true,
        }))
      );

    if (sessionPlayerRows.length > 0) {
      const playerInsert = await supabase
        .from("practice_session_players")
        .insert(sessionPlayerRows);

      if (playerInsert.error) {
        console.warn("Insertion complète practice_session_players impossible, fallback :", playerInsert.error);
        const fallbackRows = sessionPlayerRows.map(({ user_id, player_id, ...row }) => row);
        const fallbackInsert = await supabase
          .from("practice_session_players")
          .insert(fallbackRows);
        if (fallbackInsert.error) {
          console.error("Joueurs non enregistrés dans la séance :", fallbackInsert.error);
        }
      }
    }

    window.dispatchEvent(new Event("mybasket-practice-sessions-updated"));

    const calendarPayload = {
      user_id: user.id,
      title: `${teamName} • ${sessionTheme}`,
      description: `Thème : ${sessionTheme}\nFiche séance : /seances/${createdSession.id}`,
      event_date: sessionDate,
      start_time: sessionStartTime,
      end_time: sessionEndTime,
      location: null,
      event_type: "training",
      session_id: createdSession.id,
      attachment_url: pdfUrl,
      visibility: "private",
    };

    const { data: createdEvent, error } = await supabase
      .from("calendar_events")
      .insert(calendarPayload)
      .select("id")
      .single();

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
      return null;
    }

    window.dispatchEvent(new Event("mybasket-calendar-updated"));

    return {
      sessionId: String(createdSession.id),
      eventId: createdEvent?.id ? String(createdEvent.id) : null,
    };
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
      (sum, item) => sum + parsePracticeDuration(item.duration_minutes, 10),
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

    const teamName = selectedTeam.name ?? selectedTeam.clubName ?? "Équipe";

    const rows = sortedItems
      .map((item) => {
        const duration = parsePracticeDuration(item.duration_minutes, 10);

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
              <strong class="exerciseTitle">${escapeHtml(item.title || "Exercice")}</strong>
              <div class="schemasGrid schemasCount${Math.min(images.length, 6)}">
                ${situationImages}
              </div>
            </td>
            <td class="explain">
              <p>${formatText(item.deroulement ?? item.description)}</p>
            </td>
            <td class="instructions">
              <p>${formatText(item.consignes ?? item.instructions ?? item.variantes)}</p>
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

            html, body {
              height: auto;
            }

            .page {
              position: relative;
              left: 0;
              top: 0;
              width: 794px;
              min-width: 794px;
              max-width: 794px;
              min-height: 0;
              margin: 0;
              padding: 18px 24px 24px;
              display: block;
              vertical-align: top;
              transform: none !important;
              transform-origin: top left;
              overflow: visible;
              background: white;
            }

            .header {
              display: grid;
              grid-template-columns: 110px 1fr 110px;
              align-items: center;
              border-bottom: 3px solid #111;
              padding-bottom: 18px;
            }

            .logoBox {
              width: 96px;
              height: 72px;
              display: grid;
              place-items: center;
            }

            .logoBox img {
              max-width: 96px;
              max-height: 72px;
              object-fit: contain;
            }

            .missingLogo {
              width: 92px;
              height: 68px;
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
              font-size: 30px;
              letter-spacing: 5px;
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
              min-height: 86px;
              border-right: 2px solid #111;
              text-align: center;
              padding-bottom: 12px;
            }

            .playersCol:last-child {
              border-right: 0;
            }

            .playersCol h3 {
              margin: 0 0 12px;
              padding: 7px;
              border-bottom: 2px solid #111;
              background: #f3f3f3;
              font-size: 12px;
              letter-spacing: 1.5px;
            }

            .playersCol p {
              margin: 5px 0;
              font-size: 14px;
              font-weight: 700;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 14px;
              border: 2px solid #111;
              table-layout: fixed;
            }

            thead { display: table-header-group; }
            tbody { display: table-row-group; }
            tr {
              break-inside: avoid;
              page-break-inside: avoid;
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
              padding: 7px;
            }

            .colWho { width: 7%; }
            .colTime { width: 7%; }
            .colSituation { width: 34%; }
            .colExplanation { width: 27%; }
            .colInstructions { width: 25%; }

            .who {
              text-align: center;
              font-size: 15px;
              font-weight: 900;
            }

            .time {
              text-align: center;
              font-size: 19px;
              font-weight: 900;
            }

            .situation {
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
              width: 96px;
              height: 70px;
              object-fit: contain;
              border: 1px solid #ddd;
              border-radius: 6px;
              background: white;
            }

            .emptySchema {
              width: 170px;
              height: 90px;
              margin: 0 auto;
              border: 1px solid #ddd;
              border-radius: 6px;
              display: grid;
              place-items: center;
              color: #aaa;
            }

            .explain {
              font-size: 12px;
              vertical-align: top;
            }

            .exerciseTitle {
              display: block;
              margin: 0 0 7px;
              font-size: 12px;
              line-height: 1.2;
            }

            .explain p,
            .instructions p {
              margin: 8px 0 0;
              line-height: 1.35;
            }

            .instructions {
              color: #555;
              font-size: 12px;
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
              <colgroup>
                <col class="colWho" />
                <col class="colTime" />
                <col class="colSituation" />
                <col class="colExplanation" />
                <col class="colInstructions" />
              </colgroup>
              <thead>
                <tr>
                  <th>QUI</th>
                  <th>TPS</th>
                  <th>EXERCICE</th>
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

    // La séance est d'abord enregistrée dans Supabase avec tous ses exercices.
    // Le PDF est ensuite généré côté serveur avec @react-pdf/renderer :
    // cela évite les décalages Safari/html2canvas et les exercices coupés.
    const saved = await saveSessionToCalendar(html, null);

    if (saved?.sessionId) {
      try {
        const response = await fetch(`/api/seances/${saved.sessionId}/pdf`, {
          method: "POST",
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error || "Génération PDF impossible");
        }

        if (result?.pdfUrl) {
          window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        console.error("Génération PDF serveur impossible:", error);
        alert(
          "La séance est bien créée et ajoutée au calendrier, mais le PDF n'a pas pu être généré automatiquement. Tu peux le régénérer depuis la fiche séance."
        );
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await clearSessionCart(user.id);
      }

      window.location.href = `/seances/${saved.sessionId}`;
      return;
    }

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
            {item.assigned_to ? (
              <p style={{ color: "#6B1A2C", fontWeight: 900 }}>
                Taille : {item.assigned_to}
              </p>
            ) : null}
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
                              <option key={coach.code} value={coach.value}>
                                {coach.code} — {coach.label}
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
            Dont TVA 20 % <strong>{formatPrice(tax)}</strong>
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
                  setSessionGroups([
                    { id: "group-1", name: "Équipe 1", playerIds: [] },
                    { id: "group-2", name: "Équipe 2", playerIds: [] },
                  ]);
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

            <section className="teamBuilder">
              <div className="teamBuilderHead">
                <div>
                  <h3>COMPOSITION DES ÉQUIPES</h3>
                  <p>Glisse les joueurs présents dans les équipes. Un joueur ne peut être que dans une seule équipe.</p>
                </div>
                <button type="button" className="addGroupBtn" onClick={addSessionGroup}>
                  + Ajouter une équipe
                </button>
              </div>

              <div className="groupsGrid">
                {sessionGroups.map((group) => {
                  const groupPlayers = group.playerIds
                    .map((id) => allSessionPlayers.find((player) => player.id === id))
                    .filter((player): player is TeamPlayer => Boolean(player));

                  return (
                    <div
                      key={group.id}
                      className="groupCard"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropPlayerInGroup(group.id)}
                    >
                      <div className="groupCardHead">
                        <input
                          value={group.name}
                          onChange={(event) => renameSessionGroup(group.id, event.target.value)}
                          aria-label="Nom de l'équipe"
                        />
                        <button
                          type="button"
                          className="removeGroupBtn"
                          onClick={() => removeSessionGroup(group.id)}
                          aria-label="Supprimer l'équipe"
                        >
                          ×
                        </button>
                      </div>

                      <div className="groupDropZone">
                        {groupPlayers.length === 0 ? (
                          <span>Dépose les joueurs ici</span>
                        ) : (
                          groupPlayers.map((player) => (
                            <div key={player.id} className="groupPlayer">
                              <span>{playerName(player)}</span>
                              <button
                                type="button"
                                onClick={() => removePlayerFromGroup(group.id, player.id)}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

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


        .teamBuilder {
          margin-top: 24px;
          padding: 20px;
          border: 1px solid #ead9d1;
          border-radius: 18px;
          background: #fffaf6;
        }
        .teamBuilderHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 16px;
        }
        .teamBuilderHead h3 { margin: 0 0 4px; color: #6b1a2c; }
        .teamBuilderHead p { margin: 0; color: #766b66; font-size: 13px; }
        .addGroupBtn {
          border: 0; border-radius: 12px; padding: 11px 14px;
          background: #6b1a2c; color: #fff; font-weight: 800; cursor: pointer;
          white-space: nowrap;
        }
        .groupsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }
        .groupCard {
          min-height: 150px;
          border: 1px dashed #c69a84;
          border-radius: 14px;
          background: #fff;
          padding: 12px;
        }
        .groupCardHead { display: flex; gap: 8px; margin-bottom: 10px; }
        .groupCardHead input {
          flex: 1; border: 1px solid #e3d5ce; border-radius: 10px;
          padding: 9px 10px; font-weight: 900; color: #6b1a2c;
        }
        .removeGroupBtn {
          width: 36px; border: 0; border-radius: 10px; background: #ffe7e7;
          color: #b42338; font-size: 20px; cursor: pointer;
        }
        .groupDropZone { min-height: 92px; display: flex; flex-direction: column; gap: 7px; }
        .groupDropZone > span { color: #a69b96; text-align: center; padding-top: 28px; }
        .groupPlayer {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          border-radius: 10px; padding: 9px 10px; background: #f6ebe6; font-weight: 800;
        }
        .groupPlayer button { border: 0; background: transparent; color: #b42338; cursor: pointer; font-size: 17px; }
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