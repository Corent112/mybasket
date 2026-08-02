"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
  club_id?: string | null;
  players?: TeamPlayer[];
  effectif?: TeamPlayer[];
};

type PlayerPosition = "guard" | "forward" | "center";
type SessionPlayers = Record<PlayerPosition, TeamPlayer[]>;

type CompositionTeam = {
  id: string;
  name: string;
  playerIds: string[];
};

type CompositionPreset =
  | "2v2"
  | "3v3"
  | "4v4"
  | "5v5"
  | "large";

type TeamCompositionBlock = {
  id: string;
  title: string;
  playersPerTeam: number;
  preset: CompositionPreset;
  teams: CompositionTeam[];
};

const COACHES = [
  "Coach principal",
  "Assistant coach",
  "Préparateur physique",
  "Responsable vidéo",
];

const compositionUid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function compositionPresetConfig(preset: CompositionPreset) {
  if (preset === "2v2") {
    return { title: "2 contre 2", playersPerTeam: 2, teamCount: 2 };
  }

  if (preset === "4v4") {
    return { title: "4 contre 4", playersPerTeam: 4, teamCount: 2 };
  }

  if (preset === "5v5") {
    return { title: "5 contre 5", playersPerTeam: 5, teamCount: 2 };
  }

  if (preset === "large") {
    return { title: "Grande équipe", playersPerTeam: 0, teamCount: 2 };
  }

  return { title: "3 contre 3", playersPerTeam: 3, teamCount: 3 };
}

function createCompositionBlock(
  preset: CompositionPreset = "3v3",
): TeamCompositionBlock {
  const config = compositionPresetConfig(preset);

  return {
    id: compositionUid("block"),
    title: config.title,
    playersPerTeam: config.playersPerTeam,
    preset,
    teams: Array.from({ length: config.teamCount }, (_, index) => ({
      id: compositionUid("team"),
      name: `Équipe ${index + 1}`,
      playerIds: [],
    })),
  };
}

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

function readTeamsFromLocalStorage(): Team[] {
  if (typeof window === "undefined") return [];

  const keys = ["mybasket_equipes", "mybasket_teams", "teams"];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.teams)) return parsed.teams;
      if (Array.isArray(parsed?.equipes)) return parsed.equipes;
    } catch {
      continue;
    }
  }

  return [];
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
  const [savingSession, setSavingSession] = useState(false);
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
  const [compositionBlocks, setCompositionBlocks] = useState<TeamCompositionBlock[]>([
    createCompositionBlock("3v3"),
  ]);
  const [draggedCompositionPlayer, setDraggedCompositionPlayer] = useState<{
    blockId: string;
    playerId: string;
    fromTeamId?: string;
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
    void loadCart();
    void loadTeamsAndPlayers();
  }, []);

  async function loadTeamsAndPlayers() {
    const { data: teamRows, error: teamError } = await supabase.from("teams").select("*").order("name");
    if (teamError) { console.error(teamError); setTeams(readTeamsFromLocalStorage()); return; }
    const rawTeams = (teamRows ?? []) as Array<Record<string, any>>;
    const teamIds = rawTeams.map((team) => String(team.id || "")).filter(Boolean);
    const clubIds = Array.from(new Set(rawTeams.map((team) => String(team.club_id || "")).filter(Boolean)));
    const [{ data: playerRows }, { data: clubRows }] = await Promise.all([
      teamIds.length ? supabase.from("players").select("*").in("team_id", teamIds) : Promise.resolve({ data: [] as any[] }),
      clubIds.length ? supabase.from("clubs").select("*").in("id", clubIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const clubs = new Map(((clubRows ?? []) as Array<Record<string, any>>).map((club) => [String(club.id), club]));
    const playersByTeam = new Map<string, TeamPlayer[]>();
    for (const row of (playerRows ?? []) as Array<Record<string, any>>) {
      const key = String(row.team_id || "");
      const player: TeamPlayer = { id: String(row.id), firstName: String(row.first_name || ""), lastName: String(row.last_name || ""), position: String(row.position_primary || row.position || "") };
      playersByTeam.set(key, [...(playersByTeam.get(key) || []), player]);
    }
    setTeams(rawTeams.map((team) => {
      const club = clubs.get(String(team.club_id || "")) || {};
      return { ...team, id: String(team.id), name: String(team.name || team.nom || "Équipe"), clubName: String(club.name || club.nom || ""), club_logo_url: String(team.club_logo_url || team.logo_url || team.logo || club.logo_url || club.club_logo_url || club.logo || club.image_url || club.avatar_url || ""), players: playersByTeam.get(String(team.id)) || [] } as Team;
    }));
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
        ((exercisesData ?? []) as Array<Record<string, any>>).map(
          (exercise: Record<string, any>) => [String(exercise.id), exercise],
        )
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

  const allSessionPlayers = useMemo(
    () => [
      ...sessionPlayers.guard,
      ...sessionPlayers.forward,
      ...sessionPlayers.center,
    ],
    [sessionPlayers],
  );

  function addCompositionBlock(
    preset: CompositionPreset = "3v3",
  ) {
    setCompositionBlocks((current) => [
      ...current,
      createCompositionBlock(preset),
    ]);
  }

  function changeCompositionPreset(
    blockId: string,
    preset: CompositionPreset,
  ) {
    const config = compositionPresetConfig(preset);

    setCompositionBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId) return block;

        const teams = [...block.teams];

        while (teams.length < config.teamCount) {
          teams.push({
            id: compositionUid("team"),
            name: `Équipe ${teams.length + 1}`,
            playerIds: [],
          });
        }

        return {
          ...block,
          preset,
          title: config.title,
          playersPerTeam: config.playersPerTeam,
          teams:
            preset === "large"
              ? teams.slice(0, 2)
              : teams,
        };
      }),
    );
  }

  function updateCompositionBlock(
    blockId: string,
    patch: Partial<TeamCompositionBlock>,
  ) {
    setCompositionBlocks((current) =>
      current.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block,
      ),
    );
  }

  function removeCompositionBlock(blockId: string) {
    setCompositionBlocks((current) =>
      current.filter((block) => block.id !== blockId),
    );
  }

  function duplicateCompositionBlock(blockId: string) {
    setCompositionBlocks((current) => {
      const source = current.find((block) => block.id === blockId);
      if (!source) return current;
      return [
        ...current,
        {
          ...source,
          id: compositionUid("block"),
          title: `${source.title} — copie`,
          preset: source.preset,
          teams: source.teams.map((team) => ({
            ...team,
            id: compositionUid("team"),
            playerIds: [...team.playerIds],
          })),
        },
      ];
    });
  }

  function addCompositionTeam(blockId: string) {
    setCompositionBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              teams: [
                ...block.teams,
                {
                  id: compositionUid("team"),
                  name: `Équipe ${block.teams.length + 1}`,
                  playerIds: [],
                },
              ],
            }
          : block,
      ),
    );
  }

  function updateCompositionTeam(
    blockId: string,
    teamId: string,
    patch: Partial<CompositionTeam>,
  ) {
    setCompositionBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              teams: block.teams.map((team) =>
                team.id === teamId ? { ...team, ...patch } : team,
              ),
            }
          : block,
      ),
    );
  }

  function removeCompositionTeam(blockId: string, teamId: string) {
    setCompositionBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              teams: block.teams.filter((team) => team.id !== teamId),
            }
          : block,
      ),
    );
  }

  function movePlayerInComposition(
    blockId: string,
    teamId: string,
    playerId: string,
  ) {
    setCompositionBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId) return block;

        return {
          ...block,
          teams: block.teams.map((team) => ({
            ...team,
            playerIds:
              team.id === teamId
                ? Array.from(new Set([...team.playerIds, playerId]))
                : team.playerIds.filter((id) => id !== playerId),
          })),
        };
      }),
    );
  }

  function removePlayerFromComposition(
    blockId: string,
    teamId: string,
    playerId: string,
  ) {
    setCompositionBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              teams: block.teams.map((team) =>
                team.id === teamId
                  ? {
                      ...team,
                      playerIds: team.playerIds.filter(
                        (id) => id !== playerId,
                      ),
                    }
                  : team,
              ),
            }
          : block,
      ),
    );
  }

  function startCompositionDrag(
    blockId: string,
    playerId: string,
    fromTeamId?: string,
  ) {
    setDraggedCompositionPlayer({ blockId, playerId, fromTeamId });
  }

  function dropCompositionPlayer(
    blockId: string,
    teamId: string,
  ) {
    if (
      !draggedCompositionPlayer ||
      draggedCompositionPlayer.blockId !== blockId
    ) {
      return;
    }

    movePlayerInComposition(
      blockId,
      teamId,
      draggedCompositionPlayer.playerId,
    );
    setDraggedCompositionPlayer(null);
  }

  function returnCompositionPlayerToPool(blockId: string) {
    if (
      !draggedCompositionPlayer ||
      draggedCompositionPlayer.blockId !== blockId ||
      !draggedCompositionPlayer.fromTeamId
    ) {
      setDraggedCompositionPlayer(null);
      return;
    }

    removePlayerFromComposition(
      blockId,
      draggedCompositionPlayer.fromTeamId,
      draggedCompositionPlayer.playerId,
    );
    setDraggedCompositionPlayer(null);
  }

  function autoDistributeComposition(blockId: string) {
    setCompositionBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId) return block;
        const size = Math.max(1, block.playersPerTeam || 1);
        const needed = Math.max(1, Math.ceil(allSessionPlayers.length / size));
        const teams: CompositionTeam[] = block.teams
          .slice(0, Math.max(needed, block.teams.length))
          .map((team) => ({ ...team, playerIds: [] }));

        while (teams.length < needed) {
          teams.push({
            id: compositionUid("team"),
            name: `Équipe ${teams.length + 1}`,
            playerIds: [],
          });
        }

        allSessionPlayers.forEach((player, index) => {
          teams[index % teams.length]?.playerIds.push(player.id);
        });

        return { ...block, teams };
      }),
    );
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
      team_reference_id: selectedTeamId || null,
      team_name: teamName,
      team_composition_blocks: compositionBlocks,
      player_groups: Object.fromEntries(
        (compositionBlocks[0]?.teams || []).map((team) => [
          team.name,
          team.playerIds,
        ]),
      ),
      title: sessionTheme,
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

  const positionedPlayers = [
    ...sessionPlayers.guard.map((player) => ({ player, position: "guard" })),
    ...sessionPlayers.forward.map((player) => ({ player, position: "forward" })),
    ...sessionPlayers.center.map((player) => ({ player, position: "center" })),
  ];

  if (positionedPlayers.length > 0) {
    await supabase.from("practice_session_players").insert(
      positionedPlayers.map(({ player, position }) => ({
        user_id: user.id,
        session_id: createdSession.id,
        player_id: player.id,
        first_name: player.firstName || player.name || "",
        last_name: player.lastName || "",
        position,
        selected: true,
        status: "pending",
      })),
    );

    await supabase.from("practice_session_attendance").insert(
      positionedPlayers.map(({ player }) => ({
        user_id: user.id,
        session_id: createdSession.id,
        player_id: player.id,
        first_name: player.firstName || player.name || "",
        last_name: player.lastName || "",
        selected: true,
        status: "pending",
        comment: "",
      })),
    );
  }

  const { error } = await supabase.from("calendar_events").insert({
    user_id: user.id,
    owner_id: user.id,
    team_id: selectedTeamId || null,
    team_name: teamName,
    assigned_player_ids: positionedPlayers.map(({ player }) => player.id),
    title: `${teamName} • ${sessionTheme}`,
    theme: sessionTheme,
    description: `Fiche séance : /seances/${createdSession.id}`,
    event_date: sessionDate,
    start_time: sessionStartTime,
    end_time: sessionEndTime,
    location: teamName,
    event_type: "training",
    session_id: createdSession.id,
    attachment_url: null,
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
    if (savingSession) return;
    setSavingSession(true);
    if (!sessionDate || !sessionStartTime || !sessionEndTime || !sessionTheme) {
      alert("Renseigne la date, l'heure de début, l'heure de fin et le thème.");
      setSavingSession(false);
      return;
    }

    if (!selectedTeam) {
      alert("Sélectionne une équipe associée.");
      setSavingSession(false);
      return;
    }

    const sortedItems = [...sessionItems].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    if (sortedItems.length === 0) {
      alert("Ajoute au moins un exercice ou système dans ta séance.");
      setSavingSession(false);
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
      setSavingSession(false);
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    await saveSessionToCalendar();
    setSessionModalOpen(false);
    setSavingSession(false);
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

            <section className="compositionBuilder">
              <div className="compositionHeader">
                <div>
                  <h3>COMPOSITIONS D’ÉQUIPES</h3>
                  <p>
                    Glisse les étiquettes des joueurs présents entre les équipes.
                    Le dépassement est autorisé : une équipe peut afficher 4/3,
                    6/5, etc.
                  </p>
                </div>
              </div>

              <div className="compositionBlocks">
                {compositionBlocks.map((block, blockIndex) => {
                  const assignedIds = new Set(
                    block.teams.flatMap((team) => team.playerIds),
                  );

                  const availablePlayers = allSessionPlayers.filter(
                    (player) => !assignedIds.has(player.id),
                  );

                  return (
                    <article className="compositionBlock" key={block.id}>
                      <div className="blockToolbar">
                        <span className="blockIndex">{blockIndex + 1}</span>

                        <label className="presetField">
                          Type de composition
                          <select
                            value={block.preset}
                            onChange={(event) =>
                              changeCompositionPreset(
                                block.id,
                                event.target.value as CompositionPreset,
                              )
                            }
                          >
                            <option value="2v2">2 contre 2</option>
                            <option value="3v3">3 contre 3</option>
                            <option value="4v4">4 contre 4</option>
                            <option value="5v5">5 contre 5</option>
                            <option value="large">
                              Grande équipe
                            </option>
                          </select>
                        </label>

                        {block.preset !== "large" && (
                          <label>
                            Joueurs / équipe
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={block.playersPerTeam}
                              onChange={(event) =>
                                updateCompositionBlock(block.id, {
                                  playersPerTeam: Number(
                                    event.target.value || 1,
                                  ),
                                })
                              }
                            />
                          </label>
                        )}

                        <div className="blockToolbarActions">
                          <button
                            type="button"
                            onClick={() =>
                              autoDistributeComposition(block.id)
                            }
                          >
                            Répartir automatiquement
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              duplicateCompositionBlock(block.id)
                            }
                          >
                            Dupliquer le bloc
                          </button>

                          {compositionBlocks.length > 1 && (
                            <button
                              type="button"
                              className="dangerMini"
                              onClick={() =>
                                removeCompositionBlock(block.id)
                              }
                            >
                              Supprimer le bloc
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        className="availablePlayerPool"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() =>
                          returnCompositionPlayerToPool(block.id)
                        }
                      >
                        <div className="poolHeader">
                          <strong>
                            JOUEURS PRÉSENTS À L’ENTRAÎNEMENT
                          </strong>
                          <span>{availablePlayers.length}</span>
                        </div>

                        <div className="playerPool">
                          {availablePlayers.length === 0 ? (
                            <small>
                              Tous les joueurs sont placés dans ce bloc.
                            </small>
                          ) : (
                            availablePlayers.map((player) => (
                              <div
                                className="compositionPlayerTag"
                                key={player.id}
                                draggable
                                onDragStart={() =>
                                  startCompositionDrag(
                                    block.id,
                                    player.id,
                                  )
                                }
                                onDragEnd={() =>
                                  setDraggedCompositionPlayer(null)
                                }
                              >
                                <span className="playerInitial">
                                  {playerName(player)
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <strong>{playerName(player)}</strong>
                                <span className="dragDots">⠿</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="compositionTeamGrid">
                        {block.teams.map((team, teamIndex) => {
                          const limit =
                            block.preset === "large"
                              ? null
                              : block.playersPerTeam;

                          const isOver =
                            limit !== null &&
                            team.playerIds.length > limit;

                          const isComplete =
                            limit !== null &&
                            team.playerIds.length === limit;

                          return (
                            <div
                              className={`compositionTeamBoard teamTone${
                                (teamIndex % 6) + 1
                              }`}
                              key={team.id}
                              onDragOver={(event) =>
                                event.preventDefault()
                              }
                              onDrop={() =>
                                dropCompositionPlayer(
                                  block.id,
                                  team.id,
                                )
                              }
                            >
                              <div className="teamBoardHeader">
                                <span className="teamDot" />

                                <input
                                  value={team.name}
                                  onChange={(event) =>
                                    updateCompositionTeam(
                                      block.id,
                                      team.id,
                                      { name: event.target.value },
                                    )
                                  }
                                />

                                <strong
                                  className={
                                    isOver
                                      ? "countOver"
                                      : isComplete
                                        ? "countComplete"
                                        : "countUnder"
                                  }
                                >
                                  {limit === null
                                    ? team.playerIds.length
                                    : `${team.playerIds.length}/${limit}`}
                                </strong>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeCompositionTeam(
                                      block.id,
                                      team.id,
                                    )
                                  }
                                  aria-label="Supprimer l’équipe"
                                >
                                  ×
                                </button>
                              </div>

                              <div className="teamBoardDropzone">
                                {team.playerIds.length === 0 ? (
                                  <div className="teamDropHint">
                                    Glisser un joueur ici
                                  </div>
                                ) : (
                                  team.playerIds.map((playerId) => {
                                    const player =
                                      allSessionPlayers.find(
                                        (item) =>
                                          item.id === playerId,
                                      );

                                    if (!player) return null;

                                    return (
                                      <div
                                        className="compositionPlayerTag placed"
                                        key={playerId}
                                        draggable
                                        onDragStart={() =>
                                          startCompositionDrag(
                                            block.id,
                                            playerId,
                                            team.id,
                                          )
                                        }
                                        onDragEnd={() =>
                                          setDraggedCompositionPlayer(
                                            null,
                                          )
                                        }
                                      >
                                        <span className="playerInitial">
                                          {playerName(player)
                                            .slice(0, 2)
                                            .toUpperCase()}
                                        </span>
                                        <strong>
                                          {playerName(player)}
                                        </strong>
                                        <span className="dragDots">
                                          ⠿
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removePlayerFromComposition(
                                              block.id,
                                              team.id,
                                              playerId,
                                            )
                                          }
                                        >
                                          ×
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {block.preset !== "large" && (
                          <button
                            type="button"
                            className="addCompositionTeam"
                            onClick={() =>
                              addCompositionTeam(block.id)
                            }
                          >
                            <span>+</span>
                            Ajouter une équipe
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="addCompositionBlockFooter">
                <button
                  type="button"
                  onClick={() => addCompositionBlock("3v3")}
                >
                  + Ajouter un nouveau bloc de composition
                </button>
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
                disabled={savingSession}
              >
                {savingSession ? "Enregistrement…" : "📄 Générer la fiche PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .compositionBuilder {
          margin-top: 22px;
          padding: 20px;
          border: 1px solid #ead8ca;
          border-radius: 20px;
          background: #fffdfb;
        }

        .compositionHeader h3 {
          margin: 0;
          color: #6b1a2c;
          font-size: 21px;
        }

        .compositionHeader p {
          margin: 6px 0 0;
          color: #746a6e;
          font-size: 12px;
          line-height: 1.5;
        }

        .compositionBlocks {
          display: grid;
          gap: 20px;
          margin-top: 18px;
        }

        .compositionBlock {
          padding: 16px;
          border: 1px solid #eadfd9;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 10px 28px rgba(55, 24, 34, 0.05);
        }

        .blockToolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: end;
          gap: 12px;
          padding-bottom: 15px;
          border-bottom: 1px solid #eee5e0;
        }

        .blockIndex {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          align-self: center;
          border-radius: 50%;
          background: #6b1a2c;
          color: #fff;
          font-size: 17px;
          font-weight: 950;
        }

        .presetField {
          min-width: 260px;
        }

        .blockToolbar label {
          color: #71666b;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .blockToolbar select,
        .blockToolbar input {
          display: block;
          min-height: 44px;
          margin-top: 5px;
          border: 1px solid #d9cfca;
          border-radius: 10px;
          background: #fff;
          color: #2b2327;
          font-size: 14px;
          font-weight: 800;
        }

        .blockToolbar select {
          width: 100%;
        }

        .blockToolbar input {
          width: 90px;
        }

        .blockToolbarActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-left: auto;
        }

        .blockToolbarActions button {
          min-height: 42px;
          padding: 0 14px;
          border: 1px solid #ded3ce;
          border-radius: 999px;
          background: #fff;
          color: #2d2529;
          font-weight: 900;
          cursor: pointer;
        }

        .blockToolbarActions button:first-child {
          border-color: #6b1a2c;
          background: #6b1a2c;
          color: #fff;
        }

        .blockToolbarActions .dangerMini {
          border-color: #efc3ca;
          color: #d22740;
        }

        .availablePlayerPool {
          margin-top: 15px;
          padding: 14px;
          border: 1px solid #ead8c8;
          border-radius: 15px;
          background: #fffaf5;
        }

        .poolHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .poolHeader strong {
          color: #6b1a2c;
          font-size: 11px;
          letter-spacing: 0.05em;
        }

        .poolHeader span {
          min-width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 9px;
          background: #171216;
          color: #d4a24c;
          font-size: 10px;
          font-weight: 950;
        }

        .playerPool {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-height: 43px;
          align-items: center;
        }

        .playerPool small {
          color: #978b90;
          font-size: 10px;
        }

        .compositionPlayerTag {
          display: inline-grid;
          grid-template-columns: 30px auto 18px;
          align-items: center;
          gap: 7px;
          min-height: 42px;
          padding: 5px 8px 5px 5px;
          border: 1px solid #ddd3ce;
          border-radius: 10px;
          background: #fff;
          color: #2b2327;
          box-shadow: 0 4px 10px rgba(45, 20, 28, 0.05);
          cursor: grab;
          user-select: none;
        }

        .compositionPlayerTag:active {
          cursor: grabbing;
        }

        .compositionPlayerTag strong {
          font-size: 11px;
          white-space: nowrap;
        }

        .playerInitial {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #171216;
          color: #d4a24c;
          font-size: 9px;
          font-weight: 950;
        }

        .dragDots {
          color: #aaa0a4;
          font-size: 15px;
        }

        .compositionTeamGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .compositionTeamBoard {
          min-height: 220px;
          overflow: hidden;
          border: 1px solid #ddd3ce;
          border-top: 4px solid #cf344b;
          border-radius: 16px;
          background: #fff;
        }

        .teamTone1 { border-top-color: #cf344b; }
        .teamTone2 { border-top-color: #2f3033; }
        .teamTone3 { border-top-color: #d4a24c; }
        .teamTone4 { border-top-color: #2f659d; }
        .teamTone5 { border-top-color: #34815f; }
        .teamTone6 { border-top-color: #754d91; }

        .teamBoardHeader {
          display: grid;
          grid-template-columns: 10px minmax(0, 1fr) auto 32px;
          gap: 8px;
          align-items: center;
          padding: 11px;
          border-bottom: 1px solid #eee5e0;
          background: #fbf9f8;
        }

        .teamDot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: currentColor;
        }

        .teamTone1 .teamDot { color: #cf344b; }
        .teamTone2 .teamDot { color: #2f3033; }
        .teamTone3 .teamDot { color: #d4a24c; }
        .teamTone4 .teamDot { color: #2f659d; }
        .teamTone5 .teamDot { color: #34815f; }
        .teamTone6 .teamDot { color: #754d91; }

        .teamBoardHeader input {
          min-width: 0;
          border: 0;
          background: transparent;
          color: #2d2529;
          font-size: 13px;
          font-weight: 950;
        }

        .teamBoardHeader strong {
          font-size: 12px;
          font-weight: 950;
        }

        .countComplete {
          color: #21824c;
        }

        .countUnder {
          color: #c38c25;
        }

        .countOver {
          color: #d32b42;
        }

        .teamBoardHeader button {
          width: 32px;
          height: 32px;
          border: 0;
          border-radius: 9px;
          background: #fee9ec;
          color: #cc2940;
          font-size: 15px;
          font-weight: 950;
          cursor: pointer;
        }

        .teamBoardDropzone {
          min-height: 165px;
          display: flex;
          flex-wrap: wrap;
          align-content: flex-start;
          gap: 8px;
          padding: 14px;
          background:
            linear-gradient(#f3f0ee 1px, transparent 1px),
            linear-gradient(90deg, #f3f0ee 1px, transparent 1px),
            #fff;
          background-size: 22px 22px;
        }

        .teamDropHint {
          width: 100%;
          min-height: 130px;
          display: grid;
          place-items: center;
          border: 1px dashed #d8cbc4;
          border-radius: 11px;
          color: #9d9296;
          font-size: 10px;
        }

        .compositionPlayerTag.placed {
          grid-template-columns: 30px auto 18px 23px;
          align-self: flex-start;
          border-color: #d4a24c;
          background: #fff9e5;
        }

        .compositionPlayerTag.placed button {
          width: 23px;
          height: 23px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 7px;
          background: #6b1a2c;
          color: #fff;
          font-size: 11px;
          font-weight: 950;
          cursor: pointer;
        }

        .addCompositionTeam {
          min-height: 220px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 8px;
          border: 1px dashed #d8c2b4;
          border-radius: 16px;
          background: #fffaf8;
          color: #6b1a2c;
          font-weight: 950;
          cursor: pointer;
        }

        .addCompositionTeam span {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #6b1a2c;
          color: #fff;
          font-size: 21px;
        }

        .addCompositionBlockFooter {
          display: flex;
          justify-content: center;
          margin-top: 18px;
        }

        .addCompositionBlockFooter button {
          width: 100%;
          min-height: 58px;
          border: 1px dashed #d8c2b4;
          border-radius: 15px;
          background: #fff;
          color: #6b1a2c;
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
        }

        @media (max-width: 980px) {
          .compositionTeamGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .blockToolbarActions {
            width: 100%;
            margin-left: 0;
          }
        }

        @media (max-width: 650px) {
          .compositionTeamGrid {
            grid-template-columns: 1fr;
          }

          .presetField {
            min-width: 100%;
          }

          .blockToolbarActions {
            flex-direction: column;
          }
        }

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
          grid-template-columns: 108px minmax(0, 1fr) 118px 44px;
          gap: 18px;
          align-items: center;
          border: 1px solid #eadfd9;
          border-radius: 16px;
          padding: 14px;
          margin-bottom: 12px;
          background: #fff;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .productCard:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(57, 25, 35, 0.08);
        }

        .thumb,
.sessionThumb {
          background: #f6f3f1;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .thumb {
          width: 108px;
          height: 108px;
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
  gap: 10px;
  min-width: 0;
}

.info h3 {
  margin: 0;
  color: #241b1f;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 950;
}

.info strong {
  color: #6B1A2C;
  font-size: 22px;
  font-weight: 950;
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