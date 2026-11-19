export const APP_TOOLS = [
 {id:'teams',name:'Mes équipes',text:'Effectif, calendrier et suivi des joueurs',href:'/mon-compte?tab=equipes',icon:'👥'},
 {id:'sessions',name:'Préparer une séance',text:'Exercices, durée et consignes',href:'/panier',icon:'📋'},
 {id:'drawing',name:'Dessin et scan',text:'Créer, importer et animer tes schémas',href:'/plaquette?new=1',icon:'🏀'},
 {id:'video',name:'Vidéo et montage',text:'Retrouver tes clips et construire ton film',href:'/montages',icon:'🎬'},
 {id:'messages',name:'Messagerie',text:'Échanger avec ton staff et tes joueurs',href:'/mon-compte?tab=messagerie',icon:'💬'},
 {id:'library',name:'Bibliothèque',text:'Exercices, systèmes et séances',href:'/bibliotheque',icon:'📚'},
 {id:'live',name:'Prise de stats',text:'Coder le match et retrouver les actions',href:'/prise-stats-pro',icon:'⏱'},
 {id:'management',name:'Management',text:'Statistiques, historique et organisation',href:'/mon-compte?tab=management',icon:'🗂'},
 {id:'calendar',name:'Mon calendrier',text:'Retrouver les rendez-vous de ton compte',href:'/mon-compte?tab=calendrier',icon:'📅'},
 {id:'institution',name:'Institutionnel',text:'Accéder à ton espace institutionnel',href:'/institutionnel',icon:'🏛'},
] as const;
export type AppToolId=typeof APP_TOOLS[number]['id'];
export const DEFAULT_APP_MENU:AppToolId[]=['teams','sessions','drawing','video','messages','management'];
export function validAppMenu(value:unknown):value is AppToolId[]{return Array.isArray(value)&&value.length>0&&value.length<=APP_TOOLS.length&&value.every(id=>APP_TOOLS.some(tool=>tool.id===id))&&new Set(value).size===value.length}
export function appMenu(value:unknown):AppToolId[]{const cleaned=Array.isArray(value)?value.filter(id=>id!=='analysis'):value;return validAppMenu(cleaned)?[...cleaned]:[...DEFAULT_APP_MENU]}
