"use client";
import {useState} from "react";
import {readCandidateRows, resolveCandidateFormation, type CandidateImportRow} from "@/lib/institutionnel/training-candidate-import";
type ImportCohort = {id: string; name: string; label: string; program?: string; code?: string};
export default function CandidateExcelImport({cohorts, selectedId, endpoint, onImported}: {cohorts: ImportCohort[]; selectedId: string; endpoint: string; onImported: () => Promise<void>}) {
  const [rows, setRows] = useState<CandidateImportRow[]>([]);
  const [workbook, setWorkbook] = useState<any>(null);
  const [sheetName, setSheetName] = useState("");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function loadSheet(book: any, name: string) {
    const XLSX = await import("xlsx");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {header: 1, raw: false, defval: ""});
    const next = readCandidateRows(matrix).map(row => ({...row, cohortId: resolveCandidateFormation(row.formation, cohorts, selectedId)}));
    setRows(next); setSheetName(name); setMessage("");
  }
  async function readFile(file: File) {
    setOpen(true); setRows([]); setMessage(""); setBusy(true); setWorkbook(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (10 Mo maximum).");
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), {type: "array"});
      setWorkbook(book);
      let found = false;
      for (const name of book.SheetNames) {
        try { await loadSheet(book, name); found = true; break; } catch { /* Try next sheet with candidate headers. */ }
      }
      if (!found) { setSheetName(book.SheetNames[0] || ""); throw new Error("Aucune feuille ne contient les colonnes Nom, Prénom et Mail avec des candidats."); }
    } catch (e) {setMessage(e instanceof Error ? e.message : "Lecture du fichier impossible.");}
    finally {setBusy(false);}
  }
  const valid = rows.filter(row => !row.done && !row.errors.length && row.cohortId);
  async function importRows() {
    if (busy || !valid.length) return;
    setBusy(true); setMessage("");
    let succeeded = 0, failed = 0;
    const seen = new Set<string>();
    try {
      for (const row of valid) {
        const key = `${row.cohortId}:${row.email}`;
        if (seen.has(key)) {
          setRows(items => items.map(item => item.line === row.line ? {...item, result: "Doublon dans ce fichier", errors: ["Doublon dans ce fichier"]} : item));
          failed++; continue;
        }
        seen.add(key);
        try {
          const response = await fetch(endpoint, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(row)});
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Création impossible");
          setRows(items => items.map(item => item.line === row.line ? {...item, done: true, result: json.updated ? "Fiche mise à jour" : "Fiche créée"} : item));
          succeeded++;
        } catch (e) {
          setRows(items => items.map(item => item.line === row.line ? {...item, result: e instanceof Error ? e.message : "Échec"} : item));
          failed++;
        }
      }
      setMessage(`${succeeded} fiche(s) enregistrée(s), ${failed} échec(s). Les lignes incomplètes restent dans l’aperçu.`);
      if (succeeded) await onImported();
    } catch {setMessage("Import terminé, mais l’actualisation de la liste a échoué. Recharge la formation.");}
    finally {setBusy(false);}
  }
  return <>
    <label className="import-trigger">Importer Excel / CSV<input hidden type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => {const file = event.target.files?.[0]; event.currentTarget.value = ""; if(file) void readFile(file);}}/></label>
    {open && <div className="import-backdrop"><section className="import-modal" role="dialog" aria-modal="true" aria-label="Importer des candidats">
      <header><div><h3>Importer les candidats</h3><p>Nom · Prénom · Mail · Numéro (téléphone) · Formation · Club · Tuteur · Mail Tuteur</p></div><button disabled={busy} onClick={() => setOpen(false)} aria-label="Fermer">×</button></header>
      <p>Vérifie les informations et la formation avant de créer les fiches. Aucun email d’invitation n’est envoyé pendant l’import.</p>
      {workbook && <label>Feuille <select disabled={busy} value={sheetName} onChange={async event => {try {await loadSheet(workbook, event.target.value);} catch(e) {setRows([]); setSheetName(event.target.value); setMessage(e instanceof Error ? e.message : "Feuille illisible");}}}>{workbook.SheetNames.map((name: string) => <option key={name}>{name}</option>)}</select></label>}
      {message && <p role="status" className="import-message">{message}</p>}
      <div className="import-table"><table><thead><tr>{["Ligne", "Nom / prénom", "Mail", "Téléphone", "Formation", "Club", "Tuteur", "Mail tuteur", "Résultat"].map(text => <th key={text}>{text}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.line}><td>{row.line}</td><td>{row.lastName} {row.firstName}</td><td>{row.email}</td><td>{row.phone}</td><td><small>{row.formation || "Formation sélectionnée"}</small><select disabled={busy || row.done} value={row.cohortId} onChange={event => setRows(items => items.map(item => item.line === row.line ? {...item, cohortId: event.target.value} : item))}><option value="">Choisir la formation</option>{cohorts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td><td>{row.clubName}</td><td>{row.tutorName}</td><td>{row.tutorEmail}</td><td>{row.errors.join(" · ") || row.result || (!row.cohortId ? "Formation à choisir" : "Prêt à importer")}</td></tr>)}</tbody></table></div>
      <footer><span>{rows.length} ligne(s) · {valid.length} prête(s)</span><button disabled={busy} onClick={() => setOpen(false)}>Fermer</button><button disabled={busy || !valid.length} onClick={() => void importRows()}>{busy ? "Traitement…" : `Importer ${valid.length} candidat(s)`}</button></footer>
    </section></div>}
    <style jsx>{`
      .import-trigger{display:inline-flex;align-items:center;padding:9px 12px;background:#6b1a2c;color:white;border-radius:8px;font-weight:900;cursor:pointer;font-size:12px}
      .import-backdrop{position:fixed;inset:0;background:rgba(25,15,18,.6);z-index:10050;display:grid;place-items:center;padding:16px}
      .import-modal{background:white;color:#302328;width:min(1200px,100%);max-height:90vh;overflow:auto;box-sizing:border-box;border-radius:16px;padding:20px}
      header,footer{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}header{background:#6b1a2c;color:white;padding:16px;border-radius:10px}h3{margin:0;color:white}p{font-size:12px;line-height:1.5}header p{margin:6px 0 0}
      button{border:0;border-radius:8px;padding:10px 14px;background:#6b1a2c;color:white;font-weight:bold;cursor:pointer}header button{background:white;color:#6b1a2c}button:disabled{opacity:.5;cursor:wait}
      .import-table{overflow:auto;max-height:50vh;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px;text-align:left;border-bottom:1px solid #eadfd8;vertical-align:top}th{background:#fbf7f3}select{padding:8px;max-width:220px;border:1px solid #ddd;border-radius:7px}small{display:block;color:#84767a;margin-bottom:5px}.import-message{padding:12px;border-radius:8px;background:#fff4de}
    `}</style>
  </>;
}
