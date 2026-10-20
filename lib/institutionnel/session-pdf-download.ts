export async function sessionPdfUrl(sessionId:string,request:typeof fetch=fetch):Promise<string>{
 const response=await request(`/api/seances/${encodeURIComponent(sessionId)}/pdf`,{method:'POST'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.pdfUrl)throw Error(result.error||'La génération PDF a échoué. La séance reste enregistrée.');
 if(!/^(https?:\/\/|\/)/i.test(String(result.pdfUrl)))throw Error('Lien PDF invalide');
 return String(result.pdfUrl);
}
export async function downloadSessionPdf(sessionId:string,title='fiche-seance'){
 const url=await sessionPdfUrl(sessionId),response=await fetch(url);if(!response.ok)throw Error('PDF généré, mais téléchargement indisponible. Réessaie.');
 const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),link=document.createElement('a');link.href=objectUrl;link.download=`${title.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100)||'fiche-seance'}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),10000);return url;
}
