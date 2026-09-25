"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

type ExistingPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  birthdate: string | null;
  club_name: string | null;
  license_number?: string | null;
  profile_data?: any;
};

type ImportRow = {
  id: string;
  selected: boolean;
  first_name: string;
  last_name: string;
  birthdate: string;
  club_name: string;
  height_cm: string;
  license_number: string;
  sex: string;
  category: string;
  nationality: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  duplicateId?: string;
  raw: Record<string, string>;
};

type Mode = "large" | "filtered";

const norm = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => norm(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const personKey = (a: string, b: string, d: string) => `${key(a)}|${key(b)}|${norm(d).slice(0,10)}`;

const ALIASES: Record<keyof Omit<ImportRow, "id" | "selected" | "duplicateId" | "raw">, string[]> = {
  first_name: ["prenom", "firstname", "first", "givenname"],
  last_name: ["nom", "lastname", "surname", "familyname"],
  birthdate: ["naissance", "datedenaissance", "ddn", "birthdate", "datebirth"],
  club_name: ["club", "clubname", "lborg", "structure", "association"],
  height_cm: ["taille", "taillecm", "height", "heightcm"],
  license_number: ["idlice", "licence", "licensenumber", "numerolicence", "nlicence"],
  sex: ["sexe", "sex", "genre"],
  category: ["categorie", "category", "cat"],
  nationality: ["nationalite", "nationality"],
  email: ["email", "mail", "courriel"],
  phone: ["telephone", "tel", "phone", "portable", "mobile"],
  address: ["adresse", "address", "rue"],
  postal_code: ["codepostal", "cp", "postalcode", "zipcode"],
  city: ["ville", "city", "commune"],
};

function parseDelimited(text: string) {
  const clean = text.replace(/^\uFEFF/, "");
  const first = clean.split(/\r?\n/, 1)[0] || "";
  const candidates = [";", "\t", ","];
  const delimiter = candidates.sort((a,b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i=0;i<clean.length;i++) {
    const c=clean[i];
    if (c==='"') {
      if (quoted && clean[i+1]==='"') { cell+='"'; i++; }
      else quoted=!quoted;
    } else if (c===delimiter && !quoted) { row.push(cell); cell=""; }
    else if ((c==='\n' || c==='\r') && !quoted) {
      if (c==='\r' && clean[i+1]==='\n') i++;
      row.push(cell); cell="";
      if (row.some(x=>x.trim())) rows.push(row);
      row=[];
    } else cell+=c;
  }
  row.push(cell); if (row.some(x=>x.trim())) rows.push(row);
  return rows;
}

function toIsoDate(v: string) {
  const s=norm(v); if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) { const y=m[3].length===2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
  return s;
}

function findValue(record: Record<string,string>, aliases: string[]) {
  const entries=Object.entries(record);
  for (const alias of aliases) {
    const found=entries.find(([k])=>key(k)===key(alias));
    if (found) return norm(found[1]);
  }
  return "";
}

export default function InstitutionalPlayerImport({ structureId, existingPlayers, onClose, onImported }:{ structureId:string; existingPlayers:ExistingPlayer[]; onClose:()=>void; onImported:()=>void|Promise<void> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [mode,setMode]=useState<Mode>("large");
  const [rows,setRows]=useState<ImportRow[]>([]);
  const [fileName,setFileName]=useState("");
  const [search,setSearch]=useState("");
  const [club,setClub]=useState("");
  const [year,setYear]=useState("");
  const [minHeight,setMinHeight]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [summary,setSummary]=useState("");

  const existingByLicense=useMemo(()=>new Map(existingPlayers.filter(p=>p.license_number || p.profile_data?.licenseNumber).map(p=>[key(p.license_number || p.profile_data?.licenseNumber),p.id])),[existingPlayers]);
  const existingByIdentity=useMemo(()=>new Map(existingPlayers.map(p=>[personKey(p.first_name,p.last_name,p.birthdate || ""),p.id])),[existingPlayers]);

  const filtered=useMemo(()=>rows.filter(r=>{
    const q=key(search); const hay=key(`${r.first_name} ${r.last_name} ${r.club_name} ${r.license_number}`);
    return (!q || hay.includes(q)) && (!club || r.club_name===club) && (!year || r.birthdate.startsWith(year)) && (!minHeight || Number(r.height_cm||0)>=Number(minHeight));
  }),[rows,search,club,year,minHeight]);
  const clubs=useMemo(()=>[...new Set(rows.map(r=>r.club_name).filter(Boolean))].sort(),[rows]);
  const years=useMemo(()=>[...new Set(rows.map(r=>r.birthdate.slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse(),[rows]);
  const selectedCount=rows.filter(r=>r.selected && !r.duplicateId).length;
  const duplicateCount=rows.filter(r=>!!r.duplicateId).length;

  async function readFile(file:File) {
    setError(""); setSummary(""); setFileName(file.name);
    const ext=file.name.toLowerCase().split(".").pop();
    if (ext === "numbers") {
      setRows([]);
      setError("Apple Numbers utilise un format propriétaire qui n’est pas lisible nativement par une application web Next.js/Vercel. Exporte ce fichier en Excel (.xlsx) ou CSV depuis Numbers, puis dépose directement le fichier exporté ici. L’import et la sélection restent ensuite entièrement automatiques.");
      return;
    }
    let matrix: string[][] = [];
    if (["xlsx", "xls", "xlsm", "xlsb"].includes(ext || "")) {
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error("Aucune feuille Excel détectée");
        matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: "", raw: false }) as string[][];
      } catch {
        setRows([]); setError("Impossible de lire ce fichier Excel. Vérifie qu’il contient au moins une feuille avec un tableau de joueurs."); return;
      }
    } else if (["csv", "txt", "tsv"].includes(ext || "")) {
      matrix = parseDelimited(await file.text());
    } else {
      setRows([]); setError("Format non reconnu. Utilise CSV, TSV ou Excel (.xlsx/.xls). Pour Numbers, exporte directement en Excel ou CSV depuis Numbers."); return;
    }
    if (matrix.length<2) { setRows([]); setError("Aucune ligne joueur détectée dans ce fichier."); return; }
    const headers=matrix[0].map((h,i)=>norm(h)||`Colonne ${i+1}`);
    const parsed=matrix.slice(1).map((cells,idx)=>{
      const raw:Record<string,string>={}; headers.forEach((h,i)=>raw[h]=norm(cells[i]));
      const value=(field:keyof typeof ALIASES)=>findValue(raw,ALIASES[field]);
      const birthdate=toIsoDate(value("birthdate"));
      const license=value("license_number");
      const duplicateId=(license && existingByLicense.get(key(license))) || existingByIdentity.get(personKey(value("first_name"),value("last_name"),birthdate));
      return { id:`import-${idx}`, selected:mode==='filtered', first_name:value("first_name"), last_name:value("last_name"), birthdate, club_name:value("club_name"), height_cm:value("height_cm").replace(/[^0-9.,]/g,"").replace(",","."), license_number:license, sex:value("sex"), category:value("category"), nationality:value("nationality"), email:value("email"), phone:value("phone"), address:value("address"), postal_code:value("postal_code"), city:value("city"), duplicateId, raw } as ImportRow;
    }).filter(r=>r.first_name || r.last_name || r.license_number);
    setRows(parsed);
  }

  function toggleVisible(value:boolean) { const ids=new Set(filtered.filter(r=>!r.duplicateId).map(r=>r.id)); setRows(v=>v.map(r=>ids.has(r.id)?{...r,selected:value}:r)); }

  async function createSelected() {
    const chosen=rows.filter(r=>r.selected && !r.duplicateId);
    if (!chosen.length) return;
    if (!confirm(`Créer ${chosen.length} fiche(s) joueur dans MyBasket ?`)) return;
    setBusy(true); setError(""); let created=0; const failures:string[]=[];
    for (const r of chosen) {
      if (!r.first_name || !r.last_name) { failures.push(`${r.first_name} ${r.last_name}`.trim() || "Ligne sans nom"); continue; }
      const player={ first_name:r.first_name,last_name:r.last_name,birthdate:r.birthdate,club_name:r.club_name,category:r.category,sex:r.sex,height_cm:r.height_cm,license_number:r.license_number,nationality:r.nationality,email:r.email,phone:r.phone,
        // Les coordonnées postales restent dans profile_extra tant que la fiche/API actuelle ne possède pas de colonnes dédiées.
        profile_extra:{ address:r.address, postal_code:r.postal_code, city:r.city, import_source:fileName } };
      try {
        const res=await fetch('/api/institutionnel/players',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structureId,action:'create_player',player})});
        const data=await res.json().catch(()=>({}));
        if (!res.ok || !data?.player?.id) failures.push(`${r.first_name} ${r.last_name}`); else created++;
      } catch { failures.push(`${r.first_name} ${r.last_name}`); }
    }
    setBusy(false); setSummary(`${created} fiche(s) créée(s)${failures.length ? ` · ${failures.length} échec(s)` : ''}.`);
    if (created) await onImported();
  }

  if (!mounted) return null;

  return createPortal(<div className="back" onMouseDown={e=>{if(e.target===e.currentTarget) onClose();}}>
    <section className="modal">
      <header><div><p>INSTITUTION · BASE JOUEURS</p><h2>Importer des joueurs</h2><span>Analyse le fichier, vérifie les doublons et choisis exactement les fiches à créer.</span></div><button className="close" onClick={onClose}>×</button></header>
      <div className="body">
        {!rows.length && <>
          <div className="modes">
            <button className={mode==='large'?'on':''} onClick={()=>setMode('large')}><b>1 · Gros fichier</b><span>MyBasket analyse toutes les lignes. Rien n’est présélectionné : tu coches les joueurs à créer.</span></button>
            <button className={mode==='filtered'?'on':''} onClick={()=>setMode('filtered')}><b>2 · Fichier déjà filtré</b><span>Toutes les lignes détectées sont présélectionnées. Tu peux encore en décocher avant création.</span></button>
          </div>
          <label className="drop"><input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xlsb,.numbers" onChange={e=>e.target.files?.[0]&&void readFile(e.target.files[0])}/><b>Déposer ou choisir le fichier joueurs</b><span>CSV / Excel · Numbers accepté comme choix, avec indication immédiate pour l’exporter en Excel ou CSV.</span></label>
        </>}
        {error && <div className="error">{error}</div>}
        {rows.length>0 && <>
          <div className="stats"><b>{rows.length}<span>détectés</span></b><b>{selectedCount}<span>à créer</span></b><b>{duplicateCount}<span>déjà présents</span></b></div>
          <div className="filters"><input placeholder="Rechercher nom, club, licence…" value={search} onChange={e=>setSearch(e.target.value)}/><select value={club} onChange={e=>setClub(e.target.value)}><option value="">Tous les clubs</option>{clubs.map(x=><option key={x}>{x}</option>)}</select><select value={year} onChange={e=>setYear(e.target.value)}><option value="">Toutes les années</option>{years.map(x=><option key={x}>{x}</option>)}</select><input type="number" placeholder="Taille min." value={minHeight} onChange={e=>setMinHeight(e.target.value)}/></div>
          <div className="selectBar"><span>{filtered.length} ligne(s) affichée(s)</span><div><button onClick={()=>toggleVisible(true)}>Tout cocher</button><button onClick={()=>toggleVisible(false)}>Tout décocher</button></div></div>
          <div className="table"><div className="tr head"><span></span><span>Joueur</span><span>Naissance</span><span>Club</span><span>Taille</span><span>Licence</span><span>État</span></div>{filtered.map(r=><label className={`tr ${r.duplicateId?'duplicate':''}`} key={r.id}><span><input type="checkbox" disabled={!!r.duplicateId} checked={r.selected&&!r.duplicateId} onChange={()=>setRows(v=>v.map(x=>x.id===r.id?{...x,selected:!x.selected}:x))}/></span><span><b>{r.last_name || '—'} {r.first_name}</b></span><span>{r.birthdate || '—'}</span><span>{r.club_name || '—'}</span><span>{r.height_cm ? `${r.height_cm} cm`:'—'}</span><span>{r.license_number || '—'}</span><span className={r.duplicateId?'blue':'green'}>{r.duplicateId?'Déjà dans MyBasket':'Prêt à créer'}</span></label>)}</div>
        </>}
        {summary && <div className="summary">{summary}</div>}
      </div>
      <footer><button className="ghost" onClick={onClose}>Fermer</button>{rows.length>0&&<><button className="ghost" onClick={()=>{setRows([]);setFileName('');setSummary('');}}>Changer de fichier</button><button disabled={!selectedCount||busy} onClick={()=>void createSelected()}>{busy?'Création…':`Créer ${selectedCount} fiche(s)`}</button></>}</footer>
      <style jsx>{`
        .back{position:fixed;inset:0;z-index:1400;background:rgba(25,18,20,.55);display:grid;place-items:center;padding:20px}.modal{width:min(1180px,97vw);max-height:94vh;background:#fff;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 90px rgba(30,15,20,.3)}header{display:flex;justify-content:space-between;gap:20px;padding:22px 24px 18px;border-bottom:1px solid #eadfd8}header p{margin:0;color:#a16b16;font-size:.68rem;font-weight:1000;letter-spacing:.12em}header h2{margin:4px 0;color:#4d1420}header span{color:#81736d;font-size:.8rem}.close{width:36px;height:36px;border-radius:50%;font-size:1.3rem}.body{padding:20px 24px;overflow:auto;display:grid;gap:16px}.modes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.modes button{text-align:left;background:#faf7f5;color:#4d1420;border:1px solid #e4d7d1;padding:18px;border-radius:14px;display:grid;gap:5px}.modes button.on{border:2px solid #6b1a2c;background:#fff7f8}.modes span{font-size:.76rem;color:#7b6c67;font-weight:600}.drop{border:2px dashed #d7c4bc;border-radius:16px;padding:34px;display:grid;place-items:center;text-align:center;gap:5px;background:#fcfaf9;cursor:pointer}.drop input{display:none}.drop b{color:#5c1324}.drop span{font-size:.76rem;color:#81736d}.error{background:#fff1f1;border:1px solid #edcaca;color:#922b2b;padding:12px;border-radius:10px}.stats{display:flex;gap:10px}.stats b{min-width:120px;padding:12px 14px;background:#f8f4f2;border-radius:12px;color:#4d1420;font-size:1.15rem}.stats span{display:block;font-size:.65rem;color:#82736d}.filters{display:grid;grid-template-columns:1fr 220px 160px 140px;gap:8px}.filters input,.filters select{border:1px solid #ddd1ca;border-radius:9px;padding:10px;background:#fff}.selectBar{display:flex;justify-content:space-between;align-items:center;font-size:.76rem;color:#776964}.selectBar div{display:flex;gap:6px}.selectBar button,.ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8c8c1!important}.table{border:1px solid #e6dbd5;border-radius:12px;overflow:hidden}.tr{display:grid;grid-template-columns:34px minmax(190px,1.4fr) 110px minmax(160px,1fr) 80px 110px 140px;gap:8px;align-items:center;padding:9px 12px;border-top:1px solid #eee5e1;font-size:.76rem}.tr:first-child{border-top:0}.tr.head{background:#f7f3f1;font-weight:950;color:#625257}.tr.duplicate{background:#f5f8ff}.green{color:#28713d;font-weight:900}.blue{color:#315f9b;font-weight:900}.summary{background:#edf8ef;color:#286a3b;padding:12px;border-radius:10px;font-weight:900}footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 24px;border-top:1px solid #eadfd8;background:#fcfaf9}button{border:0;border-radius:9px;padding:10px 12px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:850px){.modes{grid-template-columns:1fr}.filters{grid-template-columns:1fr 1fr}.table{overflow:auto}.tr{min-width:900px}}`}</style>
    </section>
  </div>, document.body);
}
