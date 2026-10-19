import {jsPDF} from 'jspdf';
import {imageData} from './trombinoscope-pdf';
export type DayReportResource={id?:string;title:string;note?:string|null;file_url?:string|null};
type Input={institution:{name:string;logo_url?:string|null};event:{id:string;title:string;event_date:string;start_time?:string|null;location?:string|null};eventUrl?:string;selection?:{name:string;category?:string|null;gender?:string|null;season_label?:string|null};resources?:DayReportResource[];participants:Array<{status:string;player?:{first_name:string;last_name:string;club_name?:string|null;photo_url?:string|null;profile_data?:any}}>};
const labels:Record<string,string>={present:'Présent',absent:'Absent',excused:'Excusé',invited:'Invité',confirmed:'Confirmé',selected:'Retenu',waiting:'Attente',not_selected:'Non retenu'};
export function reportResourceUrl(value?:string|null,origin='https://mybasket.vercel.app'){
 if(!value)return null;try{const url=new URL(value,origin);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export async function createDetectionReportPdf(input:Input){
 const doc=new jsPDF({orientation:'landscape',format:'a4',unit:'mm'}),{institution,event,selection,participants}=input,resources=input.resources||[];
 const status=(p:Input['participants'][number])=>p.player?.profile_data?.detectionAttendance?.[event.id]||p.status;
 const decision=(p:Input['participants'][number])=>p.player?.profile_data?.detectionDecisions?.[event.id]??(['selected','waiting','not_selected'].includes(p.status)?p.status:'');
 const [logo,photos,previews]=await Promise.all([imageData(institution.logo_url),Promise.all(participants.map(p=>imageData(p.player?.photo_url))),Promise.all(resources.map(r=>/\.(png|jpe?g|webp)(?:\?|$)/i.test(r.file_url||'')?imageData(r.file_url):Promise.resolve(null)))]);
 const ink='#382c30',muted='#8b7972',wine='#6b1a2c';
 const text=(value:string,x:number,y:number,width:number,size=9,color=ink,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);let line=value.replace(/\s+/g,' ').trim();while(line.length&&doc.getTextWidth(line)>width)line=line.slice(0,-1);if(line!==value.replace(/\s+/g,' ').trim())line=line.slice(0,-2)+'…';doc.text(line,x,y);};
 doc.setFillColor('#faf7f4');doc.rect(0,0,297,210,'F');doc.setFillColor(wine);doc.rect(0,0,297,3,'F');
 let titleX=10;if(logo){const props=doc.getImageProperties(logo),s=Math.min(23/props.width,18/props.height);doc.addImage(logo,'JPEG',10,9,props.width*s,props.height*s);titleX=38;}
 text(institution.name,titleX,14,230,10,wine,true);text(event.title,titleX,23,245,17,wine,true);
 text(`${event.event_date.split('-').reverse().join('/')}  |  ${event.start_time?.slice(0,5)||'Horaire à préciser'}  |  ${event.location||'Lieu à préciser'}`,10,33,277,9,muted);
 text(selection?`${selection.name}  |  ${selection.category||''}  |  ${selection.gender==='F'?'Féminin':selection.gender==='M'?'Masculin':'Mixte'}  |  ${selection.season_label||''}`:'Journée libre - groupe non rattaché',10,39,277,8,muted);
 const present=participants.filter(p=>status(p)==='present').length,absent=participants.filter(p=>status(p)==='absent').length,excused=participants.filter(p=>status(p)==='excused').length,retained=participants.filter(p=>decision(p)==='selected').length,pending=participants.length-present-absent-excused;
 const stats:[[number,string],...Array<[number,string]>]=[[participants.length,'CONVOQUÉS'],[present,'PRÉSENTS'],[absent,'ABSENTS'],[excused,'EXCUSÉS'],[retained,'RETENUS'],[pending,'À RENSEIGNER']];
 stats.forEach(([number,label],i)=>{const x=10+i*46.5;doc.setFillColor('#ffffff');doc.roundedRect(x,44,44.5,18,2,2,'F');text(String(number),x+3,53,36,16,wine,true);text(label,x+3,59,39,6.5,muted,true);});
 // Keep every participant on this single A4 sheet; increase columns for larger groups.
 const columns=participants.length>48?3:participants.length>20?2:1,gap=5,width=(277-gap*(columns-1))/columns,rows=Math.max(1,Math.ceil(participants.length/columns));
 const resourceHeight=resources.length?Math.min(48,16+Math.ceil(Math.min(resources.length,12)/3)*7):12;
 const bottom=196-resourceHeight,rowHeight=Math.min(7.6,(bottom-76)/rows),font=Math.max(5.5,Math.min(8.3,rowHeight*1.22)),portrait=Math.min(5.5,rowHeight-1);
 for(let col=0;col<columns;col++){
  const x=10+col*(width+gap);doc.setFillColor(wine);doc.roundedRect(x,67,width,7,1,1,'F');text('JOUEUR / CLUB',x+8,71.7,width*.60-8,7,'#ffffff',true);text('PRÉSENCE',x+width*.61,71.7,width*.20,6.5,'#ffffff',true);text('DÉCISION',x+width*.82,71.7,width*.18-1,6.5,'#ffffff',true);
  participants.slice(col*rows,(col+1)*rows).forEach((p,index)=>{const i=col*rows+index,y=76+index*rowHeight,player=p.player,cx=x+portrait/2+1,cy=y+rowHeight/2;
   doc.setFillColor(index%2?'#ffffff':'#f1ebe6');doc.rect(x,y,width,rowHeight,'F');doc.setFillColor('#e3d7d1');doc.circle(cx,cy,portrait/2,'F');
   if(photos[i]){const props=doc.getImageProperties(photos[i]!),scale=portrait/Math.min(props.width,props.height);doc.saveGraphicsState();doc.circle(cx,cy,portrait/2,null);doc.clip();doc.discardPath();doc.addImage(photos[i]!,'JPEG',cx-props.width*scale/2,cy-props.height*scale/2,props.width*scale,props.height*scale);doc.restoreGraphicsState();}
   else text(`${player?.first_name?.[0]||''}${player?.last_name?.[0]||''}`,x+1.2,cy+.8,portrait,Math.min(font,6),wine,true);
   const name=player?`${player.last_name} ${player.first_name}`:'Fiche indisponible',nameX=x+portrait+3;
   text(name,nameX,y+rowHeight*.47,width*.60-(portrait+3),font,ink,true);text(player?.club_name||'Club non renseigné',nameX,y+rowHeight*.85,width*.60-(portrait+3),Math.max(5.3,font-1.3),muted);
   text(labels[status(p)]||'À saisir',x+width*.61,cy+1,width*.20-1,font-0.3,status(p)==='present'?'#287453':muted);text(labels[decision(p)]||'À décider',x+width*.82,cy+1,width*.18-1,font-0.3,decision(p)==='selected'?'#287453':muted);
  });
 }
 if(!participants.length)text('Aucun participant dans cette journée.',12,84,265,10,muted);
 const sy=201-resourceHeight;doc.setDrawColor('#dfd4cd');doc.line(10,sy-3,287,sy-3);
 text('SÉANCE & DOCUMENTS LIÉS',10,sy+1,200,8,wine,true);
 if(!resources.length)text('Aucun contenu rattaché à cette journée.',10,sy+7,277,8,muted);
 else resources.slice(0,12).forEach((resource,i)=>{const col=i%3,row=Math.floor(i/3),x=10+col*93,y=sy+6+row*7,preview=previews[i],tx=x+(preview?12:0),url=reportResourceUrl(resource.file_url)||reportResourceUrl(input.eventUrl);
  if(preview){const p=doc.getImageProperties(preview),s=Math.min(10/p.width,6/p.height);doc.addImage(preview,'JPEG',x,y-2,p.width*s,p.height*s);}
  text(resource.title,tx,y,88-(tx-x),7,wine,true);if(url)doc.link(tx,y-3,88-(tx-x),4,{url});
  if(resource.note)text(resource.note,tx,y+3.2,88-(tx-x),6.1,muted);
 });
 if(resources.length>12){const url=reportResourceUrl(input.eventUrl);text(`+ ${resources.length-12} autres documents sur la journée`,10,197,277,6.5,wine);if(url)doc.link(10,194,200,4,{url});}
 text('MyBasket  |  Rapport de journée',10,205,200,7,muted);text('1 / 1',278,205,10,7,muted);
 return doc;
}
