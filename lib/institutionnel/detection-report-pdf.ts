import {jsPDF} from 'jspdf';
import {imageData} from './trombinoscope-pdf';
export type DayReportResource={id?:string;title:string;note?:string|null;file_url?:string|null};
type Input={pageLabel?:string;institution:{name:string;logo_url?:string|null};event:{id:string;title:string;event_date:string;start_time?:string|null;location?:string|null};eventUrl?:string;selection?:{name:string;category?:string|null;gender?:string|null;season_label?:string|null};resources?:DayReportResource[];participants:Array<{status:string;player?:{first_name:string;last_name:string;club_name?:string|null;photo_url?:string|null;profile_data?:any}}>};
const labels:Record<string,string>={present:'Présent',absent:'Absent',excused:'Excusé',invited:'Invité',confirmed:'Confirmé',selected:'Retenu',waiting:'Attente',not_selected:'Non gardé'};
export function reportResourceUrl(value?:string|null,origin='https://mybasket.vercel.app'){
 if(!value)return null;try{const url=new URL(value,origin);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export async function createDetectionReportPdf(input:Input){
 const doc=new jsPDF({orientation:'portrait',format:'a4',unit:'mm'}),{institution,event,selection,participants}=input,resources=input.resources||[];
 const status=(p:Input['participants'][number])=>p.player?.profile_data?.detectionAttendance?.[event.id]||p.status;
 const decision=(p:Input['participants'][number])=>p.player?.profile_data?.detectionDecisions?.[event.id]??(['selected','waiting','not_selected'].includes(p.status)?p.status:'');
 const [logo,photos,previews]=await Promise.all([imageData(institution.logo_url),Promise.all(participants.map(p=>imageData(p.player?.photo_url))),Promise.all(resources.map(r=>/\.(png|jpe?g|webp)(?:\?|$)/i.test(r.file_url||'')?imageData(r.file_url):Promise.resolve(null)))]);
 const ink='#172039',muted='#717681',wine='#701b32',rule='#d7d8dc';
 const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
 const text=(value:string,x:number,y:number,width:number,size=9,color=ink,bold=false)=>{doc.setFont('times',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);const original=clean(value);let line=original;while(line.length&&doc.getTextWidth(line)>width)line=line.slice(0,-1);if(line!==original){while(line.length&&doc.getTextWidth(line+'...')>width)line=line.slice(0,-1);line+='...';}doc.text(line,x,y);};
 const line=(x:number,y:number,x2:number,y2:number)=>{doc.setDrawColor(rule);doc.setLineWidth(.2);doc.line(x,y,x2,y2);};
 doc.setFillColor('#ffffff');doc.rect(0,0,210,297,'F');
 if(logo){const props=doc.getImageProperties(logo),s=Math.min(17/props.width,22/props.height);doc.addImage(logo,'JPEG',10,10,props.width*s,props.height*s);}
 text(institution.name,logo?31:10,17,105,12,ink,true);
 text('RAPPORT DE JOURNÉE',140,14,60,9,ink,true);
 const date=new Date(`${event.event_date}T12:00:00`);const dateLabel=Number.isNaN(date.getTime())?event.event_date:new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(date).toUpperCase();
 text(dateLabel,140,22,60,10,wine,true);
 text(event.title,10,43,190,23,wine,true);
 const gender=selection?.gender==='F'?'Féminin':selection?.gender==='M'?'Masculin':'Mixte';
 text(selection?`${selection.name} | ${gender} | Saison ${selection.season_label||'à préciser'}`:'Journée libre - groupe non rattaché',10,50,190,10,ink);
 text(`${event.start_time?.slice(0,5)||'Horaire à préciser'} | ${event.location||'Lieu à préciser'}`,10,56,190,9,ink);
 line(10,61,200,61);
 const present=participants.filter(p=>status(p)==='present').length,absent=participants.filter(p=>status(p)==='absent').length,excused=participants.filter(p=>status(p)==='excused').length,pending=participants.length-present-absent-excused,decisionsPending=participants.filter(p=>!['selected','waiting','not_selected'].includes(decision(p))).length;
 const female=selection?.gender==='F';
 const stats:Array<[number,string]>=[[participants.length,female?'CONVOQUÉES':'CONVOQUÉS'],[present,female?'PRÉSENTES':'PRÉSENTS'],[absent,female?'ABSENTES':'ABSENTS'],[excused,female?'EXCUSÉES':'EXCUSÉS'],[pending,'À RENSEIGNER'],[decisionsPending,'DÉCISIONS EN ATTENTE']];
 stats.forEach(([number,label],i)=>{const col=i%3,row=Math.floor(i/3),x=10+col*190/3,cx=x+190/6,y=71+row*18;doc.setFont('times','bold');doc.setFontSize(22);doc.setTextColor(wine);doc.text(String(number),cx,y,{align:'center'});doc.setFontSize(7);doc.setTextColor(ink);doc.text(label,cx,y+5,{align:'center'});if(col<2)line(x+190/3,y-7,x+190/3,y+6);});line(10,99,200,99);
 text('EFFECTIF & SUIVI',10,106,150,13,ink,true);text(`${participants.length} ${female?'joueuses':'joueurs'}`,174,106,26,9,muted);
 const columns=participants.length>32?2:1,gap=6,width=(190-gap*(columns-1))/columns,rows=Math.max(1,Math.ceil(participants.length/columns));
 const resourceHeight=resources.length?Math.min(48,16+Math.ceil(Math.min(resources.length,12)/2)*7):18;
 const bottom=282-resourceHeight,rowHeight=Math.min(10,(bottom-119)/rows),font=Math.max(5.5,Math.min(9,rowHeight*1.12)),portrait=Math.min(7.3,rowHeight-1.5);
 const badge=(label:string,x:number,cy:number,w:number,color:string)=>{doc.setFillColor(color==='#287453'?'#e9f3ec':'#eff0f2');const h=Math.min(5.8,rowHeight-.5);doc.roundedRect(x,cy-h/2,w,h,h/2,h/2,'F');doc.setFont('times','normal');doc.setFontSize(Math.max(5.5,font-.8));while(doc.getTextWidth(label)>w-2&&doc.getFontSize()>5)doc.setFontSize(doc.getFontSize()-.3);doc.setTextColor(color);doc.text(label,x+w/2,cy+1,{align:'center'});};
 for(let col=0;col<columns;col++){
  const x=10+col*(width+gap);if(col)line(x-gap/2,110,x-gap/2,bottom);
  doc.setFillColor('#eff0f2');doc.rect(x,110,width,7,'F');text(female?'JOUEUSE / CLUB':'JOUEUR / CLUB',x+2,114.6,width*.55,7,ink,true);text('PRÉSENCE',x+width*.57,114.6,width*.22,6.8,ink,true);text('DÉCISION',x+width*.81,114.6,width*.19-1,6.8,ink,true);
  participants.slice(col*rows,(col+1)*rows).forEach((p,index)=>{const i=col*rows+index,y=119+index*rowHeight,player=p.player,cx=x+portrait/2+1,cy=y+rowHeight/2;
   doc.setFillColor('#aa5368');doc.circle(cx,cy,portrait/2,'F');
   if(photos[i]){const props=doc.getImageProperties(photos[i]!),scale=portrait/Math.min(props.width,props.height);doc.saveGraphicsState();doc.circle(cx,cy,portrait/2,null);doc.clip();doc.discardPath();doc.addImage(photos[i]!,'JPEG',cx-props.width*scale/2,cy-props.height*scale/2,props.width*scale,props.height*scale);doc.restoreGraphicsState();}
   else{doc.setFont('times','bold');doc.setFontSize(Math.min(font,7));doc.setTextColor('#ffffff');doc.text(`${player?.first_name?.[0]||''}${player?.last_name?.[0]||''}`.toUpperCase(),cx,cy+.9,{align:'center'});}
   const name=player?`${player.first_name} ${player.last_name}`:'Fiche indisponible',nameX=x+portrait+3,nameWidth=width*.56-(portrait+3);
   doc.setFont('times','bold');doc.setFontSize(font);doc.setTextColor(ink);
   const nameLines:string[]=doc.splitTextToSize(clean(name),nameWidth);const wrap=nameLines.length>1&&rowHeight>=9;
   if(wrap){doc.setFontSize(font-.6);doc.text(nameLines.slice(0,2),nameX,y+2.6,{lineHeightFactor:.95});}
   else text(name,nameX,y+rowHeight*.45,nameWidth,font,ink,true);
   text(player?.club_name||'Club non renseigné',nameX,y+rowHeight*.85,nameWidth,Math.max(5.3,font-1.5),muted);
   const attendance=status(p),presence=['present','absent','excused'].includes(attendance)?labels[attendance]:'À renseigner';
   badge(presence,x+width*.56,cy,width*.235,attendance==='present'?'#287453':muted);badge(labels[decision(p)]||'À décider',x+width*.805,cy,width*.19,decision(p)==='selected'?'#287453':muted);line(x,y+rowHeight,x+width,y+rowHeight);
  });
 }
 if(!participants.length)text('Aucun participant dans cette journée.',12,122,185,10,muted);
 const sy=287-resourceHeight;doc.setDrawColor('#dfd4cd');doc.line(10,sy-3,200,sy-3);
 text('SÉANCE & DOCUMENTS ASSOCIÉS',10,sy+1,190,11,ink,true);
 if(!resources.length)text('Aucune séance ni pièce jointe rattachée à cette journée.',10,sy+7,190,8,muted);
 else resources.slice(0,12).forEach((resource,i)=>{const col=i%2,row=Math.floor(i/2),x=10+col*97,y=sy+6+row*7,preview=previews[i],tx=x+(preview?12:0),url=reportResourceUrl(resource.file_url)||reportResourceUrl(input.eventUrl);
  if(preview){const p=doc.getImageProperties(preview),s=Math.min(10/p.width,6/p.height);doc.addImage(preview,'JPEG',x,y-2,p.width*s,p.height*s);}
  text(resource.title,tx,y,88-(tx-x),7,wine,true);if(url)doc.link(tx,y-3,88-(tx-x),4,{url});
  if(resource.note)text(resource.note,tx,y+3.2,88-(tx-x),6.1,muted);
 });
 if(resources.length>12){const url=reportResourceUrl(input.eventUrl);text(`+ ${resources.length-12} autres documents sur la journée`,10,283,190,6.5,wine);if(url)doc.link(10,280,190,4,{url});}
 text('MyBasket  |  Rapport de journée',10,292,170,7,muted);text(input.pageLabel||'1 / 1',190,292,10,7,muted);
 return doc;
}
