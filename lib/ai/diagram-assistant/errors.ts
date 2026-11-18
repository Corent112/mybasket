export type DiagramStage='inventory'|'paths'|'repair';
export type DiagramErrorCode='provider_auth'|'provider_model'|'provider_quota'|'provider_rate'|'provider_unavailable'|'timeout'|'cancelled'|'invalid_json'|'no_players'|'invalid_geometry'|'too_dense'|'incomplete_response'|'output_limit'|'refusal'|'unknown';
const MESSAGES:Record<DiagramErrorCode,string>={
 provider_auth:'Le service IA refuse l’accès. La configuration serveur doit être vérifiée.',
 provider_model:'Le modèle IA configuré est indisponible pour ce compte.',
 provider_quota:'Le quota du service IA est épuisé. La facturation ou les limites du compte doivent être vérifiées.',
 provider_rate:'Le service IA reçoit trop de demandes. Réessaie dans un instant.',
 provider_unavailable:'Le service IA est temporairement indisponible.',
 timeout:'Le service IA n’a pas répondu dans le délai prévu.',
 cancelled:'La lecture IA a été interrompue.',
 invalid_json:'La réponse IA ne respecte pas le format de lecture attendu.',
 no_players:'La réponse IA n’a fourni aucun joueur avec une position exploitable.',
 invalid_geometry:'La réponse IA ne fournit pas des repères géométriques exploitables.',
 too_dense:'La réponse contient trop d’éléments pour une seule phase.',
 output_limit:'La réponse IA a atteint sa limite de génération avant de fournir le schéma complet.',
 incomplete_response:'La réponse IA a été interrompue avant sa fin.',
 refusal:'Le service IA n’a pas fourni de lecture pour cette image.',
 unknown:'Une erreur du lecteur IA doit être examinée dans le journal de diagnostic.',
};
export type DiagramDiagnostic={code:DiagramErrorCode;stage:DiagramStage;message:string;retryable:boolean;providerStatus?:number;providerRequestId?:string};
export class DiagramReadError extends Error{
 readonly code:DiagramErrorCode;readonly stage:DiagramStage;readonly providerStatus?:number;readonly providerRequestId?:string;
 constructor(code:DiagramErrorCode,stage:DiagramStage,status?:number,requestId?:string){
  super(MESSAGES[code]);this.name='DiagramReadError';this.code=code;this.stage=stage;this.providerStatus=status;
  this.providerRequestId=requestId&&/^[A-Za-z0-9_-]{1,100}$/.test(requestId)?requestId:undefined;
 }
}
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
/** Never return provider messages: they may contain a credential fragment, prompt or image contents. */
export function diagramReadError(value:unknown,stage:DiagramStage):DiagramReadError{
 if(value instanceof DiagramReadError)return value;
 const error=record(value),detail=record(error.error),status=typeof error.status==='number'?error.status:undefined;
 const code=String(error.code??detail.code??''),name=String(error.name??'');
 let category:DiagramErrorCode='unknown';
 if(status===401||status===403||code==='invalid_api_key')category='provider_auth';
 else if(code==='model_not_found'||status===404)category='provider_model';
 else if(code==='insufficient_quota'||code==='billing_hard_limit_reached')category='provider_quota';
 else if(status===429)category='provider_rate';
 else if(name==='APIConnectionTimeoutError'||name==='TimeoutError'||code==='ETIMEDOUT')category='timeout';
 else if(name==='AbortError'||name==='APIUserAbortError')category='cancelled';
 else if(status&&status>=500||name==='APIConnectionError')category='provider_unavailable';
 const id=error.request_id??error.requestID;
 return new DiagramReadError(category,stage,status,typeof id==='string'?id:undefined);
}
export function diagramDiagnostic(value:unknown,stage:DiagramStage):DiagramDiagnostic{
 const error=diagramReadError(value,stage);
 return{code:error.code,stage:error.stage,message:error.message,retryable:['timeout','provider_rate','provider_unavailable','cancelled'].includes(error.code),
  ...(error.providerStatus?{providerStatus:error.providerStatus}:{}),...(error.providerRequestId?{providerRequestId:error.providerRequestId}:{})};
}
