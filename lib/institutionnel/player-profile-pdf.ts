import {normalizeClubHistory} from '../player-club-history';
import {playerPdfDetailRows} from '../player-pdf-details';
import {siblingDetailsLabel} from './player-family-details';
import {jsPDF} from 'jspdf';
import {imageData} from './trombinoscope-pdf';

type Row=[string,unknown];
export function playerProfileSections(player:Record<string,any>):Array<[string,Row[]]>{
 const p=player.profile_data||{};
 return [
 ['Identité et coordonnées', [['Nom',player.last_name],['Prénom',player.first_name],['Naissance',player.birthdate],['Catégorie',player.category],['Sexe',player.sex==='F'?'Féminin':player.sex==='M'?'Masculin':player.sex],['Nationalité',p.nationality],['Téléphone',player.phone],['Email',player.email],['Adresse',p.street||p.address],['Code postal',p.postalCode||p.postal_code],['Ville',p.city]]],
 ['Profil sportif', [['Club',player.club_name],['Sélection départementale',p.departmentalSelectionName],['Sélection régionale',p.regionalSelectionName],['Licence',player.license_number||p.licenseNumber],['Poste principal',player.position_primary||p.position],['Poste secondaire',player.position_secondary||p.secondaryPosition],['Main dominante',player.dominant_hand||p.dominantHand],['Maillot',p.jerseyNumber],['Couleur du maillot',p.jerseyColor],['Années de basket',p.basketballYears],['Autres sports',p.otherSports]]],
 ['Mensurations', [['Taille (cm)',player.height_cm],['Poids (kg)',player.weight_kg??p.weight],['Envergure (cm)',player.wingspan_cm],['Pointure',p.shoeSize],['Taille du père (cm)',player.father_height_cm],['Taille de la mère (cm)',player.mother_height_cm]]],
 ['Famille et scolarité', [['Responsable 1',p.guardian1Name],['Téléphone responsable 1',player.tutor1_phone||p.guardian1Phone],['Email responsable 1',player.tutor1_email||p.guardian1Email],['Responsable 2',p.guardian2Name],['Téléphone responsable 2',player.tutor2_phone||p.guardian2Phone],['Email responsable 2',player.tutor2_email||p.guardian2Email],['Frères et sœurs',[p.siblings,siblingDetailsLabel(p.siblingDetails)].filter(Boolean).join(' ; ')],['Établissement',player.school||p.school],['Classe',player.class_name||p.className]]],
 ['Croissance', [['Âge osseux',p.growth?.boneAge],['Taille assise (cm)',p.growth?.sittingHeightCm]]],
 ['Observations', [['Observations',p.observations],['Provenance',p.provenance],['Questionnaire renseigné le',p.familyQuestionnaire?.submittedAt]]]
 ];
}
/** Editorial player dossier. Every value comes from the saved player record. */
export async function createPlayerProfilePdf(input:{player:Record<string,any>;institution:{name:string;logo_url?:string|null;season_label?:string|null};matches?:Record<string,any>[];referral?:Record<string,any>|null;measurements?:Record<string,any>[];attendance?:Record<string,any>[];seasonEntries?:Record<string,any>[];trackingSeasons?:Record<string,any>[];extraSections?:Array<{title:string;records:Record<string,any>[]}>}){
 const {player,institution}=input,p=player.profile_data||{},doc=new jsPDF({format:'a4',unit:'mm'});
 const [logo,photo]=await Promise.all([imageData(institution.logo_url),imageData(player.photo_url)]);
 if(institution.logo_url&&!logo)throw Error('Le logo du comité est inaccessible. Réessaie avant d’exporter la fiche.');
 const wine='#6b1a2c',ink='#232a39',muted='#707783',line='#e3dce0',pale='#f6f2f3';
 const name=[player.first_name,player.last_name].filter(Boolean).join(' '),width=178,bottom=273;
 const filled=(v:unknown)=>v!==null&&v!==undefined&&String(v).trim()!=='';
 const date=(v:any)=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10).split('-').reverse().join('/'):String(v||'');
 const font=(size:number,bold=false,color=ink)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);};
 const picture=(data:string,x:number,y:number,w:number,h:number)=>{const image=doc.getImageProperties(data),scale=Math.min(w/image.width,h/image.height);doc.addImage(data,'JPEG',x+(w-image.width*scale)/2,y+(h-image.height*scale)/2,image.width*scale,image.height*scale);};
 const rule=(y:number)=>{doc.setDrawColor(line);doc.setLineWidth(.25);doc.line(16,y,doc.internal.pageSize.getWidth()-16,y);};
 let y=48;
 const header=(label='DOSSIER JOUEUR')=>{doc.setFillColor(wine);doc.rect(0,0,doc.internal.pageSize.getWidth(),3,'F');if(logo)picture(logo,16,10,18,19);font(8,true,wine);doc.text(doc.splitTextToSize(institution.name,145),logo?40:16,17);font(8,false,muted);doc.text(label+(institution.season_label?' / '+institution.season_label:''),logo?40:16,29);rule(36);font(10,true);doc.text(doc.splitTextToSize(name,178),16,43);y=54;};
 const newPage=(label:string)=>{doc.addPage();header(label);};
 const space=(height:number)=>{if(y+height>bottom)newPage('DOSSIER JOUEUR / SUITE');};
 const paragraph=(value:unknown,size=9,bold=false)=>{font(size,bold);const lines:string[]=doc.splitTextToSize(String(value??'').replace(/\r/g,''),width);for(const text of lines){space(5);font(size,bold);doc.text(text,16,y);y+=5;}};
 const section=(title:string)=>{space(20);y+=5;doc.setFillColor(wine);doc.rect(16,y-4,1.5,6,'F');font(11,true,wine);doc.text(title.toLocaleUpperCase('fr'),21,y);y+=9;};
 const rows=(values:Row[])=>{for(const [label,value]of values.filter(([,v])=>filled(v))){space(12);font(7,true,muted);doc.text(label.toLocaleUpperCase('fr'),16,y);y+=4;paragraph(value,9);y+=2;}};
 const metrics=[['TAILLE',player.height_cm,'cm'],['ENVERGURE',player.wingspan_cm,'cm']];
 // Cover: institution identity, player photo and height and wingspan only; weight remains in the detailed follow-up.
 doc.setFillColor('#faf8f8');doc.rect(0,0,210,297,'F');doc.setFillColor(wine);doc.rect(0,0,210,5,'F');
 doc.setDrawColor('#ebe5e8');doc.setLineWidth(.6);doc.circle(105,36,48);doc.circle(105,36,36);
 if(logo)picture(logo,75,12,60,43);else{font(15,true,wine);doc.text(doc.splitTextToSize(institution.name,170),105,31,{align:'center'});}
 let nameSize=25;font(nameSize,true,wine);while(doc.getTextWidth(name.toLocaleUpperCase('fr'))>178&&nameSize>12)font(--nameSize,true,wine);doc.text(doc.splitTextToSize(name.toLocaleUpperCase('fr'),178),105,72,{align:'center'});
 font(10,true);doc.text(doc.splitTextToSize(institution.name,178),105,85,{align:'center'});font(9,false,muted);doc.text('FICHE JOUEUR'+(institution.season_label?' / '+institution.season_label:''),105,94,{align:'center'});
 metrics.forEach(([label,value,unit],index)=>{const cardWidth=86.5,x=16+index*(cardWidth+5);doc.setFillColor('#ffffff');doc.roundedRect(x,105,cardWidth,28,3,3,'F');font(8,true,muted);doc.text(String(label),x+cardWidth/2,114,{align:'center'});font(18,true,wine);doc.text(filled(value)?`${value} ${unit}`:'—',x+cardWidth/2,126,{align:'center'});});
 const position=[player.position_primary||p.position,player.position_secondary||p.secondaryPosition].filter(Boolean).join(' / ');
 font(11,true,wine);doc.text(position?`POSTE ${position}`:'POSTE NON RENSEIGNÉ',145,147,{align:'center'});
 doc.setFillColor('#eee8eb');doc.roundedRect(103,154,91,109,3,3,'F');if(photo)picture(photo,105,156,87,105);else{font(10,false,muted);doc.text('Photo non renseignée',148.5,210,{align:'center'});}
 let coverY=164;const coverFact=(label:string,value:unknown)=>{if(!filled(value))return;font(7,true,muted);doc.text(label.toLocaleUpperCase('fr'),16,coverY);font(10,true);const lines:string[]=doc.splitTextToSize(String(value),80);doc.text(lines,16,coverY+6);coverY+=12+lines.length*4;};
 coverFact('Naissance',date(player.birthdate));coverFact('Catégorie',player.category);coverFact('Club actuel',player.club_name);coverFact('Projet scolaire',[player.school||p.school,player.class_name||p.className].filter(Boolean).join(' / '));
 font(8,false,muted);doc.text('PARCOURS / PROFIL / SUIVI / INFORMATIONS',16,278);
 newPage('PARCOURS & PROFIL');
 const entries:Array<Record<string,any>>=[...(input.seasonEntries||[])].map(entry=>({...entry,season:input.trackingSeasons?.find(season=>season.id===entry.season_id)?.season_label||''})).sort((a,b)=>String(a.season).localeCompare(String(b.season)));
 section('Parcours club');
 const career=[...normalizeClubHistory(p.clubHistory).map(row=>({season:row.season,club:row.club,category:row.category,level:row.level})),...entries.map(row=>({season:row.season,club:row.club_name||'',category:row.category||'',level:row.position_label?`Poste : ${row.position_label}`:''}))];
 const seenCareer=new Set<string>();
 const careerRows=career.filter(row=>{const key=`${row.season}|${row.club}`.toLocaleLowerCase('fr');if(seenCareer.has(key))return false;seenCareer.add(key);return true}).sort((a,b)=>b.season.localeCompare(a.season));
 if(careerRows.length){
  const careerHead=()=>{space(12);doc.setFillColor(wine);doc.rect(16,y-5,178,9,'F');font(8,true,'#ffffff');['SAISON','CLUB','CATÉGORIE','NIVEAU'].forEach((label,i)=>doc.text(label,[19,46,115,146][i],y));y+=10;};careerHead();
  for(const row of careerRows){const values=[row.season,row.club,row.category,row.level],xs=[19,46,115,146],widths=[24,65,28,46];font(8);const lines=values.map((value,i)=>doc.splitTextToSize(value||'—',widths[i]));const h=Math.max(...lines.map(l=>l.length))*4+5;if(y+h>bottom){newPage('PARCOURS / SUITE');careerHead()}doc.setFillColor(pale);doc.rect(16,y-4,178,h,'F');font(8);lines.forEach((line,i)=>doc.text(line,xs[i],y));y+=h;}
 }else paragraph(player.club_name||'Parcours non renseigné.');
 if(filled(p.basketballYears))paragraph(`Pratique du basket : ${p.basketballYears} année(s)`,9);
 const profiling=p.profiling||{},sports=p.sportsReport||{},pole=p.poleFollowup||{};
 if(filled(profiling.profile)){section('Profil');paragraph(profiling.profile);}
 if(filled(profiling.strengths)){section('Points forts');paragraph(profiling.strengths);}
 if(filled(profiling.workAxes)){section('Axes de progression');paragraph(profiling.workAxes);}
 if(filled(profiling.projection)){section('Prospective');paragraph(profiling.projection);}
 if(filled(profiling.notes)){section('Regard du coach');paragraph(profiling.notes);}
 const ratings=Object.entries(profiling.ratings||{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>0);
 if(ratings.length){section('Évaluations enregistrées');for(const [label,value]of ratings){space(9);font(8,true);doc.text(label,16,y);doc.setFillColor(pale);doc.roundedRect(65,y-3,110,3,1,1,'F');doc.setFillColor(wine);doc.roundedRect(65,y-3,110*Math.min(10,Number(value))/10,3,1,1,'F');font(8);doc.text(`${value}/10`,194,y,{align:'right'});y+=8;}}
 for(const [title,value]of [['Bilan sportif',sports],['Suivi Pôle',pole]] as const){const values=Object.entries(value).filter(([k,v])=>k!=='updatedAt'&&filled(v));if(values.length){section(title);for(const [label,detail]of playerPdfDetailRows(value))paragraph(`${label} : ${detail}`);}}
 // Curves use real dated measurements only; missing points are omitted, never zero-filled.
 const measurements=[...(input.measurements||[])].sort((a,b)=>String(a.measured_at||'').localeCompare(String(b.measured_at||'')));
 if(measurements.length){newPage('SUIVI ANTHROPOMÉTRIQUE');section('Évolution des mesures');
  for(const [key,label,unit]of [['height_cm','Taille','cm'],['weight_kg','Poids','kg'],['wingspan_cm','Envergure','cm']]){
   const points=measurements.filter(m=>filled(m[key])&&Number.isFinite(Number(m[key]))&&/^\d{4}-\d{2}-\d{2}/.test(String(m.measured_at||'')));if(!points.length)continue;
   space(63);font(10,true,wine);doc.text(`${label} (${unit})`,16,y);const top=y+5,left=34,right=187,h=34,values=points.map(m=>Number(m[key])),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
   doc.setFillColor(pale);doc.roundedRect(16,top,178,47,2,2,'F');font(7,false,muted);doc.text(String(max),19,top+7);doc.text(String(min),19,top+34);doc.setDrawColor(wine);doc.setLineWidth(.6);
   const dates=points.map(m=>Date.parse(String(m.measured_at).slice(0,10)+"T12:00:00Z")),start=dates[0],end=dates[dates.length-1];
   const coords=points.map((m,i)=>({x:end===start?(left+right)/2:left+(dates[i]-start)*(right-left)/(end-start),y:top+5+(max-Number(m[key]))/span*(h-5)}));
   coords.forEach((point,i)=>{if(i)doc.line(coords[i-1].x,coords[i-1].y,point.x,point.y);doc.setFillColor(wine);doc.circle(point.x,point.y,1,'F');});font(7,false,muted);doc.text(date(points[0].measured_at),left,top+43);doc.text(date(points.at(-1)!.measured_at),right,top+43,{align:'right'});y=top+57;
  }
  section('Mesures enregistrées');for(const m of measurements){paragraph(date(m.measured_at)||'Mesure sans date',9,true);for(const [label,value] of playerPdfDetailRows(m))if(label!=='Date de mesure'){paragraph(`${label} : ${value}`,8);}}
 }
 newPage('INFORMATIONS COMPLÉMENTAIRES');
 for(const [title,values]of playerProfileSections(player)){if(values.some(([,v])=>filled(v))){section(title);rows(values);}}
 if(input.referral){section('Signalement d’origine');rows([['Auteur',input.referral.reporter_name],['Email',input.referral.reporter_email],['Rôle',input.referral.reporter_role],['Lieu',input.referral.venue],['Date',date(input.referral.created_at)],['Observation',input.referral.reason]]);}
 for(const [title,key]of [['Suivi médical','medicalEntries'],['Bilans','bilans'],['Documents associés','documents']]){const records=p[key];if(!Array.isArray(records)||!records.length)continue;section(title);for(const row of records){paragraph([row.date,row.title,row.name,row.status].filter(Boolean).join(' / '),9,true);for(const [label,value]of playerPdfDetailRows(row))paragraph(`${label} : ${value}`,8);}}
 if(input.attendance?.length){newPage('PRÉSENCES & MATCHS');section('Présences enregistrées');const statuses:Record<string,string>={present:'Présent',absent:'Absent',excused:'Excusé',pending:'À renseigner'};for(const r of input.attendance)paragraph([date(r.session?.session_date),r.session?.title,statuses[r.status]||r.status,r.session?.location].filter(Boolean).join(' / '),8);}
 if(p.growth&&Object.keys(p.growth).length){section('Croissance détaillée');for(const [label,value]of playerPdfDetailRows(p.growth))paragraph(`${label} : ${value}`,8);}
 for(const extra of input.extraSections||[]){if(/rpe|charge|wellness|récupération/i.test(extra.title)||!extra.records.length)continue;newPage(extra.title.toLocaleUpperCase('fr'));section(extra.title);for(const record of extra.records){for(const [label,value]of playerPdfDetailRows(record))paragraph(`${label} : ${value}`,8);y+=5;}}
 const seenMatches=new Set<string>();
 const matches=(input.matches||[]).filter(match=>{if(match.present===false)return false;const id=match.matchId||match.match_id;if(!id)return true;const key=`${match.teamId||match.team_id||''}:${id}`;if(seenMatches.has(key))return false;seenMatches.add(key);return true;});
 const columns=[['Date',18],['Équipe',24],['Adversaire',33],['Score',16],['MIN',13],['PTS',10],['2PTS',16],['%',12],['3PTS',16],['%',12],['LF',16],['%',12],['RO',9],['RD',9],['RT',9],['PD',9],['INT',9],['CT',9],['BP',9],['FP',9],['Éval',11],['+/-',11]] as const;
 const tableWidth=265,totalWidth=columns.reduce((n,col)=>n+col[1],0),widths=columns.map(col=>col[1]*tableWidth/totalWidth);
 const finite=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
 const value=(v:unknown)=>finite(v)?String(v):'—';
 const time=(v:unknown)=>{if(!finite(v))return '—';const seconds=Math.round(Number(v)*60);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
 const pct=(made:unknown,attempts:unknown)=>finite(made)&&finite(attempts)&&Number(attempts)>0?`${Math.round(Number(made)/Number(attempts)*100)}%`:'—';
 const pair=(m:Record<string,any>,a:string,b:string)=>`${value(m[a])}/${value(m[b])}`;
 const tableHead=()=>{doc.setFillColor(wine);doc.rect(16,y-5,tableWidth,10,'F');font(7,true,'#ffffff');let x=16;columns.forEach((col,i)=>{doc.text(col[0],x+widths[i]/2,y+1,{align:'center'});x+=widths[i]});y+=12;};
 const statsPage=()=>{doc.addPage('a4','landscape');header('STATISTIQUES PAR MATCH');font(8,false,muted);doc.text(`${matches.length} match(s) joué(s) · Données enregistrées · — : non renseigné`,16,y);y+=10;tableHead();};
 statsPage();
 const tableRow=(values:string[],summary=false,index=0)=>{font(7,summary);const lines=values.map((text,i)=>doc.splitTextToSize(text,widths[i]-3));const height=Math.max(1,...lines.map(line=>line.length))*3.5+4;
  if(y+height>doc.internal.pageSize.getHeight()-24)statsPage();doc.setFillColor(summary?'#eee1e6':index%2?'#ffffff':pale);doc.rect(16,y-4,tableWidth,height,'F');font(7,summary);let x=16;lines.forEach((line,i)=>{doc.text(line,x+widths[i]/2,y,{align:'center'});x+=widths[i]});y+=height;
 };
 if(!matches.length){font(9);doc.text('Aucun match joué lié à cette fiche.',16,y);}
 matches.forEach((m,index)=>tableRow([date(m.date)||'—',m.teamName||m.teamLabel||'—',m.opponent||'—',m.hasScore===false?'—':finite(m.usScore)&&finite(m.themScore)?`${m.usScore}-${m.themScore}`:'—',time(m.minutes),value(m.pts),pair(m,'p2m','p2a'),pct(m.p2m,m.p2a),pair(m,'p3m','p3a'),pct(m.p3m,m.p3a),pair(m,'ftm','fta'),pct(m.ftm,m.fta),value(m.offReb),value(m.defReb),value(m.reb),value(m.ast),value(m.stl),value(m.blk),value(m.turnovers),value(m.pf),value(m.eval),value(m.plusMinus)],false,index));
 if(matches.length){
  const aggregate=(key:string,average=false)=>{const values=matches.map(m=>m[key]).filter(finite).map(Number);return values.length?(values.reduce((a,b)=>a+b,0)/(average?values.length:1)).toFixed(average?1:0):'—';};
  for(const average of [false,true]){const pairTotal=(a:string,b:string)=>`${aggregate(a,average)}/${aggregate(b,average)}`;const percent=(a:string,b:string)=>{const valid=matches.filter(m=>finite(m[a])&&finite(m[b]));return valid.length?pct(valid.reduce((n,m)=>n+Number(m[a]),0),valid.reduce((n,m)=>n+Number(m[b]),0)):'—';};
   tableRow([average?'Moyennes':'Totaux',`${matches.length} MJ`,'','',matches.every(m=>finite(m.minutes))?time(matches.reduce((total,m)=>total+Number(m.minutes),0)/(average?matches.length:1)):'—',aggregate('pts',average),pairTotal('p2m','p2a'),percent('p2m','p2a'),pairTotal('p3m','p3a'),percent('p3m','p3a'),pairTotal('ftm','fta'),percent('ftm','fta'),...['offReb','defReb','reb','ast','stl','blk','turnovers','pf','eval','plusMinus'].map(key=>aggregate(key,average))],true);
  }
  y+=5;font(7,false,muted);if(y<doc.internal.pageSize.getHeight()-25)doc.text('RO / RD / RT : rebonds off. / déf. / total · PD : passes · INT : interceptions · CT : contres · BP : balles perdues · FP : fautes',16,y);
 }
 const count=doc.getNumberOfPages();for(let page=1;page<=count;page++){doc.setPage(page);const pageHeight=doc.internal.pageSize.getHeight(),pageWidth=doc.internal.pageSize.getWidth();rule(pageHeight-16);font(7,false,muted);doc.text(`MyBasket / ${new Date().toLocaleDateString('fr-FR')} / Informations enregistrées`,16,pageHeight-11);doc.text(`${page} / ${count}`,pageWidth-16,pageHeight-11,{align:'right'});}
 return doc;
}

