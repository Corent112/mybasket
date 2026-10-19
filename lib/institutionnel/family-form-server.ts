import { createHmac, timingSafeEqual } from 'node:crypto';
import { familyGroup, type FamilyGroup } from './family-form';
type Claim={purpose:'institution-family'|'institution-family-player';structureId:string;group:FamilyGroup;exp:number;playerId?:string};
function secret(){const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Service indisponible');return key;}
function signature(value:string){return createHmac('sha256',secret()).update(`mybasket-family-v1:${value}`).digest('base64url');}
export function signFamilyClaim(claim:Claim):string { const value=Buffer.from(JSON.stringify(claim)).toString('base64url');return `${value}.${signature(value)}`; }
export function readFamilyClaim(token:string,purpose:Claim['purpose']):Claim|null {
  try {
    if(token.length>2000)return null;const [value,sig,...rest]=token.split('.');if(!value||!sig||rest.length)return null;
    const expected=Buffer.from(signature(value)),actual=Buffer.from(sig);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const c=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(c.purpose!==purpose||!familyGroup(c.group)||typeof c.structureId!=='string'||!Number.isFinite(c.exp)||c.exp<=Date.now())return null;
    if(purpose==='institution-family-player'&&typeof c.playerId!=='string')return null;
    return c;
  } catch {return null;}
}
