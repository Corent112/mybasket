export type FiltersConfig = {
  categories: string[];
  types: string[];
  niveaux: string[];
  themes: string[];
  temps: string[];
  plotsMax: number;
  ballonsMax: number;
  paniersMax: number;
  joueursMax: number;
};

export const FILTERS_KEY = 'mybasket_filters_config';

export const DEFAULT_FILTERS: FiltersConfig = {
  categories: ['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'Senior'],
  types: ['Individuel', 'Pré-co', 'Collectif'],
  niveaux: ['Débutant', 'Intermédiaire', 'Confirmé'],
  themes: ['Échauffement', 'Dribble', 'Passe', 'Défense', 'Tir', 'Pré-co', 'Surnombre', 'Ludique', 'Rebonds', 'Physique'],
  temps: ['5', '10', '15', '20', '25', '30', '40', '45', '60', '75', '90'],
  plotsMax: 12,
  ballonsMax: 12,
  paniersMax: 8,
  joueursMax: 20,
};

export function loadFilters(): FiltersConfig {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { /* */ }
  return DEFAULT_FILTERS;
}

export function saveFilters(cfg: FiltersConfig) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(cfg));
}