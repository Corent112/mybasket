import type { ComponentProps } from 'react';
import type Feather from '@expo/vector-icons/Feather';

export type Icon = ComponentProps<typeof Feather>['name'];
type Link = { id: string; label: string; icon: Icon; route: `/${string}`; sections?: never };
type Menu = { id: string; label: string; icon: Icon; route?: never; sections: Section[] };
export type Entry = Link | Menu;
type Section = { title: string; entries: Entry[] };

const link = (id: string, label: string, icon: Icon, route: Link['route']): Link => ({ id, label, icon, route });
const menu = (id: string, label: string, icon: Icon, ...sections: Section[]): Menu => ({ id, label, icon, sections });
const group = (title: string, ...entries: Entry[]): Section => ({ title, entries });

export const library = menu('library', 'Bibliothèque', 'book-open', group('Contenus',
  link('library-all', 'Toute la bibliothèque', 'grid', '/bibliotheque'),
  link('exercises', 'Exercices', 'activity', '/exercices'),
  link('systems', 'Systèmes', 'git-branch', '/systemes'),
  link('sessions', 'Séances', 'calendar', '/seances'),
));
export const drawing = menu('drawing', 'Dessin', 'edit-3', group('Plaquette',
  link('draw-board', 'Ouvrir la plaquette', 'edit-3', '/plaquette?new=1'),
  link('playbooks-draw', 'Playbooks', 'book', '/mon-compte/playbooks'),
));
const coaching = menu('coaching', 'Accompagnement', 'compass', group('Services',
  link('coaching-all', 'Accompagnement', 'compass', '/accompagnement'),
  link('director', 'Direction technique', 'clipboard', '/accompagnement/direction-technique'),
  link('courses', 'Formation', 'award', '/accompagnement/formation'),
  link('video-scouting', 'Scouting vidéo', 'video', '/accompagnement/scouting-video'),
));
const live = menu('live', 'LiveStats', 'activity', group('Codage',
  link('live-start', 'Coder un match', 'play', '/prise-stats-live'),
  link('live-shared', 'Live mutualisé', 'users', '/management/live-mutualise'),
  link('live-coding', 'Codification', 'sliders', '/management/codification'),
  link('live-history', 'Historique', 'clock', '/management/historique'),
));
const management = menu('management', 'Management', 'bar-chart-2',
  group('Match et vidéo', live,
    link('montage', 'Montage', 'film', '/montages'),
    link('scouting', 'Scouting', 'search', '/mon-compte?tab=equipes&teamType=scout'),
    link('shooting', 'Grilles de tir', 'target', '/mon-compte?tab=papiers'),
  ),
  group('Préparer et suivre',
    link('game-plan', 'Game plan', 'clipboard', '/management/game-plan'),
    link('rotation', 'Rotation', 'repeat', '/management/rotation'),
    link('minutes', 'Temps de jeu', 'clock', '/management/temps'),
    link('performance', 'Performance', 'trending-up', '/management/performance'),
    link('stats', 'Statistiques de jeu', 'bar-chart-2', '/management/stats-jeu'),
  ),
);

export const mainMenu = menu('main', 'Explorer', 'grid',
  group('Outils', library, drawing, coaching),
  group('Services',
    link('ads', 'Annonces', 'volume-2', '/annonces'),
    link('plans', 'Abonnements', 'credit-card', '/abonnements'),
    link('shop', 'Boutique', 'shopping-bag', '/boutique'),
    link('cart', 'Panier', 'shopping-cart', '/panier'),
  ),
  group('MyBasket',
    link('about', 'Découvrir MyBasket', 'info', '/mybasket-cest-quoi'),
    link('team-about', 'Qui sommes-nous ?', 'users', '/qui-sommes-nous'),
    link('contact', 'Contact', 'mail', '/contact'),
  ),
);
export const accountMenu = menu('account', 'Mon compte', 'user',
  group('Mes outils',
    link('teams', 'Mes équipes', 'users', '/mon-compte?tab=equipes'),
    management,
    link('institution', 'Institutionnel', 'flag', '/institutionnel'),
    link('club', 'Espace Club', 'home', '/mon-compte/club'),
    link('calendar', 'Mon calendrier', 'calendar', '/mon-compte/calendrier'),
  ),
  group('Mes contenus',
    link('my-sessions', 'Mes séances', 'calendar', '/mon-compte/seances'),
    link('my-exercises', 'Mes exercices', 'activity', '/mon-compte/exercices'),
    link('my-systems', 'Mes systèmes', 'git-branch', '/mon-compte/systemes'),
    link('my-playbooks', 'Mes playbooks', 'book', '/mon-compte/playbooks'),
    link('favorites', 'Mes favoris', 'star', '/mon-compte/favoris'),
    link('documents', 'Mes documents', 'folder', '/mon-compte/documents'),
    link('resources', 'Ressources', 'archive', '/mon-compte/ressources'),
  ),
  group('Mon espace',
    link('profile', 'Mon profil', 'user', '/mon-compte?tab=profil'),
    link('coach-profile', 'Profil coach', 'award', '/mon-compte?tab=profilcoach'),
    link('messages', 'Messagerie', 'message-circle', '/mon-compte?tab=messagerie'),
    link('my-plans', 'Mon abonnement', 'credit-card', '/mon-compte?tab=abonnement'),
    link('my-ads', 'Mes annonces', 'volume-2', '/mon-compte?tab=annonces'),
    link('settings', 'Paramètres', 'settings', '/mon-compte/parametres'),
    link('security', 'Sécurité', 'shield', '/mon-compte/securite'),
  ),
);
export const launchEntries = [library, drawing, coaching, live, management] as const;
