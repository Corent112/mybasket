import { jsPDF } from 'jspdf';

type Player = { id?:string; first_name?:string; last_name?:string; club_name?:string; category?:string; photo_url?:string|null; license_number?:string|null; jersey_number?:string|null; birthdate?:string|null; height_cm?:number|null; position_primary?:string|null; profile_data?:Record<string,any> };
export type TrombinoscopeOptions={includeLicense?:boolean;jerseyMode?:'edit'|'blank'|'none';includeCategory?:boolean;includeBirthdate?:boolean;includeHeight?:boolean;includePosition?:boolean};
export function trombinoscopeDetails(p:Player,options:TrombinoscopeOptions={}):Array<[string,string]>{const profile=p.profile_data||{},rows:Array<[string,string]>=[];
 if(options.includeLicense)rows.push(['Licence',String(p.license_number||profile.licenseNumber||'Non renseignée')]);
 if(options.jerseyMode==='blank')rows.push(['Maillot','________________']);else if(options.jerseyMode==='edit')rows.push(['Maillot',String(p.jersey_number??profile.jerseyNumber??'').trim()||'________________']);
 if(options.includeCategory)rows.push(['Catégorie',p.category||'Non renseignée']);
 if(options.includeBirthdate)rows.push(['Naissance',p.birthdate?p.birthdate.slice(0,10).split('-').reverse().join('/'):'Non renseignée']);
 if(options.includeHeight)rows.push(['Taille',p.height_cm!=null?p.height_cm+' cm':'Non renseignée']);
 if(options.includePosition)rows.push(['Poste',p.position_primary||profile.position||'Non renseigné']);return rows;}
type Institution = { name:string; logo_url?:string|null; email?:string|null };

export async function imageData(url?:string|null):Promise<string|null>{
 if(!url)return null;
 return new Promise(resolve=>{
  const image=new Image(); image.crossOrigin='anonymous';
  const timer=setTimeout(()=>resolve(null),8000);
  image.onload=()=>{clearTimeout(timer);try{
   const canvas=document.createElement('canvas');
   const scale=Math.min(1,600/Math.max(image.naturalWidth,image.naturalHeight));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)return resolve(null);
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   resolve(canvas.toDataURL('image/jpeg',.85));
  }catch{resolve(null)}};
  image.onerror=()=>{clearTimeout(timer);resolve(null)}; image.src=url;
 });
}

/** Each selected player is kept, including those without an accessible photo. */
export async function createTrombinoscopePdf(players:Player[],institution:Institution,options:TrombinoscopeOptions={}){
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const logo=await imageData(institution.logo_url);
 const pages=Math.max(1,Math.ceil(players.length/10));
 for(let page=0;page<pages;page++){
  if(page)doc.addPage();
  doc.setTextColor('#172B54');doc.setFont('helvetica','bold');doc.setFontSize(17);
  let headingX=10;
  if(logo){const size=doc.getImageProperties(logo);const scale=Math.min(28/size.width,18/size.height);doc.addImage(logo,'JPEG',10,9,size.width*scale,size.height*scale);headingX=42}
  doc.text(institution.name||'Institution',headingX,16);
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Trombinoscope',headingX,23);
  doc.text(`${players.length} personne(s)`,287,20,{align:'right'});
  doc.setDrawColor('#172B54');doc.line(10,30,287,30);
  const batch=players.slice(page*10,page*10+10);
  const photos=await Promise.all(batch.map(p=>imageData(p.photo_url)));
  batch.forEach((p,i)=>{
   const details=trombinoscopeDetails(p,options);
   const x=10+(i%5)*56.4,y=36+Math.floor(i/5)*80,w=51.4,h=details.length?Math.max(22,44-details.length*3.6):44;
   doc.setFillColor('#EEF1F5');doc.roundedRect(x,y,w,h,2,2,'F');
   if(photos[i]){const size=doc.getImageProperties(photos[i]!);const s=Math.min(w/size.width,h/size.height);doc.addImage(photos[i]!,'JPEG',x+(w-size.width*s)/2,y+(h-size.height*s)/2,size.width*s,size.height*s)}
   else{doc.setTextColor('#728097');doc.setFontSize(9);doc.text('Photo manquante',x+w/2,y+h/2,{align:'center'})}
   doc.setTextColor('#172B54');doc.setFont('helvetica','bold');doc.setFontSize(10);
   doc.text(doc.splitTextToSize((p.last_name||'').toUpperCase(),w).slice(0,2),x+w/2,y+h+5,{align:'center'});
   doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(doc.splitTextToSize(p.first_name||'',w).slice(0,1),x+w/2,y+h+14,{align:'center'});
   doc.setTextColor('#657389');doc.setFontSize(8);doc.text(doc.splitTextToSize(p.club_name||'Club non renseigné',w).slice(0,2),x+w/2,y+h+19,{align:'center'});
   details.forEach(([label,value],index)=>{doc.setFontSize(7.5);const text=label+' : '+value;let line=text;while(doc.getTextWidth(line)>w&&line.length)line=line.slice(0,-1);if(line!==text)line=line.slice(0,-3)+'...';const detailY=y+h+28+index*3.6;if(label==='Maillot'&&value==='________________'){doc.text('Maillot :',x+w/2-2,detailY,{align:'right'});doc.setDrawColor('#657389');doc.rect(x+w/2,detailY-2.6,15,3.4);}else doc.text(line,x+w/2,detailY,{align:'center'});});
  });
  doc.setDrawColor('#DCE2EA');doc.line(10,198,287,198);doc.setFontSize(8);doc.setTextColor('#657389');
  doc.text(institution.email||institution.name||'',10,203);doc.text(`${page+1} / ${pages}`,287,203,{align:'right'});
 }
 return doc;
}
