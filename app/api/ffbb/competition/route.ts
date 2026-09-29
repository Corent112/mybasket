import { NextRequest, NextResponse } from "next/server";

type TeamChoice = { name: string; url: string };
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
  pointsFor: number;
  pointsAgainst: number;
};

type Standing = {
  rank: number | null;
  played: number | null;
  wins: number | null;
  losses: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
};

const MONTHS: Record<string, string> = {
  janv: "01", févr: "02", mars: "03", avr: "04", mai: "05", juin: "06",
  juil: "07", août: "08", sept: "09", oct: "10", nov: "11", déc: "12",
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

function abs(href: string) {
  return new URL(href, "https://competitions.ffbb.com").toString();
}

function teamChoices(html: string): TeamChoice[] {
  const out = new Map<string, TeamChoice>();
  const re = /<a[^>]+href=["']([^"']*\/equipes\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const name = text(m[2]);
    if (name && name.length < 120) out.set(abs(m[1]), { name, url: abs(m[1]) });
  }
  return [...out.values()];
}

function isoDate(raw: string) {
  const m = raw.toLowerCase().match(/(\d{1,2})\s+([a-zéû\.]+)(?:\s+(\d{4}))?/i);
  if (!m) return raw;
  const key = Object.keys(MONTHS).find((k) => m[2].startsWith(k));
  if (!key) return raw;
  const y = m[3] || String(new Date().getFullYear());
  return `${y}-${MONTHS[key]}-${m[1].padStart(2, "0")}`;
}

function parseScoreTail(raw: string) {
  const cleaned = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  const separated = cleaned.match(/^(.*?)\s*(\d{1,3})\s*[-–—:]\s*(\d{1,3})\s*$/);
  if (separated) {
    const a = Number(separated[2]), b = Number(separated[3]);
    if ((a === 0 && b === 0) || !Number.isFinite(a) || !Number.isFinite(b)) {
      return { opponent: separated[1].trim(), a: null as number | null, b: null as number | null };
    }
    return { opponent: separated[1].trim(), a, b };
  }

  const compactPatterns = [
    /^(.*\D)(\d{3})(\d{3})$/,
    /^(.*\D)(\d{3})(\d{2})$/,
    /^(.*\D)(\d{2})(\d{3})$/,
    /^(.*\D)(\d{2})(\d{2})$/,
  ];
  for (const pattern of compactPatterns) {
    const m = cleaned.match(pattern);
    if (!m) continue;
    const a = Number(m[2]), b = Number(m[3]);
    if (a > 200 || b > 200) continue;
    if (a === 0 && b === 0) return { opponent: m[1].trim(), a: null, b: null };
    return { opponent: m[1].trim(), a, b };
  }

  const spaced = cleaned.match(/^(.*?)\s+(\d{1,3})\s+(\d{1,3})\s*$/);
  if (spaced) {
    const a = Number(spaced[2]), b = Number(spaced[3]);
    if ((a === 0 && b === 0) || !Number.isFinite(a) || !Number.isFinite(b)) {
      return { opponent: spaced[1].trim(), a: null, b: null };
    }
    return { opponent: spaced[1].trim(), a, b };
  }

  return {
    opponent: cleaned.replace(/\s+(?:0\s*[-–—:]?\s*0|00)\s*$/, "").trim(),
    a: null as number | null,
    b: null as number | null,
  };
}

function inferTeamName(raw: string, override: string) {
  if (override.trim()) return override.trim();

  const htmlH1 = raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (htmlH1) {
    const value = text(htmlH1);
    if (value) return value;
  }

  // Jina Reader renvoie la page FFBB en Markdown. Le H1 de l'équipe est alors
  // une ligne "# NOM EQUIPE". On ignore les titres génériques éventuels.
  const markdownHeadings = [...raw.matchAll(/^#\s+(.+?)\s*$/gm)]
    .map((m) => text(m[1]))
    .filter(Boolean);
  const ignored = ["accueil", "calendrier", "classement", "ffbb"];
  const heading = markdownHeadings.find((value) => {
    const n = norm(value);
    return !ignored.some((x) => n === x || n.startsWith(`${x} `));
  });
  if (heading) return heading;

  const flat = text(raw);
  const fromTitle = flat.match(/équipe\s+(.+?)\s+engagée\s+dans\s+la\s+compétition/i)?.[1];
  if (fromTitle) return fromTitle.trim();

  return "Équipe FFBB";
}

function teamNameMatches(cell: string, wanted: string) {
  const n = norm(cell);
  return n === wanted || (wanted.length > 5 && n.includes(wanted)) || (n.length > 5 && wanted.includes(n));
}

function parseStandingsFromHtml(html: string, teamName: string): Standing | null {
  const wanted = norm(teamName);
  if (!wanted) return null;

  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const headerRow = rows.find((row) => /<th\b/i.test(row));
    const headers = headerRow
      ? Array.from(headerRow.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) => norm(text(m[1])))
      : [];

    for (const row of rows) {
      const cells = Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) => text(m[1]));
      if (!cells.some((c) => teamNameMatches(c, wanted))) continue;

      const numeric = (value: string) => {
        const m = value.replace(/\s/g, "").match(/^-?\d+$/);
        return m ? Number(m[0]) : null;
      };
      const byHeader = (aliases: string[]) => {
        const idx = headers.findIndex((h) => aliases.includes(h));
        return idx >= 0 && idx < cells.length ? numeric(cells[idx]) : null;
      };

      let rank = byHeader(["cl", "class", "classement", "rang", "position"]);
      if (rank === null) {
        for (const c of cells) {
          const m = c.match(/^\s*(\d{1,2})\s*(?:er|e|eme|ème)?\s*$/i);
          if (m) { rank = Number(m[1]); break; }
        }
      }

      return {
        rank: rank !== null && rank >= 1 && rank <= 30 ? rank : null,
        played: byHeader(["j", "mj", "joue", "joues", "matchs", "matchs joues"]),
        wins: byHeader(["g", "v", "victoire", "victoires", "gagnes"]),
        losses: byHeader(["p", "d", "defaite", "defaites", "perdus"]),
        pointsFor: byHeader(["pm", "pf", "points marques", "pts marques"]),
        pointsAgainst: byHeader(["pe", "pa", "points encaisses", "pts encaisses"]),
      };
    }
  }
  return null;
}

function parseStandingsFromMarkdown(raw: string, teamName: string): Standing | null {
  const wanted = norm(teamName);
  if (!wanted) return null;

  // Format Reader actuel :
  // 3 | PARIS BASKETBALL | 4 | 2 2 0 0 | ... | 162 132 30
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.includes("|") || !norm(line).includes(wanted)) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
    if (cells.length < 3) continue;

    const teamIndex = cells.findIndex((cell) => teamNameMatches(cell, wanted));
    if (teamIndex < 0) continue;

    const rankMatch = (cells[teamIndex - 1] || "").match(/^(\d{1,2})$/);
    const rank = rankMatch ? Number(rankMatch[1]) : null;

    // Colonne RENCONTRES = "J G P N".
    let played: number | null = null;
    let wins: number | null = null;
    let losses: number | null = null;
    for (let i = teamIndex + 1; i < cells.length; i++) {
      const record = cells[i].match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
      if (record) {
        played = Number(record[1]);
        wins = Number(record[2]);
        losses = Number(record[3]);
        break;
      }
    }

    // Dernière colonne POINTS = "M E D" (marqués, encaissés, différence).
    let pointsFor: number | null = null;
    let pointsAgainst: number | null = null;
    for (let i = cells.length - 1; i > teamIndex; i--) {
      const pts = cells[i].match(/^(\d+)\s+(\d+)\s*(-?\d+)$/);
      if (pts) {
        pointsFor = Number(pts[1]);
        pointsAgainst = Number(pts[2]);
        break;
      }
    }

    return {
      rank: rank !== null && rank >= 1 && rank <= 30 ? rank : null,
      played, wins, losses, pointsFor, pointsAgainst,
    };
  }

  return null;
}

function parseRankingFromFlat(raw: string, teamName: string) {
  const wanted = norm(teamName);
  const all = norm(text(raw));
  if (!wanted) return null;
  const idx = all.indexOf(wanted);
  if (idx < 0) return null;
  const before = all.slice(Math.max(0, idx - 40), idx);
  const nums = before.match(/\b(\d{1,2})\b/g);
  if (!nums?.length) return null;
  const rank = Number(nums[nums.length - 1]);
  return rank >= 1 && rank <= 30 ? rank : null;
}

function parseTeamPage(raw: string, url: string, standingsRaw: string = raw, teamNameOverride: string = "") {
  const t = text(raw);
  const team = inferTeamName(raw, teamNameOverride);
  const competition = (
    t.match(/((?:NATIONALE|REGIONALE|RÉGIONALE|DEPARTEMENTALE|DÉPARTEMENTALE|PRÉ|PRE)[^|]{2,100})\s+FEDE/i)?.[1] ||
    t.match(/\|\s*([A-Z0-9 -]{2,35})\s*\|\s*Poule/i)?.[1] ||
    "Compétition FFBB"
  ).trim();
  const pool =
    t.match(/Poule\s+([A-Z0-9-]+)/i)?.[1] ||
    text(standingsRaw).match(/Poule\s+([A-Z0-9-]+)/i)?.[1] ||
    "";
  const phase = new URL(url).searchParams.get("phase") || "";
  const matches: Game[] = [];

  const re = /#(\d+)\s+(J\d+)?\s*(\d{1,2}\s+(?:janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?)(?:\s+\d{4})?)\s+(\d{1,2}h\d{2})\s+(Domicile|Extérieur)\s+([^#]{2,180}?)(?=#\d+|Datas de l'équipe|Classement officiel|$)/gi;
  let m;
  while ((m = re.exec(t))) {
    const score = parseScoreTail(m[6]);
    let ourScore: number | null = null;
    let opponentScore: number | null = null;
    const homeAway = m[5].toLowerCase().startsWith("dom") ? "home" : "away";

    if (score.a !== null && score.b !== null) {
      if (homeAway === "home") { ourScore = score.a; opponentScore = score.b; }
      else { ourScore = score.b; opponentScore = score.a; }
    }

    const opponent = score.opponent.replace(/\s+(?:0\s*[-–—:]?\s*0|00)\s*$/, "").trim();
    matches.push({
      sourceKey: m[1],
      round: m[2] || "",
      date: isoDate(m[3]),
      time: m[4].replace("h", ":"),
      homeAway,
      homeTeam: homeAway === "home" ? team : opponent,
      awayTeam: homeAway === "away" ? team : opponent,
      opponent,
      ourScore,
      opponentScore,
    });
  }

  const dataStart = t.indexOf("Datas de l'équipe");
  const classStart = t.indexOf("Classement officiel");
  const datas = dataStart >= 0
    ? t.slice(dataStart, classStart > dataStart ? classStart : dataStart + 3000)
    : "";

  let teamStats: TeamStats | null = null;

  // Le bloc "Datas de l'équipe" est la source la plus stable pour les totaux.
  if (datas) {
    const record = datas.match(/\(?\s*(\d+)\s*V\s*(\d+)\s*D\s*\)?/i);
    const pf = datas.match(/(\d+)\s+points?\s+marqu/i);
    const pa = datas.match(/(\d+)\s+points?\s+encaiss/i);
    if (record) {
      const wins = Number(record[1]);
      const losses = Number(record[2]);
      teamStats = {
        played: wins + losses,
        wins,
        losses,
        pointsFor: pf ? Number(pf[1]) : 0,
        pointsAgainst: pa ? Number(pa[1]) : 0,
      };
    }
  }

  // Si besoin, les scores du calendrier complètent les statistiques.
  const playedMatches = matches.filter((x) => x.ourScore !== null && x.opponentScore !== null);
  if (!teamStats && playedMatches.length) {
    teamStats = {
      played: playedMatches.length,
      wins: playedMatches.filter((x) => x.ourScore! > x.opponentScore!).length,
      losses: playedMatches.filter((x) => x.ourScore! < x.opponentScore!).length,
      pointsFor: playedMatches.reduce((s, x) => s + (x.ourScore || 0), 0),
      pointsAgainst: playedMatches.reduce((s, x) => s + (x.opponentScore || 0), 0),
    };
  }

  // Support des deux transports :
  // - HTML FFBB direct
  // - Markdown Jina Reader lorsque FFBB renvoie 403 depuis Vercel
  const standings =
    parseStandingsFromHtml(standingsRaw, team) ||
    parseStandingsFromMarkdown(standingsRaw, team);

  const ranking =
    standings?.rank ??
    parseRankingFromFlat(
      classStart >= 0 ? t.slice(classStart, classStart + 8000) : standingsRaw,
      team
    );

  if (
    standings &&
    standings.played !== null &&
    standings.wins !== null &&
    standings.losses !== null
  ) {
    teamStats = {
      played: standings.played,
      wins: standings.wins,
      losses: standings.losses,
      pointsFor: standings.pointsFor ?? teamStats?.pointsFor ?? 0,
      pointsAgainst: standings.pointsAgainst ?? teamStats?.pointsAgainst ?? 0,
    };
  }

  const classementText =
    classStart >= 0 ? t.slice(classStart, classStart + 8000) : text(standingsRaw).slice(0, 8000);

  return {
    mode: "team",
    team,
    competition,
    pool,
    phase,
    sourceUrl: url,
    matches,
    classementText,
    ranking,
    standings,
    teamStats,
    datasText: datas,
    updatedAt: new Date().toISOString(),
  };
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
const FFBB_TIMEOUT_MS = 8000;

async function ffbbFetch(input: string, init: RequestInit = {}) {
  const target = new URL(input, FFBB_API_ORIGIN);
  if (target.origin !== FFBB_API_ORIGIN) throw new Error("Destination FFBB API interdite");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FFBB_TIMEOUT_MS);
  try {
    return await fetch(target, {
      ...init,
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
  const response = await ffbbFetch(path, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
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

async function fetchTeamFromFfbbApi(sourceUrl: string, requestedTeam: string) {
  const parsedUrl = new URL(sourceUrl);
  const engagementId = parsedUrl.pathname.match(/\/equipes\/([^/?#]+)/i)?.[1] || "";
  if (!engagementId) throw new Error("Identifiant équipe FFBB introuvable");

  const token = await ffbbApiToken();

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
    pointsFor: calculatedPointsFor,
    pointsAgainst: calculatedPointsAgainst,
  };

  return {
    mode: "team",
    team,
    competition: String(engagement.idCompetition?.nom || "Compétition FFBB"),
    pool: String(poule.nom || engagement.idPoule.nom || ""),
    phase: parsedUrl.searchParams.get("phase") || "",
    sourceUrl,
    matches,
    classementText: "",
    ranking,
    standings: ownStanding ? {
      rank: ranking,
      played,
      wins,
      losses,
      pointsFor: calculatedPointsFor,
      pointsAgainst: calculatedPointsAgainst,
    } : null,
    teamStats,
    datasText: "",
    updatedAt: new Date().toISOString(),
    transport: "api",
  };
}

type FetchedPage = { body: string; via: "ffbb" | "reader"; status: number };

async function fetchFfbbPage(target: string, headers: Record<string, string>): Promise<FetchedPage> {
  const direct = await fetch(target, { headers, cache: "no-store", redirect: "follow" });
  if (direct.ok) return { body: await direct.text(), via: "ffbb", status: direct.status };

  if (direct.status !== 401 && direct.status !== 403 && direct.status !== 429) {
    throw new Error(`FFBB ${direct.status}`);
  }

  const readerUrl = `https://r.jina.ai/${target}`;
  const reader = await fetch(readerUrl, {
    headers: {
      accept: "text/plain",
      "x-engine": "browser",
      "x-timeout": "15",
      "x-cache-tolerance": "60",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!reader.ok) throw new Error(`FFBB ${direct.status} / secours ${reader.status}`);
  const body = await reader.text();
  if (!body || body.length < 300) throw new Error(`FFBB ${direct.status} / secours vide`);

  return { body, via: "reader", status: direct.status };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  const requestedTeam = req.nextUrl.searchParams.get("team") || "";

  let validatedUrl: URL;
  try {
    validatedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Lien FFBB invalide" }, { status: 400 });
  }

  if (
    validatedUrl.protocol !== "https:" ||
    validatedUrl.hostname !== "competitions.ffbb.com" ||
    !/^\/ligues\/[a-z0-9-]+\/comites\/\d+\/clubs\/[a-z0-9-]+\/equipes\/\d+\/?$/i.test(validatedUrl.pathname)
  ) {
    return NextResponse.json({ error: "Lien FFBB invalide" }, { status: 400 });
  }

  try {
    const headers = {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/136 Safari/537.36",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      accept: "text/html,application/xhtml+xml",
    };

    if (/\/equipes\/\d+/i.test(new URL(url).pathname)) {
      // 1) On tente le site public FFBB.
      // 2) Si Cloudflare bloque Vercel (403/429), on utilise l'API FFBB Directus.
      // 3) Le reader historique reste seulement un dernier secours.
      try {
        const direct = await fetch(url, { headers, cache: "no-store", redirect: "follow" });
        if (direct.ok) {
          const html = await direct.text();
          const cleanUrl = url
            .replace(/[?#].*$/, "")
            .replace(/\/classement\/?$/i, "")
            .replace(/\/$/, "");
          let standingsHtml = html;
          for (const classementUrl of [`${cleanUrl}/classement`, `${cleanUrl}/classement/`]) {
            try {
              const response = await fetch(classementUrl, {
                headers,
                cache: "no-store",
                redirect: "follow",
              });
              if (response.ok) {
                const candidate = await response.text();
                if (candidate.length > 500) { standingsHtml = candidate; break; }
              }
            } catch {}
          }
          return NextResponse.json({
            ...parseTeamPage(html, url, standingsHtml, requestedTeam),
            transport: "ffbb",
          });
        }
      } catch {}

      try {
        const apiPayload = await fetchTeamFromFfbbApi(url, requestedTeam);
        return NextResponse.json(apiPayload, {
          headers: {
            "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        });
      } catch (apiError) {
        console.warn("FFBB API indisponible, dernier secours reader", apiError instanceof Error ? apiError.message : "erreur");
      }

      const mainPage = await fetchFfbbPage(url, headers);
      const html = mainPage.body;
      const cleanUrl = url
        .replace(/[?#].*$/, "")
        .replace(/\/classement\/?$/i, "")
        .replace(/\/$/, "");
      let standingsHtml = html;
      for (const classementUrl of [`${cleanUrl}/classement`, `${cleanUrl}/classement/`]) {
        try {
          const response = await fetchFfbbPage(classementUrl, headers);
          if (response.body && response.body.length > 500) {
            standingsHtml = response.body;
            break;
          }
        } catch {}
      }
      return NextResponse.json({
        ...parseTeamPage(html, url, standingsHtml, requestedTeam),
        transport: mainPage.via,
      });
    }

    const mainPage = await fetchFfbbPage(url, headers);
    return NextResponse.json({
      mode: "choose-team",
      sourceUrl: url,
      teams: teamChoices(mainPage.body),
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture FFBB impossible" },
      { status: 502 }
    );
  }
}
