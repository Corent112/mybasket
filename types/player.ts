// types/player.ts
// Modèle de données de la fiche joueur MyBasket.
// Reprend exactement les champs visibles sur la maquette (fiche "comme la photo").
// Version liée : conserve le modèle complet + ajoute les ids Supabase nécessaires
// pour relier équipes/joueurs aux stats live, aux présences management et aux fiches.

export const POSTES = [
  "Meneur",
  "Arrière",
  "Ailier",
  "Ailier-fort",
  "Pivot",
] as const;
export type Poste = (typeof POSTES)[number];

export const MAINS = ["Droite", "Gauche", "Ambidextre"] as const;
export type Main = (typeof MAINS)[number];

export const STATUTS = ["Disponible", "Blessé", "Absent", "Suspendu"] as const;
export type Statut = (typeof STATUTS)[number];

/** Évaluation coach affichée dans le radar de compétences (note /10). */
export interface RadarCompetences {
  tir: number;
  dribble: number;
  passe: number;
  lectureJeu: number;
  defense: number;
  rebond: number;
  mental: number;
  athletisme: number;
}

/** Moyennes statistiques de la saison. */
export interface StatsMoyennes {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number; // pertes de balle
  pctTir: number; // %
  pct3pts: number; // %
  pctLf: number; // % lancers francs
}

/** Un point de la courbe d'évolution (un match). */
export interface PointEvolution {
  label: string; // "M1", "M2", ...
  points: number;
  rebonds: number;
  passes: number;
}

/** Temps de jeu sur la saison. */
export interface TempsDeJeu {
  tempsMoyenMatchMin: number; // minutes par match
  tempsTotalLabel: string; // ex "14h 15 min"
  matchsJoues: number;
  matchsManques: number;
}

/** Une ligne de suivi physique (test athlétique). */
export interface TestPhysique {
  id: string;
  label: string; // "Sprint 20m"
  resultat: string; // "3.05 s"
  evolution: string; // "-0.12 s" (signé)
  positif: boolean; // true => flèche verte vers le bas/haut "bonne" tendance
}

/** Un feedback daté du coach. */
export interface FeedbackCoach {
  id: string;
  date: string; // ISO "2026-05-28"
  texte: string;
  coach: string; // "Coach Thomas"
}

/** Une vidéo associée au joueur. */
export interface VideoJoueur {
  id: string;
  titre: string;
  date: string; // ISO
  duree: string; // "4:32"
  thumb?: string | null; // data URL ou URL
}

/** Rangs dans l'équipe (comparaison). */
export interface ComparaisonEquipe {
  pointsRang: number;
  passesRang: number;
  presencesRang: number;
  noteCoachRang: number;
  tempsJeuRang: number;
  effectif: number; // ex 15
}

export interface Player {
  id: string;
  /** Id réel Supabase du joueur, utilisé par match_player_stats.player_id. */
  supabasePlayerId?: string | null;

  // --- Identité ---
  firstName: string;
  lastName: string;
  num: number | null;
  photo?: string | null; // data URL
  club: string; // "PARIS BASKETBALL"
  clubLogo?: string | null;
  categorie: string; // "U15 (France)"
  postePrincipal: Poste;
  posteSecondaire: Poste | "";

  // --- Physique ---
  taille: string; // "1m82"
  poids: string; // "72 kg"
  age: number | null;
  dob: string; // "20/04/2010"
  mainDominante: Main;

  // --- Carrière / contrat ---
  statut: Statut;
  potentiel: number; // étoiles sur 5 (pas par 0.5), ex 3.5
  ancienneteLabel: string; // "3 ans"
  contratJusquau: string; // "30/06/2027"

  // --- Indicateurs ---
  presencePct: number; // 95
  ponctualitePct: number; // 92

  // --- Évaluation & stats ---
  radar: RadarCompetences;
  stats: StatsMoyennes;
  evolution: PointEvolution[];
  tempsDeJeu: TempsDeJeu;
  testsPhysiques: TestPhysique[];
  feedbacks: FeedbackCoach[];
  videos: VideoJoueur[];
  comparaison: ComparaisonEquipe;

  // --- Divers ---
  notes?: string;

  // --- Administratif optionnel utilisé par PlayerForm ---
  licenceNumber?: string;
  tuteur1Phone?: string;
  tuteur1Email?: string;
  tuteur2Phone?: string;
  tuteur2Email?: string;
}

/** Un membre du staff (entraîneur, assistant, kiné…). */
export interface StaffMember {
  id: string;
  prenom: string;
  nom: string;
  role: string; // "Entraîneur", "Assistant"…
  photo?: string | null;
}

export const EVENT_TYPES = [
  "Entraînement",
  "Championnat",
  "Réunion",
  "Tournoi",
  "Match amical",
  "Autre",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Un événement à venir de l'équipe. */
export interface TeamEvent {
  id: string;
  type: EventType;
  titre: string; // "Championnat - vs Tours Basket"
  date: string; // "14/05/2026" ou plage "Du 21/05 au 24/05"
  heure?: string; // "15h00"
  lieu?: string; // "Salle Coubertin"
}

/** Indicateurs de la saison affichés en haut de la fiche équipe. */
export interface TeamKpis {
  presenceMoyennePct: number; // 84
  matchsJoues: number; // 2
  victoires: number; // 1
  defaites: number; // 1
  pointsMoyenne: number; // points marqués par match en moyenne
  progressionPct: number; // 12 (+12 %)
}

/** Un match ou entraînement programmé (s'ajoute au calendrier). */
export interface TeamMatch {
  id: string;
  kind: "Match" | "Entraînement";
  date: string; // "30/05/2026"
  heure?: string; // "15:30"
  adversaire?: string; // "Massy" (pour un match)
  domicile?: boolean;
  lieu?: string;
}

/** Une ligne de stats joueur dans un match enregistré (format "live" unifié). */
export interface MatchPlayerLine {
  playerId: string | number;
  /** Id réel Supabase si disponible. */
  supabasePlayerId?: string | null;
  played: boolean;
  minutes?: number;
  pts?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  to?: number;
  pf?: number;
  rebOff?: number;
  rebDef?: number;
  ftMade?: number;
  ftMiss?: number;
  pts2made?: number;
  pts2miss?: number;
  pts3made?: number;
  pts3miss?: number;

  // compat ancien format manuel
  min?: number;
  reb?: number;
  ftm?: number;
  fta?: number;
  fg2m?: number;
  fg2a?: number;
  fg3m?: number;
  fg3a?: number;
}

/** Un match enregistré (historique de stats). */
export interface MatchRecord {
  id?: string;
  /** Id réel Supabase du match si disponible. */
  supabaseMatchId?: string | null;
  date: string; // ISO "2026-05-30"
  opponent: string;
  scoreUs: number;
  scoreThem: number;
  source?: "manuel" | "live" | "csv" | "supabase";
  players: MatchPlayerLine[];
}

/** Bilan victoires / défaites de l'équipe. */
export interface TeamStats {
  wins: number;
  losses: number;
  draws: number;
  ptsFor: number;
  ptsAgainst: number;
}

/** Moyennes agrégées d'un joueur (calculées depuis statsHistory). */
export interface PlayerAggStats {
  gamesPlayed: number;
  totalMinutes: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  ftMade: number;
  ftAtt: number;
  fg2Made: number;
  fg2Att: number;
  fg3Made: number;
  fg3Att: number;
}

export interface Team {
  id: string;
  /** Id réel Supabase de l'équipe, utilisé par match_stats.team_id. */
  supabaseTeamId?: string | null;
  /** Id club Supabase si l'équipe appartient à l'espace club. */
  clubId?: string | null;
  /** Saison sportive active. */
  season?: string | null;

  name: string; // "PARIS BASKETBALL"
  cat: string; // "U15"
  coach?: string;
  logo?: string | null;

  // --- Identité étendue ---
  categorieLabel: string; // "U15 France - Masculins"
  niveau: string; // "Départemental"
  genre: string; // "Masculins"
  tags: string[]; // ["DÉPARTEMENTAL","U15","MASCULINS"]
  banniere?: string | null; // photo d'équipe (data URL)

  // --- Encadrement & infos ---
  entraineurPrincipal: string; // "Lucas Martin"
  assistant: string; // "Noah Bernard"
  sallePrincipale: string; // "Gymnase Carpentier"
  dateCreation: string; // "01/07/2025"
  couleurs: string[]; // ["#7a1228","#e0a82e"]

  // --- Effectif & encadrement ---
  staff: StaffMember[];
  evenements: TeamEvent[];
  matchs: TeamMatch[];
  statsHistory: MatchRecord[];
  teamStats: TeamStats;
  kpi: TeamKpis;
  players: Player[];
}

/** Équipe vierge pré-remplie pour le formulaire "Modifier l'équipe". */
export function emptyTeam(): Team {
  return {
    id: "",
    supabaseTeamId: null,
    clubId: null,
    season: "2025-2026",
    name: "",
    cat: "U15",
    coach: "",
    logo: null,
    categorieLabel: "",
    niveau: "Départemental",
    genre: "Masculins",
    tags: [],
    banniere: null,
    entraineurPrincipal: "",
    assistant: "",
    sallePrincipale: "",
    dateCreation: "",
    couleurs: ["#7a1228", "#e0a82e"],
    staff: [],
    evenements: [],
    matchs: [],
    statsHistory: [],
    teamStats: { wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 },
    kpi: {
      presenceMoyennePct: 0,
      matchsJoues: 0,
      victoires: 0,
      defaites: 0,
      pointsMoyenne: 0,
      progressionPct: 0,
    },
    players: [],
  };
}

/** Joueur vierge pré-rempli pour le formulaire "Ajouter un joueur". */
export function emptyPlayer(): Player {
  return {
    id: "",
    supabasePlayerId: null,
    firstName: "",
    lastName: "",
    num: null,
    photo: null,
    club: "",
    clubLogo: null,
    categorie: "U15 (France)",
    postePrincipal: "Meneur",
    posteSecondaire: "",
    taille: "",
    poids: "",
    age: null,
    dob: "",
    mainDominante: "Droite",
    statut: "Disponible",
    potentiel: 3,
    ancienneteLabel: "",
    contratJusquau: "",
    presencePct: 0,
    ponctualitePct: 0,
    radar: {
      tir: 5,
      dribble: 5,
      passe: 5,
      lectureJeu: 5,
      defense: 5,
      rebond: 5,
      mental: 5,
      athletisme: 5,
    },
    stats: {
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      to: 0,
      pctTir: 0,
      pct3pts: 0,
      pctLf: 0,
    },
    evolution: [],
    tempsDeJeu: {
      tempsMoyenMatchMin: 0,
      tempsTotalLabel: "",
      matchsJoues: 0,
      matchsManques: 0,
    },
    testsPhysiques: [],
    feedbacks: [],
    videos: [],
    comparaison: {
      pointsRang: 0,
      passesRang: 0,
      presencesRang: 0,
      noteCoachRang: 0,
      tempsJeuRang: 0,
      effectif: 0,
    },
    notes: "",
    licenceNumber: "",
    tuteur1Phone: "",
    tuteur1Email: "",
    tuteur2Phone: "",
    tuteur2Email: "",
  };
}

/** Profil de l'utilisateur connecté (en-tête « Mon compte »). */
export interface UserProfile {
  prenom: string;
  nom: string;
  club: string;
  clubLogo?: string | null;
  photo?: string | null;
  dob: string;
  email: string;
  telephone: string;
}

export function emptyProfile(): UserProfile {
  return {
    prenom: "",
    nom: "",
    club: "",
    clubLogo: null,
    photo: null,
    dob: "",
    email: "",
    telephone: "",
  };
}
