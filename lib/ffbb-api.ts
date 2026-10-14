import { competitionSeason } from "@/lib/team-season";

type Game = {
  sourceKey: string;
  round: string;
  date: string;
  time: string;
  homeAway: "home" | "away" | "unknown";
  homeTeam: string;
  awayTeam: string;
  opponent: string;
  ourScore: number | null;
  opponentScore: number | null;
};
type TeamStats = {
  played: number;
  wins: number;
  losses: number;
  pointsFor: number | null;
  pointsAgainst: number | null;
};

function text(raw: string) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[|*_`]+/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function teamNameMatches(cell: string, wanted: string) {
  const n = norm(cell);
  return n === wanted || (wanted.length > 5 && n.includes(wanted)) || (n.length > 5 && wanted.includes(n));
}

type ApiEngagement = {
  id: string;
  nom: string;
  numeroEquipe?: string | number | null;
  idOrganisme?: { code?: string | null } | null;
  idPoule?: { id: string; nom?: string | null } | null;
  idCompetition?: { id?: string; nom?: string | null } | null;
};

type ApiClassement = {
  id?: string;
  idEngagement?: { id?: string; nom?: string } | null;
  matchJoues?: string | number | null;
  points?: string | number | null;
  position?: string | number | null;
  gagnes?: string | number | null;
  perdus?: string | number | null;
  paniersMarques?: string | number | null;
  paniersEncaisses?: string | number | null;
};

type ApiRencontre = {
  id: string;
  numero?: string | number | null;
  numeroJournee?: string | number | null;
  resultatEquipe1?: string | number | null;
  resultatEquipe2?: string | number | null;
  joue?: boolean | null;
  nomEquipe1?: string | null;
  nomEquipe2?: string | null;
  date_rencontre?: string | null;
  idEngagementEquipe1?: { id?: string; nom?: string } | null;
  idEngagementEquipe2?: { id?: string; nom?: string } | null;
};

const FFBB_API_ORIGIN = "https://api.ffbb.com";
const FFBB_TIMEOUT_MS = 15000;

async function ffbbFetch(input: string, init: RequestInit = {}) {
  const target = new URL(input, FFBB_API_ORIGIN);
  if (target.origin !== FFBB_API_ORIGIN) throw new Error("Destination FFBB API interdite");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FFBB_TIMEOUT_MS);
  try {
    return await fetch(target, {
      ...init,
      headers: {
        ...(typeof window === "undefined" ? { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/136 Safari/537.36" } : {}),
        "accept-language": "fr-FR,fr;q=0.9",
        ...init.headers,
      },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function ffbbApiToken() {
  const response = await ffbbFetch("/items/configuration", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`FFBB API configuration ${response.status}`);
  const json = await response.json();
  const token = json?.data?.key_dh;
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) {
    throw new Error("FFBB API token indisponible");
  }
  // Le token reste uniquement dans la mémoire de cette requête serveur.
  return token;
}

async function ffbbApiGet(path: string, token: string) {
  if (!path.startsWith("/items/ffbbserver_")) throw new Error("Collection FFBB API interdite");
  const browser = typeof window !== "undefined";
  const target = new URL(path, FFBB_API_ORIGIN);
  // Authentification publique Directus, uniquement vers l’origine FFBB fixe.
  // Dans le navigateur, ce mode évite un préflight Authorization non autorisé.
  if (browser) target.searchParams.set("access_token", token);
  const response = await ffbbFetch(`${target.pathname}${target.search}`, {
    headers: {
      accept: "application/json",
      ...(browser ? {} : { authorization: `Bearer ${token}` }),
    },
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`FFBB API ${response.status}`);
  const json = await response.json();
  if (!json || typeof json !== "object" || !("data" in json)) {
    throw new Error("Réponse FFBB API invalide");
  }
  return json;
}

function apiNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function apiDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function apiTime(value: string | null | undefined) {
  if (!value) return "";
  const m = value.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

export async function fetchTeamFromFfbbApi(sourceUrl: string, requestedTeam: string, publicToken = "") {
  const parsedUrl = new URL(sourceUrl);
  const engagementId = parsedUrl.pathname.match(/\/equipes\/([^/?#]+)/i)?.[1] || "";
  if (!engagementId) throw new Error("Identifiant équipe FFBB introuvable");

  const token = publicToken || await ffbbApiToken();

  // L'identifiant présent dans /equipes/{id} correspond à l'engagement FFBB.
  const engagementQuery = new URLSearchParams();
  [
    "id",
    "nom",
    "numeroEquipe",
    "idOrganisme.code",
    "idPoule.id",
    "idPoule.nom",
    "idCompetition.id",
    "idCompetition.nom",
  ].forEach((field) => engagementQuery.append("fields[]", field));

  const engagementJson = await ffbbApiGet(
    `/items/ffbbserver_engagements/${encodeURIComponent(engagementId)}?${engagementQuery.toString()}`,
    token
  );
  const engagement = engagementJson?.data as ApiEngagement | undefined;
  if (!engagement?.idPoule?.id) throw new Error("Poule FFBB introuvable pour cette équipe");

  const pouleQuery = new URLSearchParams();
  [
    "id",
    "nom",
    "rencontres.id",
    "rencontres.numero",
    "rencontres.numeroJournee",
    "rencontres.resultatEquipe1",
    "rencontres.resultatEquipe2",
    "rencontres.joue",
    "rencontres.nomEquipe1",
    "rencontres.nomEquipe2",
    "rencontres.date_rencontre",
    "rencontres.idEngagementEquipe1.id",
    "rencontres.idEngagementEquipe1.nom",
    "rencontres.idEngagementEquipe2.id",
    "rencontres.idEngagementEquipe2.nom",
    "classements.id",
    "classements.idEngagement.id",
    "classements.idEngagement.nom",
    "classements.matchJoues",
    "classements.points",
    "classements.position",
    "classements.gagnes",
    "classements.perdus",
    "classements.paniersMarques",
    "classements.paniersEncaisses",
  ].forEach((field) => pouleQuery.append("fields[]", field));
  pouleQuery.set("deep[rencontres][_limit]", "1000");
  pouleQuery.set("deep[rencontres][_sort][]", "date_rencontre");

  const pouleJson = await ffbbApiGet(
    `/items/ffbbserver_poules/${encodeURIComponent(engagement.idPoule.id)}?${pouleQuery.toString()}`,
    token
  );
  const poule = pouleJson?.data || {};
  const rawMatches = (Array.isArray(poule.rencontres) ? poule.rencontres : []) as ApiRencontre[];
  const classements = (Array.isArray(poule.classements) ? poule.classements : []) as ApiClassement[];

  const team = requestedTeam.trim() || engagement.nom || "Équipe FFBB";
  const ownId = String(engagement.id);

  const ownMatches = rawMatches.filter((match) =>
    String(match.idEngagementEquipe1?.id || "") === ownId ||
    String(match.idEngagementEquipe2?.id || "") === ownId
  );

  const matches: Game[] = ownMatches.map((match) => {
    const home = String(match.idEngagementEquipe1?.id || "") === ownId;
    const homeName = String(match.nomEquipe1 || match.idEngagementEquipe1?.nom || "");
    const awayName = String(match.nomEquipe2 || match.idEngagementEquipe2?.nom || "");
    const a = apiNumber(match.resultatEquipe1);
    const b = apiNumber(match.resultatEquipe2);
    const played = Boolean(match.joue) && a !== null && b !== null;

    return {
      sourceKey: String(match.numero || match.id),
      round: match.numeroJournee ? `J${match.numeroJournee}` : "",
      date: apiDate(match.date_rencontre),
      time: apiTime(match.date_rencontre),
      homeAway: home ? "home" : "away",
      homeTeam: homeName,
      awayTeam: awayName,
      opponent: home ? awayName : homeName,
      ourScore: played ? (home ? a : b) : null,
      opponentScore: played ? (home ? b : a) : null,
    };
  });

  const ownStanding =
    classements.find((row) => String(row.idEngagement?.id || "") === ownId) ||
    classements.find((row) => teamNameMatches(String(row.idEngagement?.nom || ""), norm(team))) ||
    null;

  const playedMatches = matches.filter((m) => m.ourScore !== null && m.opponentScore !== null);
  const calculatedPointsFor = playedMatches.reduce((sum, m) => sum + (m.ourScore || 0), 0);
  const calculatedPointsAgainst = playedMatches.reduce((sum, m) => sum + (m.opponentScore || 0), 0);

  const played = apiNumber(ownStanding?.matchJoues) ?? playedMatches.length;
  const wins = apiNumber(ownStanding?.gagnes) ??
    playedMatches.filter((m) => m.ourScore! > m.opponentScore!).length;
  const losses = apiNumber(ownStanding?.perdus) ??
    playedMatches.filter((m) => m.ourScore! < m.opponentScore!).length;
  const ranking = apiNumber(ownStanding?.position);

  const teamStats: TeamStats = {
    played,
    wins,
    losses,
    pointsFor: apiNumber(ownStanding?.paniersMarques) ?? (playedMatches.length === played ? calculatedPointsFor : null),
    pointsAgainst: apiNumber(ownStanding?.paniersEncaisses) ?? (playedMatches.length === played ? calculatedPointsAgainst : null),
  };

  return {
    mode: "team",
    team,
    competition: String(engagement.idCompetition?.nom || "Compétition FFBB"),
    pool: String(poule.nom || engagement.idPoule.nom || ""),
    phase: parsedUrl.searchParams.get("phase") || "",
    sourceUrl,
    matches,
    seasonLabel: competitionSeason(matches),
    classementText: "",
    ranking,
    standings: ownStanding ? {
      rank: ranking,
      played,
      wins,
      losses,
      pointsFor: teamStats.pointsFor,
      pointsAgainst: teamStats.pointsAgainst,
    } : null,
    teamStats,
    datasText: "",
    updatedAt: new Date().toISOString(),
    transport: "api",
  };
}

