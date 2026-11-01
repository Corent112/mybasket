import {NextResponse} from 'next/server';
// Legacy capture endpoint never grants access from browser query parameters.
export async function GET(){return NextResponse.json({error:'Ce parcours PayPal a été remplacé. Reviens au panier pour payer via la page sécurisée.'},{status:410});}
