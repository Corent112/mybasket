export type CodingMode = 'live' | 'live-individual' | 'post' | 'match-review';

export type CodingModeDefinition = {
  id: CodingMode;
  label: string;
  icon: string;
  description: string;
  family: 'live-collective' | 'live-individual' | 'post-match' | 'match-review';
};

/**
 * Source unique des 4 modules de codage.
 * On partage le moteur de données/vidéo, mais chaque mode reste identifié
 * séparément afin qu'une évolution du hors-live ne modifie pas le Live.
 */
export const CODING_MODES: CodingModeDefinition[] = [
  {
    id: 'live',
    label: 'Live collectif',
    icon: '🔴',
    family: 'live-collective',
    description: 'Codage collectif rapide : attaque/défense, systèmes, temps forts, résultats et possessions.',
  },
  {
    id: 'live-individual',
    label: 'Live individuel',
    icon: '👤',
    family: 'live-individual',
    description: 'Codage centré joueur, sans imposer système/temps fort. Attribution rapide des actions individuelles.',
  },
  {
    id: 'post',
    label: 'Hors live',
    icon: '🎬',
    family: 'post-match',
    description: 'Analyse vidéo détaillée. Shot Chart obligatoire : elle détermine automatiquement intérieur / extérieur.',
  },
  {
    id: 'match-review',
    label: 'Retour de match',
    icon: '📝',
    family: 'match-review',
    description: 'Constructeur libre : blocs, boutons, ordre, logique, valeurs et règles créés de A à Z par l’utilisateur.',
  },
];

export function isPostLikeCodingMode(mode: CodingMode): boolean {
  return mode === 'post' || mode === 'match-review';
}
