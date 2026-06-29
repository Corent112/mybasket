type Exercise = {
  id: string;
  kind: "exercise";
  title: string;
  theme: string;
  type: string;
  categorie: string;
  niveau: string;
  description: string;
  consignes: string;
  materiel: string;
  duree: number;
  tags: string[];
  createdAt: string;
  popularity: number;
};

type System = {
  id: string;
  kind: "system";
  title: string;
  attaqueDefense: string;
  famille: string;
  tempsFort: string;
  type: string;
  categorie: string;
  niveau: string;
  description: string;
  principes: string;
  tags: string[];
  createdAt: string;
  popularity: number;
};

const EXO_KEY = "mybasket_exercises_v1";
const SYS_KEY = "mybasket_systems_v1";

const isBrowser = () => typeof window !== "undefined";

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const MOCK_EXERCISES: Exercise[] = [
  {
    id: "ex-1",
    kind: "exercise",
    title: "Montée de balle 3 lignes",
    theme: "Passes",
    type: "Collectif",
    categorie: "U15",
    niveau: "Intermédiaire",
    description: "Travail de la montée de balle rapide sur 3 couloirs.",
    consignes: "Garder les couloirs ; passes tendues ; finition main forte.",
    materiel: "1 ballon, 3 plots",
    duree: 15,
    tags: ["transition", "contre-attaque"],
    createdAt: "2026-05-20T09:30:00Z",
    popularity: 12,
  },
  {
    id: "ex-2",
    kind: "exercise",
    title: "Shooting catch & shoot",
    theme: "Tirs",
    type: "Individuel",
    categorie: "U18",
    niveau: "Intermédiaire",
    description: "Tirs après passe et déplacement.",
    consignes: "Pieds parallèles, équilibre, suivi du poignet.",
    materiel: "Ballons, passeur",
    duree: 10,
    tags: ["tir", "rythme"],
    createdAt: "2026-05-25T18:45:00Z",
    popularity: 20,
  },
];

const MOCK_SYSTEMS: System[] = [
  {
    id: "sy-1",
    kind: "system",
    title: "Horns Flare",
    attaqueDefense: "Attaque",
    famille: "Stagger",
    tempsFort: "Pick top",
    type: "Demi-terrain",
    categorie: "Senior",
    niveau: "Confirmé",
    description: "Système Horns avec écran flare.",
    principes: "Spacing, lecture du défenseur, timing du flare.",
    tags: ["horns", "flare", "shoot"],
    createdAt: "2026-05-27T14:05:00Z",
    popularity: 18,
  },
  {
    id: "sy-2",
    kind: "system",
    title: "Spain Pick & Roll",
    attaqueDefense: "Attaque",
    famille: "Spain PnR",
    tempsFort: "Pick top",
    type: "Pick & Roll",
    categorie: "Pro",
    niveau: "Expert",
    description: "Pick and Roll avec back-screen.",
    principes: "Timing du back-screen, lecture du gros.",
    tags: ["spain", "pnr"],
    createdAt: "2026-05-22T16:10:00Z",
    popularity: 25,
  },
];

export function loadExercises(): Exercise[] {
  if (!isBrowser()) return MOCK_EXERCISES;

  const raw = localStorage.getItem(EXO_KEY);

  if (!raw) {
    localStorage.setItem(EXO_KEY, JSON.stringify(MOCK_EXERCISES));
    return MOCK_EXERCISES;
  }

  try {
    return JSON.parse(raw) as Exercise[];
  } catch {
    return MOCK_EXERCISES;
  }
}

export function saveExercises(list: Exercise[]) {
  if (!isBrowser()) return;
  localStorage.setItem(EXO_KEY, JSON.stringify(list));
}

export function addExercise(
  data: Omit<Exercise, "id" | "kind" | "createdAt" | "popularity" | "consignes" | "materiel" | "duree"> &
    Partial<Pick<Exercise, "consignes" | "materiel" | "duree">>
): Exercise[] {
  const item: Exercise = {
    ...data,
    id: uid("ex"),
    kind: "exercise",
    consignes: data.consignes ?? "",
    materiel: data.materiel ?? "",
    duree: data.duree ?? 0,
    createdAt: new Date().toISOString(),
    popularity: 0,
  };

  const next = [item, ...loadExercises()];
  saveExercises(next);
  return next;
}

export function loadSystems(): System[] {
  if (!isBrowser()) return MOCK_SYSTEMS;

  const raw = localStorage.getItem(SYS_KEY);

  if (!raw) {
    localStorage.setItem(SYS_KEY, JSON.stringify(MOCK_SYSTEMS));
    return MOCK_SYSTEMS;
  }

  try {
    return JSON.parse(raw) as System[];
  } catch {
    return MOCK_SYSTEMS;
  }
}

export function saveSystems(list: System[]) {
  if (!isBrowser()) return;
  localStorage.setItem(SYS_KEY, JSON.stringify(list));
}

export function addSystem(
  data: Omit<System, "id" | "kind" | "createdAt" | "popularity">
): System[] {
  const item: System = {
    ...data,
    id: uid("sy"),
    kind: "system",
    createdAt: new Date().toISOString(),
    popularity: 0,
  };

  const next = [item, ...loadSystems()];
  saveSystems(next);
  return next;
}

export function resetLibrary() {
  if (!isBrowser()) return;

  localStorage.setItem(EXO_KEY, JSON.stringify(MOCK_EXERCISES));
  localStorage.setItem(SYS_KEY, JSON.stringify(MOCK_SYSTEMS));
}