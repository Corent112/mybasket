import { NextRequest, NextResponse } from "next/server";

type TeamChoice={name:string;url:string};
type Game={sourceKey:string;round:string;date:string;time:string;homeAway:"home"|"away"|"unknown";homeTeam:string;awayTeam:string;opponent:string;ourScore:number|null;opponentScore:number|null};
const MONTHS:Record<string,string>={janv:"01",févr:"02",mars:"03",avr:"04",mai:"05",juin:"06",juil:"07",août:"08",sept:"09",oct:"10",nov:"11",déc:"12"};
function text(html:string){return html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim()}
function abs(href:string){return new URL(href,"https://competitions.ffbb.com").toString()}
function teamChoices(html:string):TeamChoice[]{const out=new Map<string,TeamChoice>();const re=/<a[^>]+href=["']([^"']*\/equipes\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))){const name=text(m[2]);if(name&&name.length<120)out.set(abs(m[1]),{name,url:abs(m[1])})}return [...out.values()]}
function isoDate(raw:string){const m=raw.toLowerCase().match(/(\d{1,2})\s+([a-zéû\.]+)(?:\s+(\d{4}))?/i);if(!m)return raw;const key=Object.keys(MONTHS).find(k=>m[2].startsWith(k));if(!key)return raw;const y=m[3]||String(new Date().getFullYear());return `${y}-${MONTHS[key]}-${m[1].padStart(2,"0")}`}
function parseScoreTail(raw:string){
  const cleaned=raw.replace(/\s+/g," ").trim();

  // Scores FFBB réellement joués : 2 ou 3 chiffres par équipe.
  // On refuse explicitement 0/0 et "00" afin qu'un match futur ne soit jamais
  // interprété comme un résultat.
  const separated=cleaned.match(/^(.*?)\s+(\d{2,3})\s*[-–:]?\s*(\d{2,3})\s*$/);
  const glued=cleaned.match(/^(.*?)(\d{2,3})(\d{2,3})$/);
  const match=separated||glued;
  if(!match)return {opponent:cleaned,a:null as number|null,b:null as number|null};

  const a=Number(match[2]),b=Number(match[3]);
  if((a===0&&b===0)||!Number.isFinite(a)||!Number.isFinite(b)){
    return {opponent:match[1].trim().replace(/\s+0\s*0$/,"").trim(),a:null,b:null};
  }
  return {opponent:match[1].trim(),a,b};
}

function parseRanking(rankText:string,teamName:string){
  const normalizedTeam=teamName
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").trim().toLowerCase();
  if(!rankText||!normalizedTeam)return null;

  const normalized=rankText
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").trim().toLowerCase();
  const escaped=normalizedTeam.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

  const patterns=[
    new RegExp(`(?:^|\\s)(\\d{1,2})\\s*(?:er|e|eme)?\\s+${escaped}(?:\\s|$)`),
    new RegExp(`${escaped}\\s+(\\d{1,2})\\s*(?:er|e|eme)?(?:\\s|$)`),
  ];
  for(const pattern of patterns){
    const m=normalized.match(pattern);
    if(m?.[1])return Number(m[1]);
  }
  return null;
}


function normalizeRankText(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
}
function parseRankingFromHtml(html:string,teamName:string){
  const wanted=normalizeRankText(teamName);
  if(!wanted)return null;

  // Le classement FFBB est un tableau : on inspecte chaque ligne <tr>.
  // On récupère la cellule numérique placée AVANT la cellule de l'équipe.
  // Cela évite de confondre la place avec les points, matchs joués, etc.
  const rows=html.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  for(const row of rows){
    const cells=Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map(m=>text(m[1]));
    if(!cells.length)continue;

    const teamCell=cells.findIndex(cell=>{
      const normalized=normalizeRankText(cell);
      return normalized===wanted || normalized.includes(wanted) || wanted.includes(normalized);
    });
    if(teamCell<0)continue;

    for(let i=teamCell-1;i>=0;i--){
      const m=cells[i].match(/^\s*(\d{1,2})\s*(?:er|e|eme|ème)?\s*[.)-]?\s*$/i);
      if(m){
        const rank=Number(m[1]);
        if(rank>=1&&rank<=30)return rank;
      }
    }
  }

  // Certains écrans FFBB utilisent des blocs plutôt qu'un <table>.
  // On cherche alors le rang immédiatement devant le nom dans un fragment court.
  const flat=text(html);
  const normalized=normalizeRankText(flat);
  const escaped=wanted.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const m=normalized.match(new RegExp(`(?:^|\\s)(\\d{1,2})\\s*(?:er|e|eme)?[.)\\-:]?\\s+${escaped}(?:\\s|$)`));
  if(m?.[1]){
    const rank=Number(m[1]);
    if(rank>=1&&rank<=30)return rank;
  }
  return null;
}


function parseStandingsFromHtml(html:string,teamName:string){
  const wanted=normalizeRankText(teamName);
  if(!wanted)return null;
  const rows=html.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];

  for(const row of rows){
    const cells=Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map(m=>text(m[1]).replace(/\s+/g," ").trim())
      .filter(Boolean);
    if(cells.length<4)continue;

    const teamIndex=cells.findIndex(c=>{
      const n=normalizeRankText(c);
      return n===wanted ||
        (wanted.length>5 && n.includes(wanted)) ||
        (n.length>5 && wanted.includes(n));
    });
    if(teamIndex<0)continue;

    // Tableau FFBB :
    // rang | équipe | PTS | RENCONTRES (J G P N) | ...
    let rank:number|null=null;
    for(let i=teamIndex-1;i>=0;i--){
      const hit=cells[i].match(/^\s*(\d{1,2})\s*(?:er|e|eme|ème)?\s*$/i);
      if(hit){ rank=Number(hit[1]); break; }
    }

    const after=cells.slice(teamIndex+1);
    const nums=after
      .flatMap(c=>(c.match(/-?\d+/g)||[]).map(Number))
      .filter(n=>Number.isFinite(n));

    // FFBB puts points first, then J G P N.
    // Ex Paris: 2 | 1 1 0 0 | ...
    const points=nums.length?nums[0]:null;
    const played=nums.length>1?nums[1]:null;
    const wins=nums.length>2?nums[2]:null;
    const losses=nums.length>3?nums[3]:null;
    const draws=nums.length>4?nums[4]:null;

    if(rank && played!==null && wins!==null && losses!==null){
      return {rank,points,played,wins,losses,draws:draws ?? 0};
    }
  }
  return null;
}

function parseTeamPage(html:string,url:string,standingsHtml:string=html,teamNameOverride:string=""){
  const t=text(html);
  const h1=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const team=teamNameOverride.trim() || h1 || (t.match(/#\s*([^#]{2,80}?)\s+(?:NATIONALE|REGIONALE|RÉGIONALE|DEPARTEMENTALE|DÉPARTEMENTALE|PRÉ|PRE|U\d|Calendrier)/i)?.[1]
    ||t.match(/club\s+[^ ]+\s+équipe\s+([^#]{2,70})/i)?.[1]
    ||"Équipe FFBB").trim();
  const competition=(t.match(/((?:NATIONALE|REGIONALE|RÉGIONALE|DEPARTEMENTALE|DÉPARTEMENTALE|PRÉ|PRE)[^|]{2,100})\s+FEDE/i)?.[1]
    ||t.match(/\|\s*([A-Z0-9 -]{2,35})\s*\|\s*Poule/i)?.[1]
    ||"Compétition FFBB").trim();
  const pool=t.match(/Poule\s+([A-Z0-9-]+)/i)?.[1]||"";
  const phase=new URL(url).searchParams.get("phase")||"";
  const matches:Game[]=[];

  const re=/#(\d+)\s+(J\d+)?\s*(\d{1,2}\s+(?:janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?)(?:\s+\d{4})?)\s+(\d{1,2}h\d{2})\s+(Domicile|Extérieur)\s+([^#]{2,140}?)(?=#\d+|Datas de l'équipe|Classement officiel|$)/gi;
  let m;
  while((m=re.exec(t))){
    const score=parseScoreTail(m[6]);
    let ourScore:number|null=null,opponentScore:number|null=null;
    if(score.a!==null&&score.b!==null){
      if(m[5].toLowerCase().startsWith("dom")){
        ourScore=score.a;opponentScore=score.b;
      }else{
        ourScore=score.b;opponentScore=score.a;
      }
    }
    const homeAway = m[5].toLowerCase().startsWith("dom") ? "home" : "away";
    const opponent = score.opponent.replace(/\s+(?:0\s+0|00)\s*$/,"").trim();

    // Contrat MyBasket :
    // FFBB affiche toujours l'équipe domicile en premier et l'équipe extérieure en second.
    // Sur la page d'une équipe, "Domicile" signifie donc que l'équipe liée est la première.
    const homeTeam = homeAway === "home" ? team : opponent;
    const awayTeam = homeAway === "away" ? team : opponent;

    matches.push({
      sourceKey:m[1],
      round:m[2]||"",
      date:isoDate(m[3]),
      time:m[4].replace("h",":"),
      homeAway,
      homeTeam,
      awayTeam,
      opponent,
      ourScore,
      opponentScore
    });
  }

  const rankText=t.includes("Classement officiel")
    ? t.slice(t.indexOf("Classement officiel"),t.indexOf("Classement officiel")+4000)
    : "";
  const standings=parseStandingsFromHtml(standingsHtml,team);
  const ranking=standings?.rank ?? parseRankingFromHtml(standingsHtml,team) ?? parseRanking(rankText,team);

  return {
    mode:"team",
    team,
    competition,
    pool,
    phase,
    sourceUrl:url,
    matches,
    classementText:rankText,
    ranking,
    standings,
    updatedAt:new Date().toISOString()
  };
}
export async function GET(req:NextRequest){
  const url=req.nextUrl.searchParams.get("url")||"";
  const requestedTeam=req.nextUrl.searchParams.get("team")||"";
  if(!/^https:\/\/competitions\.ffbb\.com\//i.test(url)){
    return NextResponse.json({error:"Lien FFBB invalide"},{status:400});
  }

  try{
    const headers={
      "user-agent":"Mozilla/5.0 MyBasket/1.0",
      "accept-language":"fr-FR,fr;q=.9"
    };

    const r=await fetch(url,{headers,cache:"no-store"});
    if(!r.ok)throw new Error(`FFBB ${r.status}`);
    const html=await r.text();

    if(/\/equipes\/\d+/i.test(new URL(url).pathname)){
      // IMPORTANT :
      // la page principale d'une équipe FFBB contient surtout le calendrier.
      // Le vrai tableau J/G/P est sur /classement. On le charge explicitement.
      const cleanUrl=url.replace(/[?#].*$/,"").replace(/\/classement\/?$/i,"").replace(/\/$/,"");
      const classementUrl=`${cleanUrl}/classement`;

      let standingsHtml=html;
      try{
        const classementResponse=await fetch(classementUrl,{headers,cache:"no-store"});
        if(classementResponse.ok){
          standingsHtml=await classementResponse.text();
        }
      }catch(error){
        console.warn("FFBB classement indisponible, fallback page équipe",error);
      }

      return NextResponse.json(parseTeamPage(html,url,standingsHtml,requestedTeam));
    }

    const teams=teamChoices(html);
    return NextResponse.json({
      mode:"choose-team",
      sourceUrl:url,
      teams,
      updatedAt:new Date().toISOString()
    });
  }catch(e){
    return NextResponse.json(
      {error:e instanceof Error?e.message:"Lecture FFBB impossible"},
      {status:502}
    );
  }
}
