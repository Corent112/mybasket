import {jsPDF} from 'jspdf';
import {imageData} from './trombinoscope-pdf';

type Row=[string,unknown];
export function playerProfileSections(player:Record<string,any>):Array<[string,Row[]]>{
 const p=player.profile_data||{};
 return [
 ['Identité et coordonnées', [['Nom',player.last_name],['Prénom',player.first_name],['Naissance',player.birthdate],['Catégorie',player.category],['Sexe',player.sex==='F'?'Féminin':player.sex==='M'?'Masculin':player.sex],['Nationalité',p.nationality],['Téléphone',player.phone],['Email',player.email],['Adresse',p.street||p.address],['Code postal',p.postalCode||p.postal_code],['Ville',p.city]]],
 ['Profil sportif', [['Club',player.club_name],['Licence',player.license_number||p.licenseNumber],['Poste principal',player.position_primary||p.position],['Poste secondaire',player.position_secondary||p.secondaryPosition],['Main dominante',player.dominant_hand||p.dominantHand],['Maillot',p.jerseyNumber],['Couleur du maillot',p.jerseyColor],['Années de basket',p.basketballYears],['Autres sports',p.otherSports]]],
 ['Mensurations', [['Taille (cm)',player.height_cm],['Poids (kg)',player.weight_kg??p.weight],['Envergure (cm)',player.wingspan_cm],['Pointure',p.shoeSize],['Taille du père (cm)',player.father_height_cm],['Taille de la mère (cm)',player.mother_height_cm]]],
 ['Famille et scolarité', [['Responsable 1',p.guardian1Name],['Téléphone responsable 1',player.tutor1_phone||p.guardian1Phone],['Email responsable 1',player.tutor1_email||p.guardian1Email],['Responsable 2',p.guardian2Name],['Téléphone responsable 2',player.tutor2_phone||p.guardian2Phone],['Email responsable 2',player.tutor2_email||p.guardian2Email],['Frères et sœurs',p.siblings],['Établissement',player.school||p.school],['Classe',player.class_name||p.className]]],
 ['Croissance', [['Âge osseux',p.growth?.boneAge],['Taille assise (cm)',p.growth?.sittingHeightCm]]],
 ['Observations', [['Observations',p.observations],['Provenance',p.provenance],['Questionnaire renseigné le',p.familyQuestionnaire?.submittedAt]]]
 ];
}
/** Exports recorded values only. Long fields flow onto following pages without truncation. */
export async function createPlayerProfilePdf(input:{player:Record<string,any>;institution:{name:string;logo_url?:string|null;season_label?:string|null};matches?:Record<string,any>[];referral?:Record<string,any>|null;measurements?:Record<string,any>[];attendance?:Record<string,any>[]}){
 const {player,institution}=input,doc=new jsPDF({format:'a4',unit:'mm'});
 const [logo,photo]=await Promise.all([imageData(institution.logo_url),imageData(player.photo_url)]);
 if(institution.logo_url&&!logo)throw Error('Le logo du comité est inaccessible. Réessaie avant d’exporter la fiche.');
 let y=20;const width=178,bottom=273;
 const font=(size:number,bold=false,color='#29232a')=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);};
 const header=()=>{if(logo){const i=doc.getImageProperties(logo),scale=Math.min(28/i.width,23/i.height);doc.addImage(logo,'JPEG',16,12,i.width*scale,i.height*scale);}font(10,true,'#6b1a2c');doc.text(doc.splitTextToSize(institution.name,140),logo?49:16,20);font(8);doc.text(`FICHE JOUEUR${institution.season_label?' · '+institution.season_label:''}`,logo?49:16,30);doc.setDrawColor('#dfd4cd');doc.line(16,39,194,39);y=48;};
 const space=(height:number)=>{if(y+height>bottom){doc.addPage();header();}};
 const paragraph=(value:unknown,size=9,bold=false)=>{font(size,bold);const lines:string[]=doc.splitTextToSize(String(value??'').replace(/\r/g,''),width);for(const line of lines){space(5);font(size,bold);doc.text(line,16,y);y+=5;}};
 const section=(title:string)=>{space(17);y+=4;font(11,true,'#6b1a2c');doc.text(title,16,y);y+=8;};
 header();font(20,true,'#6b1a2c');const names:string[]=doc.splitTextToSize(`${player.first_name||''} ${player.last_name||''}`.trim(),photo?140:width);doc.text(names,16,y);y+=names.length*8+4;
 if(photo){const i=doc.getImageProperties(photo),scale=Math.min(27/i.width,31/i.height);doc.addImage(photo,'JPEG',166,44,i.width*scale,i.height*scale);y=Math.max(y,80);}
 for(const [title,rows] of playerProfileSections(player)){const filled=rows.filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=='');if(!filled.length)continue;section(title);for(const [label,value]of filled)paragraph(`${label} : ${value}`);}
 if(input.referral){section('Signalement d’origine');for(const [label,key]of [['Auteur','reporter_name'],['Email','reporter_email'],['Rôle','reporter_role'],['Lieu','venue'],['Date','created_at'],['Observation','reason']])if(input.referral[key])paragraph(`${label} : ${input.referral[key]}`);}

 const p=player.profile_data||{};
 for(const [title,key]of [['Profil joueur','profiling'],['Bilan sportif','sportsReport'],['Suivi Pôle','poleFollowup']]){
   const value=p[key];if(!value||typeof value!=='object')continue;
   const labels:Record<string,string>={title:'Titre',notes:'Notes',profile:'Profil',strengths:'Points forts',workAxes:'Axes de travail',projection:'Projection',ratings:'Évaluations',updatedAt:'Mis à jour le'};
   const filled=Object.entries(value).filter(([k,v])=>k!=='updatedAt'&&v!=null&&String(v).trim());if(!filled.length)continue;
   section(title);for(const [key,value]of filled){if(value&&typeof value==='object'){for(const [label,rating]of Object.entries(value))paragraph(`${label} : ${rating}`);}else paragraph(`${labels[key]||key} : ${value}`);}
 }
 for(const [title,key]of [['Suivi médical','medicalEntries'],['Bilans','bilans'],['Documents associés','documents']]){
   const rows=p[key];if(!Array.isArray(rows)||!rows.length)continue;section(title);
   for(const row of rows){paragraph([row.date,row.title,row.name,row.status].filter(Boolean).join(' · '),9,true);if(row.notes)paragraph(row.notes);if(row.url||row.file_url)paragraph(row.url||row.file_url,8);}
 }
 if(input.measurements?.length){section('Historique des mesures');for(const m of input.measurements)paragraph([m.measured_at,m.height_cm!=null?`Taille ${m.height_cm} cm`:null,m.weight_kg!=null?`Poids ${m.weight_kg} kg`:null,m.wingspan_cm!=null?`Envergure ${m.wingspan_cm} cm`:null,m.shoe_size!=null?`Pointure ${m.shoe_size}`:null].filter(Boolean).join(' · '));}
 if(input.attendance?.length){section('Présences enregistrées');const statuses:Record<string,string>={present:'Présent',absent:'Absent',excused:'Excusé'};for(const r of input.attendance)paragraph([r.session?.session_date,r.session?.title,statuses[r.status]||r.status,r.session?.location].filter(Boolean).join(' · '));}
 const matches=input.matches||[];
 section(`Statistiques par match (${matches.length})`);
 if(!matches.length)paragraph('Aucun match joué lié à cette fiche.');
 for(const match of matches){space(27);paragraph(`${match.date||'Date non renseignée'} · ${match.teamName||''} vs ${match.opponent||'Adversaire non renseigné'}`,9,true);paragraph(`${match.category||''}${match.matchCategory?' · '+match.matchCategory:''}${match.tournaments?.length?' · '+match.tournaments.map((t:any)=>t.name).join(', '):''}`,8);paragraph(`PTS ${match.pts}   REB ${match.reb}   PD ${match.ast}   INT ${match.stl}   CTR ${match.blk}   BP ${match.turnovers}   MIN ${match.minutes==null?'-':Number(match.minutes).toFixed(1)}`,8);paragraph(`2PTS ${match.p2m}/${match.p2a}   3PTS ${match.p3m}/${match.p3a}   LF ${match.ftm}/${match.fta}`,8);y+=3;}
 const count=doc.getNumberOfPages();for(let page=1;page<=count;page++){doc.setPage(page);font(7,false,'#786e73');doc.text(`MyBasket · ${new Date().toLocaleDateString('fr-FR')} · Informations enregistrées`,16,285);doc.text(`${page} / ${count}`,194,285,{align:'right'});}
 return doc;
}
