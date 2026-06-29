/**
 * lib/annonces.ts
 * MyBasket — Marketplace annonces
 *
 * Catégories nettoyées :
 * - Club recherche joueur
 * - Club recherche staff
 * - Coach / staff recherche club
 * - Camp / Stage
 * - Autre
 *
 * localStorage :
 *  'mybasket_annonces' | 'mybasket_coaches' | 'mybasket_fav_ads' | 'mybasket_bookings'
 */

// ---------------------------------------------------------------------------
// Types d'annonces
// ---------------------------------------------------------------------------
export type AdTypeKey =
  | "club-recherche-joueur"
  | "club-recherche-staff"
  | "staff-recherche-club"
  | "camp-stage"
  | "autre";

export interface AdType {
  key: AdTypeKey;
  icon: string;
  title: string;
  desc: string;
}

export const AD_TYPES: AdType[] = [
  {
    key: "club-recherche-joueur",
    title: "Club recherche joueur",
    icon: "🛡️",
    desc: "Votre club recrute un ou plusieurs joueurs.",
  },
  {
    key: "club-recherche-staff",
    title: "Club recherche staff",
    icon: "📋",
    desc: "Coach, préparateur physique, analyste vidéo ou staff.",
  },
  {
    key: "staff-recherche-club",
    title: "Coach / staff recherche club",
    icon: "🎯",
    desc: "Vous cherchez un nouveau projet sportif.",
  },
  {
    key: "camp-stage",
    title: "Camp / Stage",
    icon: "🏕️",
    desc: "Organisez ou annoncez un camp, stage ou événement.",
  },
  {
    key: "autre",
    title: "Autre",
    icon: "✨",
    desc: "Une opportunité qui ne rentre dans aucune catégorie.",
  },
];

export const adTypeByKey = (k: string) => AD_TYPES.find((t) => t.key === k);

// ---------------------------------------------------------------------------
// Référentiels
// ---------------------------------------------------------------------------
export const LEVELS = [
  "Loisir",
  "Départemental",
  "Régional",
  "National 3",
  "National 2",
  "National 1",
  "NM3",
  "NM2",
  "NM1",
  "Pro B",
  "Pro A",
  "Espoirs",
  "Jeunes (U9-U20)",
  "Débutant",
  "Intermédiaire",
  "Confirmé",
  "Débutant à Avancé",
  "Intermédiaire à Avancé",
];

export const CONTRACTS = [
  "Bénévole",
  "Stage",
  "Indemnisé",
  "Semi-pro",
  "Professionnel",
  "Prestation",
  "Autre",
];

export const POSITIONS = ["Meneur", "Arrière", "Ailier", "Ailier fort", "Pivot"];

export const CATEGORIES = [
  "U9",
  "U11",
  "U13",
  "U15",
  "U17",
  "U18",
  "U20",
  "U21",
  "Seniors",
  "Vétérans",
];

export const GENRES = ["Garçons", "Filles", "Garçons & Filles"];

export const STAFF_ROLES = [
  "Entraîneur principal",
  "Assistant coach",
  "Préparateur physique",
  "Analyste vidéo",
  "Directeur technique",
  "Responsable école de basket",
  "Staff médical",
  "Autre",
];

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------
export interface Field {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "date"
    | "number"
    | "file"
    | "tel"
    | "email"
    | "list"
    | "images"
    | "includes"
    | "video";
  options?: string[];
  placeholder?: string;
  required?: boolean;
  full?: boolean;
  multiple?: boolean;
  group?: string;
}

const G = {
  pres: "Présentation",
  key: "Informations clés",
  content: "Contenu",
  org: "Organisateur",
  contact: "Contact",
};

const IMG = (label = "Photos (la 1ʳᵉ = visuel principal)"): Field => ({
  key: "images",
  label,
  type: "images",
  full: true,
  group: G.pres,
});

const INTRO: Field = {
  key: "intro",
  label: "Phrase d’accroche",
  type: "text",
  full: true,
  group: G.pres,
};

const LOC = (required = true): Field => ({
  key: "localisation",
  label: "Localisation",
  type: "text",
  placeholder: "Ville, département, pays",
  required,
  group: G.key,
});

const DEADLINE: Field = {
  key: "dateLimite",
  label: "Date limite",
  type: "date",
  group: G.key,
};

const DESC: Field = {
  key: "description",
  label: "Description détaillée",
  type: "textarea",
  full: true,
  required: true,
  group: G.content,
};

const BULLETS = (key: string, label: string): Field => ({
  key,
  label,
  type: "list",
  full: true,
  group: G.content,
});

const CONTACT: Field = {
  key: "coordonnees",
  label: "Coordonnées",
  type: "text",
  placeholder: "Email, téléphone ou lien de contact",
  required: true,
  full: true,
  group: G.contact,
};

const DOCS: Field = {
  key: "documents",
  label: "Documents joints",
  type: "file",
  multiple: true,
  full: true,
  group: G.contact,
};

// ---------------------------------------------------------------------------
// Schémas par type
// ---------------------------------------------------------------------------
export const FORM_SCHEMAS: Record<AdTypeKey, Field[]> = {
  "club-recherche-joueur": [
    {
      key: "clubName",
      label: "Nom du club",
      type: "text",
      required: true,
      group: G.pres,
    },
    INTRO,
    IMG(),
    {
      key: "niveau",
      label: "Niveau",
      type: "select",
      options: LEVELS,
      required: true,
      group: G.key,
    },
    {
      key: "categorie",
      label: "Catégorie",
      type: "select",
      options: CATEGORIES,
      group: G.key,
    },
    {
      key: "poste",
      label: "Poste recherché",
      type: "select",
      options: POSITIONS,
      group: G.key,
    },
    {
      key: "taille",
      label: "Taille souhaitée",
      type: "text",
      placeholder: "Ex : 185 cm minimum",
      group: G.key,
    },
    {
      key: "annee",
      label: "Année de naissance",
      type: "number",
      placeholder: "Ex : 2008",
      group: G.key,
    },
    {
      key: "genre",
      label: "Genre",
      type: "select",
      options: GENRES,
      group: G.key,
    },
    {
      key: "contrat",
      label: "Type de projet",
      type: "select",
      options: CONTRACTS,
      group: G.key,
    },
    LOC(true),
    DEADLINE,
    DESC,
    BULLETS("aboutBullets", "Profil recherché"),
    BULLETS("descBullets", "Ce que le club propose"),
    CONTACT,
    DOCS,
  ],

  "club-recherche-staff": [
    {
      key: "clubName",
      label: "Nom du club",
      type: "text",
      required: true,
      group: G.pres,
    },
    INTRO,
    IMG(),
    {
      key: "roleStaff",
      label: "Poste recherché",
      type: "select",
      options: STAFF_ROLES,
      required: true,
      group: G.key,
    },
    {
      key: "niveau",
      label: "Niveau",
      type: "select",
      options: LEVELS,
      required: true,
      group: G.key,
    },
    {
      key: "categorie",
      label: "Catégorie / équipe",
      type: "select",
      options: CATEGORIES,
      group: G.key,
    },
    {
      key: "contrat",
      label: "Type de contrat",
      type: "select",
      options: CONTRACTS,
      required: true,
      group: G.key,
    },
    {
      key: "remuneration",
      label: "Rémunération",
      type: "text",
      placeholder: "Ex : à négocier, indemnisé, prestation...",
      group: G.key,
    },
    LOC(true),
    DEADLINE,
    DESC,
    BULLETS("aboutBullets", "Missions principales"),
    BULLETS("descBullets", "Profil attendu"),
    CONTACT,
    DOCS,
  ],

  "staff-recherche-club": [
    {
      key: "nom",
      label: "Nom / prénom",
      type: "text",
      required: true,
      group: G.pres,
    },
    INTRO,
    IMG(),
    {
      key: "roleStaff",
      label: "Profil",
      type: "select",
      options: STAFF_ROLES,
      required: true,
      group: G.key,
    },
    {
      key: "diplome",
      label: "Diplôme principal",
      type: "text",
      placeholder: "Ex : DE, BPJEPS, DES, diplôme vidéo...",
      group: G.key,
    },
    {
      key: "experience",
      label: "Années d’expérience",
      type: "number",
      group: G.key,
    },
    {
      key: "niveauVise",
      label: "Niveau recherché",
      type: "select",
      options: LEVELS,
      group: G.key,
    },
    {
      key: "contrat",
      label: "Type de contrat souhaité",
      type: "select",
      options: CONTRACTS,
      group: G.key,
    },
    {
      key: "mobilite",
      label: "Mobilité",
      type: "select",
      options: ["Locale", "Régionale", "Nationale", "Internationale"],
      group: G.key,
    },
    LOC(true),
    DESC,
    BULLETS("aboutBullets", "Compétences / spécialités"),
    BULLETS("descBullets", "Ce que vous recherchez"),
    {
      key: "videoUrl",
      label: "Lien vidéo / présentation",
      type: "video",
      full: true,
      group: G.content,
    },
    CONTACT,
    DOCS,
  ],

  "camp-stage": [
    {
      key: "titre",
      label: "Nom du camp / stage",
      type: "text",
      required: true,
      full: true,
      group: G.pres,
    },
    {
      key: "titreAccent",
      label: "Sous-titre",
      type: "text",
      placeholder: "Ex : CAMP 2026",
      group: G.pres,
    },
    INTRO,
    IMG("Photos du camp / stage"),
    {
      key: "ageRange",
      label: "Âge",
      type: "text",
      placeholder: "Ex : 12 – 17 ans",
      group: G.key,
    },
    {
      key: "niveau",
      label: "Niveau",
      type: "select",
      options: LEVELS,
      group: G.key,
    },
    {
      key: "genre",
      label: "Genre",
      type: "select",
      options: GENRES,
      group: G.key,
    },
    {
      key: "places",
      label: "Nombre de places",
      type: "number",
      placeholder: "Ex : 40",
      group: G.key,
    },
    {
      key: "dates",
      label: "Dates",
      type: "text",
      placeholder: "Ex : Du 12 au 18 juillet 2026",
      group: G.key,
    },
    DEADLINE,
    {
      key: "prix",
      label: "Prix",
      type: "text",
      placeholder: "Ex : 650 €",
      group: G.key,
    },
    {
      key: "langue",
      label: "Langue",
      type: "text",
      placeholder: "Français / Anglais",
      group: G.key,
    },
    {
      key: "hebergement",
      label: "Hébergement",
      type: "text",
      placeholder: "Résidence sportive, sans hébergement...",
      group: G.key,
    },
    {
      key: "repas",
      label: "Repas",
      type: "text",
      placeholder: "Ex : 3 repas / jour inclus",
      group: G.key,
    },
    LOC(true),
    {
      key: "pillars",
      label: "Piliers du stage",
      type: "list",
      full: true,
      group: G.content,
    },
    {
      key: "about",
      label: "À propos du camp / stage",
      type: "textarea",
      full: true,
      group: G.content,
    },
    BULLETS("aboutBullets", "Points clés"),
    {
      key: "includes",
      label: "Ce qui est inclus",
      type: "includes",
      full: true,
      group: G.content,
    },
    {
      key: "program",
      label: "Programme type",
      type: "list",
      full: true,
      group: G.content,
    },
    {
      key: "quote",
      label: "Citation de motivation",
      type: "text",
      placeholder: "Progresse, dépasse-toi, deviens meilleur",
      full: true,
      group: G.content,
    },
    DESC,
    BULLETS("descBullets", "Description en points clés"),
    {
      key: "highlights",
      label: "Atouts",
      type: "list",
      full: true,
      group: G.content,
    },
    {
      key: "videoUrl",
      label: "Vidéo de présentation",
      type: "video",
      full: true,
      group: G.content,
    },
    {
      key: "orgName",
      label: "Nom de l’organisateur",
      type: "text",
      group: G.org,
    },
    {
      key: "orgLocation",
      label: "Localisation organisateur",
      type: "text",
      group: G.org,
    },
    CONTACT,
    DOCS,
  ],

  autre: [
    {
      key: "titre",
      label: "Titre de l’annonce",
      type: "text",
      required: true,
      full: true,
      group: G.pres,
    },
    INTRO,
    IMG(),
    {
      key: "categorie",
      label: "Catégorie",
      type: "text",
      placeholder: "Ex : événement, opportunité, service...",
      group: G.key,
    },
    LOC(false),
    DESC,
    BULLETS("aboutBullets", "Points clés"),
    CONTACT,
    DOCS,
  ],
};

export const keyInfoFields = (type: AdTypeKey) =>
  FORM_SCHEMAS[type].filter((f) => f.group === G.key);

// ---------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------
export interface IncludeItem {
  label: string;
  sub: string;
}

export interface Ad {
  id: string;
  type: AdTypeKey;
  title: string;
  titleAccent?: string;
  author: string;
  location: string;
  level: string;
  contract: string;
  description: string;
  images: string[];
  data: Record<string, any>;
  status?: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface SessionStep {
  id: string;
  title: string;
  desc: string;
}

export interface Offer {
  id: string;
  title: string;
  desc: string;
}

export interface Duration {
  id: string;
  label: string;
  price: string;
}

export interface Review {
  id: string;
  name: string;
  meta: string;
  stars: number;
  text: string;
}

export interface CoachProfile {
  id: string;
  photo?: string;
  cover?: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  available: boolean;
  location: string;
  mobilityNote: string;
  phone: string;
  email: string;
  bio: string;
  bioBullets: string[];
  pillars: string[];
  tags: string[];

  sessionType: string;
  audience: string;
  level: string;
  locationLabel: string;
  availability: string;
  travel: string;
  materialProvided: string;
  durations: Duration[];
  material: string[];
  sessionFlow: SessionStep[];
  offers: Offer[];

  sessionsCount: number;
  experienceYears: string;
  rating: number;
  reviewsCount: number;
  reviews: Review[];

  videoUrl?: string;
  photos: string[];
  createdAt: number;
}

export interface Booking {
  id: string;
  coachId?: string;
  adId?: string;
  label: string;
  date: string;
  slot: string;
  name: string;
  email: string;
  phone: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const uid = (p = "") =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const coachName = (c: Pick<CoachProfile, "firstName" | "lastName">) =>
  `${c.firstName} ${c.lastName}`.trim();

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const asList = (v: any): string[] =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim())
    : [];

export const asIncludes = (v: any): IncludeItem[] =>
  Array.isArray(v) ? v.filter((x) => x && x.label) : [];

export function buildAd(type: AdTypeKey, data: Record<string, any>): Ad {
  const s = (k: string) =>
    typeof data[k] === "string" ? (data[k] as string).trim() : "";

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (s(k)) return s(k);
    }
    return "";
  };

  const images = asList(data.images);

  return {
    id: uid("ad_"),
    type,
    title: pick("titre", "clubName", "nom") || adTypeByKey(type)?.title || "Annonce",
    titleAccent: s("titreAccent") || undefined,
    author: pick("orgName", "clubName", "organisme", "nom") || "Anonyme",
    location: pick("localisation"),
    level: pick("niveau", "niveauVise", "niveauArb", "public"),
    contract: pick("contrat"),
    description: pick("description"),
    images,
    data,
    status: "pending",
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Persistance localStorage
// ---------------------------------------------------------------------------
const read = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota localStorage : on évite de casser l'app
  }
};

export const loadAds = () => read<Ad[]>("mybasket_annonces", []);
export const saveAds = (ads: Ad[]) => write("mybasket_annonces", ads);

export const loadCoaches = () => read<CoachProfile[]>("mybasket_coaches", []);
export const saveCoaches = (coaches: CoachProfile[]) =>
  write("mybasket_coaches", coaches);

export const loadFavs = () => read<string[]>("mybasket_fav_ads", []);
export const saveFavs = (favs: string[]) => write("mybasket_fav_ads", favs);

export const loadBookings = () => read<Booking[]>("mybasket_bookings", []);
export const saveBookings = (bookings: Booking[]) =>
  write("mybasket_bookings", bookings);

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
export const SEED_ADS: Ad[] = [
  buildAd("camp-stage", {
    titre: "Summer Hoops",
    titreAccent: "CAMP 2026",
    intro:
      "Une semaine intensive pour progresser, se dépasser et vivre une expérience basket inoubliable !",
    images: [],
    ageRange: "12 – 17 ans",
    niveau: "Intermédiaire à Avancé",
    genre: "Garçons & Filles",
    places: "40",
    dates: "Du 12 au 18 juillet 2026",
    dateLimite: "2026-06-30",
    prix: "650 €",
    langue: "Français / Anglais",
    hebergement: "Résidence sportive",
    repas: "3 repas / jour inclus",
    localisation: "Barcelone, Espagne",
    pillars: [
      "Technique individuelle",
      "Tactique collective",
      "Préparation physique",
      "Mental & Leadership",
    ],
    about:
      "Le Summer Hoops Camp est ouvert aux jeunes joueurs souhaitant élever leur niveau dans un environnement professionnel et international.",
    aboutBullets: [
      "Entraînements quotidiens intensifs",
      "Staff qualifié et expérimenté",
      "Compétitions et scrimmages",
      "Hébergement et repas inclus",
    ],
    includes: [
      { label: "Entraînements", sub: "2x par jour" },
      { label: "Hébergement", sub: "6 nuits" },
      { label: "Repas", sub: "3 repas / jour" },
      { label: "Équipement", sub: "Fourni" },
      { label: "Activités", sub: "Extra-basket" },
      { label: "Assurance", sub: "Incluse" },
    ],
    program: [
      "Technique individuelle",
      "Tactique collective",
      "Préparation physique",
      "Mental & Leadership",
      "Matchs & tournois",
      "Ateliers mentaux",
      "Activités et loisirs",
    ],
    quote: "Progresse, dépasse-toi, deviens meilleur",
    description:
      "Rejoins des joueurs du monde entier pour une semaine unique dédiée au basket. Encadré par des coachs professionnels, tu participeras à des entraînements intensifs, des ateliers spécialisés, des matchs et des activités pour développer ton jeu et ton mental.",
    descBullets: [
      "Entraînements intensifs matin et après-midi",
      "Groupes de niveau pour un suivi personnalisé",
      "Analyse vidéo et feedback individuel",
      "Tournois et compétitions",
      "Activités extra-basket",
    ],
    highlights: [
      "Barcelone, Espagne",
      "Environnement international",
      "Expérience inoubliable",
    ],
    orgName: "Hoops Academy",
    orgLocation: "Barcelone, Espagne",
    coordonnees: "camp@hoopsacademy.com",
  }),

  buildAd("club-recherche-joueur", {
    clubName: "BC Lyon Métropole",
    intro: "Club ambitieux recrute pour la fin de saison.",
    niveau: "National 2",
    categorie: "Seniors",
    poste: "Meneur",
    taille: "185 cm minimum",
    annee: "2000",
    contrat: "Semi-pro",
    localisation: "Lyon (69)",
    description:
      "Vestiaire sain, projet sportif solide, recherche joueur expérimenté pour compléter l’effectif.",
    aboutBullets: [
      "Expérience N2/N1 souhaitée",
      "Bon QI basket",
      "Leadership",
    ],
    descBullets: [
      "Projet sportif structuré",
      "Encadrement sérieux",
      "Possibilité d’intégration rapide",
    ],
    coordonnees: "recrutement@bclyon.fr",
    images: [],
  }),

  buildAd("club-recherche-staff", {
    clubName: "Paris Basket Formation",
    intro: "Structure ambitieuse recherche un membre du staff pour accompagner ses équipes jeunes.",
    roleStaff: "Assistant coach",
    niveau: "Espoirs",
    categorie: "U18",
    contrat: "Indemnisé",
    remuneration: "À discuter selon profil",
    localisation: "Paris (75)",
    description:
      "Nous recherchons un profil motivé, sérieux et disponible pour intégrer un projet de formation exigeant.",
    aboutBullets: [
      "Participation aux entraînements",
      "Suivi individuel des joueurs",
      "Aide à la préparation vidéo",
    ],
    descBullets: [
      "Projet structuré",
      "Environnement formateur",
      "Staff dynamique",
    ],
    coordonnees: "staff@parisbasketformation.fr",
    images: [],
  }),
];

export const SEED_COACHES: CoachProfile[] = [
  {
    id: "coach_seed1",
    firstName: "Thomas",
    lastName: "Lemaire",
    jobTitle: "Coach individuel de basketball",
    available: true,
    location: "Lyon, France",
    mobilityNote: "Déplacements possibles",
    phone: "06 12 34 56 78",
    email: "thomas.lemaire@email.com",
    bio:
      "Ancien joueur professionnel, spécialisé dans le développement individuel des joueurs de tous niveaux.",
    bioBullets: [
      "Approche personnalisée",
      "Suivi et plan sur mesure",
      "Progrès mesurables",
      "Passion et exigence",
      "Résultats durables",
    ],
    pillars: [
      "Technique individuelle",
      "Développement mental",
      "Préparation physique",
      "Analyse vidéo",
    ],
    tags: [
      "Shooting",
      "Ball Handling",
      "Finishing",
      "Développement mental",
      "Lecture de jeu",
      "Confiance",
    ],
    sessionType: "Individuelle",
    audience: "U10 à Pro",
    level: "Débutant à Avancé",
    locationLabel: "Lyon et alentours",
    availability: "Lun – Dim · 8h – 21h",
    travel: "Oui",
    materialProvided: "Oui",
    durations: [
      { id: uid(), label: "1h", price: "60 €" },
      { id: uid(), label: "1h30", price: "80 €" },
      { id: uid(), label: "2h", price: "110 €" },
    ],
    material: [
      "Ballons de basket",
      "Équipement de tir",
      "Élastiques & bandes",
      "Matériel de motricité",
      "Tablette pour analyse vidéo",
      "Matériel adapté selon les objectifs",
    ],
    sessionFlow: [
      {
        id: uid(),
        title: "Échauffement & activation",
        desc: "10 à 15 minutes pour préparer le corps et l’esprit.",
      },
      {
        id: uid(),
        title: "Évaluation & objectifs",
        desc: "Analyse des besoins et définition des objectifs.",
      },
      {
        id: uid(),
        title: "Travail technique ciblé",
        desc: "Exercices adaptés au niveau et aux objectifs du joueur.",
      },
      {
        id: uid(),
        title: "Mise en situation",
        desc: "Jeux, situations réelles et prise de décision.",
      },
      {
        id: uid(),
        title: "Feedback",
        desc: "Retour individualisé et axes de progression.",
      },
    ],
    offers: [
      {
        id: uid(),
        title: "Amélioration technique",
        desc: "Tir, dribble, passes, appuis et finitions.",
      },
      {
        id: uid(),
        title: "Développement physique",
        desc: "Explosivité, coordination, agilité et endurance.",
      },
      {
        id: uid(),
        title: "Préparation mentale",
        desc: "Confiance, concentration et gestion du stress.",
      },
      {
        id: uid(),
        title: "Lecture de jeu",
        desc: "Vision, décisions et intelligence de jeu.",
      },
    ],
    sessionsCount: 156,
    experienceYears: "3 ans+",
    rating: 4.9,
    reviewsCount: 27,
    reviews: [
      {
        id: uid(),
        name: "Lucas D.",
        meta: "16 ans",
        stars: 5,
        text:
          "Thomas m’a vraiment aidé à passer un cap cette saison. Très pro et à l’écoute !",
      },
      {
        id: uid(),
        name: "Mathis P.",
        meta: "U17",
        stars: 5,
        text: "Des séances intenses et efficaces. Je recommande à 100% !",
      },
      {
        id: uid(),
        name: "Noah B.",
        meta: "15 ans",
        stars: 5,
        text:
          "Coach au top ! J’ai progressé sur tous les aspects de mon jeu.",
      },
    ],
    videoUrl: "",
    photos: [],
    createdAt: Date.now() - 86400000 * 8,
  },
];

// ---------------------------------------------------------------------------
// Admin annonces
// ---------------------------------------------------------------------------
export function approveAd(id: string): Ad[] {
  const next = loadAds().map((ad) =>
    ad.id === id ? { ...ad, status: "approved" as const } : ad
  );

  saveAds(next);
  return next;
}

export function rejectAd(id: string): Ad[] {
  const next = loadAds().map((ad) =>
    ad.id === id ? { ...ad, status: "rejected" as const } : ad
  );

  saveAds(next);
  return next;
}

export function deleteAd(id: string): Ad[] {
  const next = loadAds().filter((ad) => ad.id !== id);

  saveAds(next);
  return next;
}
