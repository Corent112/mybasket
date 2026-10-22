import {PDFDocument} from 'pdf-lib';
import {imageData} from './trombinoscope-pdf';
import {sessionPdfUrl} from './session-pdf-download';
export type ReportAttachment={title:string;file_url?:string|null};
export function reportAttachmentKind(resource:ReportAttachment,origin='https://mybasket.vercel.app'):'session'|'pdf'|'image'|null{
 if(!resource.file_url)return null;
 try{const url=new URL(resource.file_url,origin);if(!['https:','http:'].includes(url.protocol))return null;
  if(url.origin===new URL(origin).origin&&/^\/seances\/[^/]+$/.test(url.pathname))return 'session';
  if(/\.pdf$/i.test(url.pathname)||/\.pdf$/i.test(resource.title))return 'pdf';
  if(/\.(png|jpe?g|webp)$/i.test(url.pathname)||/\.(png|jpe?g|webp)$/i.test(resource.title))return 'image';
 }catch{}return null;
}
/** Keep the report first and append the actual linked PDFs/images in resource order. */
export async function appendDayReportAttachments(report:ArrayBuffer,resources:ReportAttachment[],options:{origin?:string;request?:typeof fetch;sessionUrl?:(id:string)=>Promise<string>}={}){
 const origin=options.origin||'https://mybasket.vercel.app',request=options.request||fetch,resolveSession=options.sessionUrl||sessionPdfUrl;
 const result=await PDFDocument.load(report),seen=new Set<string>();
 for(const resource of resources){const kind=reportAttachmentKind(resource,origin);if(!kind)continue;
  const source=new URL(resource.file_url!,origin);source.hash='';if(seen.has(source.href))continue;seen.add(source.href);
  try{
   if(kind==='image'){
    const data=await imageData(source.href);if(!data)throw Error('image inaccessible');
    const image=await result.embedJpg(data),landscape=image.width>image.height,page=result.addPage(landscape?[841.89,595.28]:[595.28,841.89]),size=page.getSize(),scale=Math.min((size.width-48)/image.width,(size.height-48)/image.height);
    page.drawImage(image,{x:(size.width-image.width*scale)/2,y:(size.height-image.height*scale)/2,width:image.width*scale,height:image.height*scale});
   }else{
    const url=kind==='session'?await resolveSession(decodeURIComponent(source.pathname.split('/').pop()!)):source.href;
    const response=await request(url,{cache:'no-store'});if(!response.ok)throw Error('fichier inaccessible');
    const attachment=await PDFDocument.load(await response.arrayBuffer());
    for(const page of await result.copyPages(attachment,attachment.getPageIndices()))result.addPage(page);
   }
  }catch(error){throw Error(`La séance / pièce jointe « ${resource.title} » n’a pas pu être intégrée : ${error instanceof Error?error.message:'fichier illisible'}. Réessaie ou vérifie le document lié à cette journée.`);}
 }
 return result.save();
}
export async function downloadCombinedDayReport(report:{output:(type:'arraybuffer')=>ArrayBuffer;save:(filename:string)=>unknown},resources:ReportAttachment[],filename:string){
 const origin=window.location.origin;
 if(!resources.some(resource=>reportAttachmentKind(resource,origin))){report.save(filename);return;}
 const bytes=await appendDayReportAttachments(report.output('arraybuffer'),resources,{origin}),buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
