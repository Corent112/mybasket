// types/player.ts
// Modèle de données de la fiche joueur MyBasket.
// Reprend exactement les champs visibles sur la maquette (fiche "comme la photo").

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
}

export interface Team {
  id: string;
  name: string; // "PARIS BASKETBALL"
  cat: string; // "U15"
  coach?: string;
  logo?: string | null;
  players: Player[];
}

/** Joueur vierge pré-rempli pour le formulaire "Ajouter un joueur". */
export function emptyPlayer(): Player {
  return {
    id: "",
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
  };
}
