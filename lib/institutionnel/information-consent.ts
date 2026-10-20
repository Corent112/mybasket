export const INFORMATION_CONSENT_VERSION='2026-10-20';
export function informationConsentText(structureName:string){
 return `J’accepte que les informations renseignées dans ce questionnaire soient collectées, enregistrées et utilisées par ${structureName.trim()||'la structure organisatrice'} dans le cadre de ses activités professionnelles, notamment pour assurer le suivi, la gestion et la communication liés aux actions auxquelles je participe.`;
}
export function informationConsentReceipt(structureName:string,structureId:string,acceptedAt=new Date().toISOString()){
 return {accepted:true,acceptedAt,structureId,structureName,text:informationConsentText(structureName),version:INFORMATION_CONSENT_VERSION};
}
