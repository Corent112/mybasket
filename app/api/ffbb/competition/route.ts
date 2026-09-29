import { NextRequest, NextResponse } from "next/server";

type TeamChoice={name:string;url:string};
type Game={sourceKey:string;round:string;date:string;time:string;homeAway:"home"|"away"|"unknown";homeTeam:string;awayTeam:string;opponent:string;ourScore:number|null;opponentScore:number|null};
const MONTHS:Record<string,string>={janv:"01",févr:"02",mars:"03",avr:"04",mai:"05",juin:"06",juil:"07",août:"08",sept:"09",oct:"10",nov:"11",déc:"12"};
function text(html:string){return html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/^#{1,6}\s+/gm," ").replace(/[|*_`]+/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim()}
function abs(href:string){return new URL(href,"https://competitions.ffbb.com").toString()}
function teamChoices(html:string):TeamChoice[]{const out=new Map<string,TeamChoice>();const re=/<a[^>]+href=["']([^"']*\/equipes\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))){const name=text(m[2]);if(name&&name.length<120)out.set(abs(m[1]),{name,url:abs(m[1])})}return [...out.values()]}
function isoDate(raw:string){const m=raw.toLowerCase().match(/(\d{1,2})\s+([a-zéû\.]+)(?:\s+(\d{4}))?/i);if(!m)return raw;const key=Object.keys(MONTHS).find(k=>m[2].startsWith(k));if(!key)return raw;const y=m[3]||String(new Date().getFullYear());return `${y}-${MONTHS[key]}-${m[1].padStart(2,"0")}`}

function parseScoreTail(raw:string){
  const cleaned=raw.replace(/\u00a0/g," ").replace(/\s+/g," ").trim();

  // Score avec séparateur explicite.
  const separated=cleaned.match(/^(.*?)\s*(\d{1,3})\s*[-–—:]\s*(\d{1,3})\s*$/);
  if(separated){
    const a=Number(separated[2]),b=Number(separated[3]);
    if((a===0&&b===0)||!Number.isFinite(a)||!Number.isFinite(b)) return {opponent:separated[1].trim(),a:null as number|null,b:null as number|null};
    return {opponent:separated[1].trim(),a,b};
  }

  // FFBB colle actuellement souvent les deux scores au nom :
  // "BASKET CLUB LIEVINOIS6485" => adversaire + 64 / 85.
  // On cherche d'abord 3+3, 3+2, 2+3 puis 2+2 pour éviter de découper
  // arbitrairement des chiffres appartenant au nom de l'équipe.
  const compactPatterns=[
    /^(.*\D)(\d{3})(\d{3})$/,
    /^(.*\D)(\d{3})(\d{2})$/,
    /^(.*\D)(\d{2})(\d{3})$/,
    /^(.*\D)(\d{2})(\d{2})$/,
  ];
  for(const pattern of compactPatterns){
    const m=cleaned.match(pattern);
    if(!m)continue;
    const a=Number(m[2]),b=Number(m[3]);
    if(a>200||b>200)continue;
    if(a===0&&b===0)return {opponent:m[1].trim(),a:null as number|null,b:null as number|null};
    return {opponent:m[1].trim(),a,b};
  }

  const spaced=cleaned.match(/^(.*?)\s+(\d{1,3})\s+(\d{1,3})\s*$/);
  if(spaced){
    const a=Number(spaced[2]),b=Number(spaced[3]);
    if((a===0&&b===0)||!Number.isFinite(a)||!Number.isFinite(b))return {opponent:spaced[1].trim(),a:null as number|null,b:null as number|null};
    return {opponent:spaced[1].trim(),a,b};
  }
  return {opponent:cleaned.replace(/\s+(?:0\s*[-–—:]?\s*0|00)\s*$/,"").trim(),a:null as number|null,b:null as number|null};
}

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase()}
function teamNameMatches(cell:string,wanted:string){const n=norm(cell);return n===wanted||(wanted.length>5&&n.includes(wanted))||(n.length>5&&wanted.includes(n))}
function parseRankingFromHtml(html:string,teamName:string){
  const wanted=norm(teamName);if(!wanted)return null;
  const rows=html.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  for(let i=0;i<rows.length;i++){
    const cells=Array.from(rows[i].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(m=>text(m[1]));
    if(!cells.some(c=>teamNameMatches(c,wanted)))continue;
    for(const c of cells){
      const m=c.match(/^\s*(\d{1,2})\s*(?:er|e|eme|ème)?\s*$/i);
      if(m){const rank=Number(m[1]);if(rank>=1&&rank<=30)return rank}
    }
    // Sur certaines versions FFBB, le rang est hors cellule mais dans la ligne.
    const rowText=text(rows[i]);
    const before=rowText.slice(0,Math.max(0,norm(rowText).indexOf(wanted)));
    const nums=before.match(/\b(\d{1,2})\b/g);
    if(nums?.length){const rank=Number(nums[nums.length-1]);if(rank>=1&&rank<=30)return rank}
  }
  return null;
}
function parseRanking(raw:string,teamName:string){
  const wanted=norm(teamName),all=norm(raw);if(!wanted)return null;
  const idx=all.indexOf(wanted);if(idx<0)return null;
  const before=all.slice(Math.max(0,idx-30),idx);
  const nums=before.match(/\b(\d{1,2})\b/g);
  if(nums?.length){const rank=Number(nums[nums.length-1]);if(rank>=1&&rank<=30)return rank}
  return null;
}
function parseStandingsFromHtml(html:string,teamName:string){
  const wanted=norm(teamName);
  if(!wanted)return null;

  const tables=html.match(/<table\b[\s\S]*?<\/table>/gi)||[];
  for(const table of tables){
    const rows=table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
    const headerRow=rows.find(row=>/<th\b/i.test(row));
    const headers=headerRow
      ? Array.from(headerRow.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(m=>norm(text(m[1])))
      : [];

    for(const row of rows){
      const cells=Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(m=>text(m[1]));
      if(!cells.some(c=>teamNameMatches(c,wanted)))continue;

      const numeric=(value:string)=>{const m=value.replace(/\s/g,'').match(/^-?\d+$/);return m?Number(m[0]):null};
      const byHeader=(aliases:string[])=>{
        const idx=headers.findIndex(h=>aliases.includes(h));
        return idx>=0&&idx<cells.length?numeric(cells[idx]):null;
      };

      let rank=byHeader(['cl','class','classement','rang','position']);
      if(rank===null){
        for(const c of cells){const m=c.match(/^\s*(\d{1,2})\s*(?:er|e|eme|ème)?\s*$/i);if(m){rank=Number(m[1]);break}}
      }

      const played=byHeader(['j','mj','joue','joues','matchs','matchs joues']);
      const wins=byHeader(['g','v','victoire','victoires','gagnes']);
      const losses=byHeader(['p','d','defaite','defaites','perdus']);
      const pointsFor=byHeader(['pm','pf','points marques','pts marques']);
      const pointsAgainst=byHeader(['pe','pa','points encaisses','pts encaisses']);

      return {
        rank:rank!==null&&rank>=1&&rank<=30?rank:null,
        played:played!==null&&played>=0?played:null,
        wins:wins!==null&&wins>=0?wins:null,
        losses:losses!==null&&losses>=0?losses:null,
        pointsFor:pointsFor!==null&&pointsFor>=0?pointsFor:null,
        pointsAgainst:pointsAgainst!==null&&pointsAgainst>=0?pointsAgainst:null,
      };
    }
  }

  const rank=parseRankingFromHtml(html,teamName);
  return rank?{rank,played:null,wins:null,losses:null,pointsFor:null,pointsAgainst:null}:null;
}

function parseTeamPage(html:string,url:string,standingsHtml:string=html,teamNameOverride:string=""){
  const t=text(html);
  const h1=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"");
  const team=teamNameOverride.trim()||h1||(t.match(/#\s*([^#]{2,80}?)\s+(?:NATIONALE|REGIONALE|RÉGIONALE|DEPARTEMENTALE|DÉPARTEMENTALE|PRÉ|PRE|U\d|Calendrier)/i)?.[1]||"Équipe FFBB").trim();
  const competition=(t.match(/((?:NATIONALE|REGIONALE|RÉGIONALE|DEPARTEMENTALE|DÉPARTEMENTALE|PRÉ|PRE)[^|]{2,100})\s+FEDE/i)?.[1]||t.match(/\|\s*([A-Z0-9 -]{2,35})\s*\|\s*Poule/i)?.[1]||"Compétition FFBB").trim();
  const pool=t.match(/Poule\s+([A-Z0-9-]+)/i)?.[1]||text(standingsHtml).match(/Poule\s+([A-Z0-9-]+)/i)?.[1]||"";
  const phase=new URL(url).searchParams.get("phase")||"";
  const matches:Game[]=[];

  const re=/#(\d+)\s+(J\d+)?\s*(\d{1,2}\s+(?:janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?)(?:\s+\d{4})?)\s+(\d{1,2}h\d{2})\s+(Domicile|Extérieur)\s+([^#]{2,180}?)(?=#\d+|Datas de l'équipe|Classement officiel|$)/gi;
  let m;
  while((m=re.exec(t))){
    const score=parseScoreTail(m[6]);
    let ourScore:number|null=null,opponentScore:number|null=null;
    const homeAway=m[5].toLowerCase().startsWith("dom")?"home":"away";
    if(score.a!==null&&score.b!==null){
      if(homeAway==="home"){ourScore=score.a;opponentScore=score.b}
      else{ourScore=score.b;opponentScore=score.a}
    }
    const opponent=score.opponent.replace(/\s+(?:0\s*[-–—:]?\s*0|00)\s*$/,"").trim();
    matches.push({sourceKey:m[1],round:m[2]||"",date:isoDate(m[3]),time:m[4].replace("h",":"),homeAway,homeTeam:homeAway==="home"?team:opponent,awayTeam:homeAway==="away"?team:opponent,opponent,ourScore,opponentScore});
  }

  // Source de vérité de secours : "Datas de l'équipe".
  // Elle reste exploitable même lorsque le calendrier FFBB colle les scores au nom.
  const dataStart=t.indexOf("Datas de l'équipe");
  const classStart=t.indexOf("Classement officiel");
  const datas=dataStart>=0?t.slice(dataStart,classStart>dataStart?classStart:dataStart+3000):"";
  let teamStats:null|{played:number;wins:number;losses:number;pointsFor:number;pointsAgainst:number}=null;
  // FFBB expose généralement : MJ, V, D, ... PF, PA. On n'invente pas les
  // positions si le bloc ne contient pas assez de données : les matchs restent prioritaires.
  const playedMatches=matches.filter(x=>x.ourScore!==null&&x.opponentScore!==null);
  if(playedMatches.length){
    teamStats={
      played:playedMatches.length,
      wins:playedMatches.filter(x=>x.ourScore!>x.opponentScore!).length,
      losses:playedMatches.filter(x=>x.ourScore!<x.opponentScore!).length,
      pointsFor:playedMatches.reduce((s,x)=>s+(x.ourScore||0),0),
      pointsAgainst:playedMatches.reduce((s,x)=>s+(x.opponentScore||0),0),
    };
  }
  if(!teamStats&&datas){
    const record=datas.match(/\((\d+)\s*V\s*(\d+)\s*D\)/i);
    const pf=datas.match(/(\d+)\s+points?\s+marqu/i);
    const pa=datas.match(/(\d+)\s+points?\s+encaiss/i);
    if(record){
      const wins=Number(record[1]),losses=Number(record[2]);
      teamStats={played:wins+losses,wins,losses,pointsFor:pf?Number(pf[1]):0,pointsAgainst:pa?Number(pa[1]):0};
    }
  }

  const rankText=classStart>=0?t.slice(classStart,classStart+8000):text(standingsHtml).slice(0,8000);
  const standings=parseStandingsFromHtml(standingsHtml,team);
  const ranking=standings?.rank??parseRanking(rankText,team);
  if(standings && standings.played!==null && standings.wins!==null && standings.losses!==null){
    teamStats={
      played:standings.played,
      wins:standings.wins,
      losses:standings.losses,
      pointsFor:standings.pointsFor ?? teamStats?.pointsFor ?? 0,
      pointsAgainst:standings.pointsAgainst ?? teamStats?.pointsAgainst ?? 0,
    };
  }
  return {mode:"team",team,competition,pool,phase,sourceUrl:url,matches,classementText:rankText,ranking,standings,teamStats,datasText:datas,updatedAt:new Date().toISOString()};
}


type FetchedPage={body:string;via:"ffbb"|"reader";status:number};
async function fetchFfbbPage(target:string,headers:Record<string,string>):Promise<FetchedPage>{
  const direct=await fetch(target,{headers,cache:"no-store",redirect:"follow"});
  if(direct.ok)return {body:await direct.text(),via:"ffbb",status:direct.status};
  if(direct.status!==401&&direct.status!==403&&direct.status!==429)throw new Error(`FFBB ${direct.status}`);

  // FFBB bloque actuellement certaines requêtes venant des IP de Vercel (403).
  // Reader rend la page publique dans un navigateur puis renvoie son contenu texte.
  // On ne l'utilise qu'en secours : FFBB direct reste toujours prioritaire.
  const readerUrl=`https://r.jina.ai/${target}`;
  const reader=await fetch(readerUrl,{
    headers:{
      "accept":"text/plain",
      "x-engine":"browser",
      "x-timeout":"15",
      "x-cache-tolerance":"60",
    },
    cache:"no-store",
    redirect:"follow",
  });
  if(!reader.ok)throw new Error(`FFBB ${direct.status} / secours ${reader.status}`);
  const body=await reader.text();
  if(!body||body.length<300)throw new Error(`FFBB ${direct.status} / secours vide`);
  return {body,via:"reader",status:direct.status};
}

export async function GET(req:NextRequest){
  const url=req.nextUrl.searchParams.get("url")||"";
  const requestedTeam=req.nextUrl.searchParams.get("team")||"";
  if(!/^https:\/\/competitions\.ffbb\.com\//i.test(url))return NextResponse.json({error:"Lien FFBB invalide"},{status:400});
  try{
    const headers={"user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/136 Safari/537.36","accept-language":"fr-FR,fr;q=0.9,en;q=0.8","accept":"text/html,application/xhtml+xml"};
    const mainPage=await fetchFfbbPage(url,headers);
    const html=mainPage.body;
    if(/\/equipes\/\d+/i.test(new URL(url).pathname)){
      const cleanUrl=url.replace(/[?#].*$/,"").replace(/\/classement\/?$/i,"").replace(/\/$/,"");
      const classementUrls=[`${cleanUrl}/classement`,`${cleanUrl}/classement/`];
      let standingsHtml=html;
      for(const classementUrl of classementUrls){
        try{
          const response=await fetchFfbbPage(classementUrl,headers);
          const candidate=response.body;
          if(candidate&&candidate.length>500){standingsHtml=candidate;break}
        }catch(error){console.warn("FFBB classement indisponible",classementUrl,error)}
      }
      return NextResponse.json({...parseTeamPage(html,url,standingsHtml,requestedTeam),transport:mainPage.via});
    }
    return NextResponse.json({mode:"choose-team",sourceUrl:url,teams:teamChoices(html),updatedAt:new Date().toISOString()});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Lecture FFBB impossible"},{status:502});
  }
}
