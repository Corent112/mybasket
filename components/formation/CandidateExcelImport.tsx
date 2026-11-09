"use client";
import {useRef, useState} from "react";
import type {WorkBook} from "xlsx";
import {readCandidateRows, resolveCandidateFormation, type CandidateImportRow} from "@/lib/institutionnel/training-candidate-import";
type ImportCohort = {id: string; name: string; label: string; program?: string; code?: string};
export default function CandidateExcelImport({cohorts, selectedId, endpoint, onImported}: {cohorts: ImportCohort[]; selectedId: string; endpoint: string; onImported: () => Promise<void>}) {
  const [rows, setRows] = useState<CandidateImportRow[]>([]);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [checkedLines, setCheckedLines] = useState<Set<number>>(() => new Set());
  const [targetId, setTargetId] = useState("");
  const importing = useRef(false);
  const [sheetName, setSheetName] = useState("");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function loadSheet(book: WorkBook, name: string) {
    const XLSX = await import("xlsx");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {header: 1, raw: false, defval: ""});
    const next = readCandidateRows(matrix).map(row => ({...row, cohortId: resolveCandidateFormation(row.formation, cohorts, selectedId)}));
    setRows(next); setSheetName(name); setCheckedLines(new Set()); setTargetId(""); setMessage("");
  }
  async function readFile(file: File) {
    setOpen(true); setRows([]); setMessage(""); setBusy(true); setWorkbook(null); setCheckedLines(new Set()); setTargetId("");
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
  async function changeSheet(name: string) {
    if (!workbook || busy || name === sheetName) return;
    setBusy(true);
    try { await loadSheet(workbook, name); }
    catch (e) {
      setRows([]); setSheetName(name); setCheckedLines(new Set()); setTargetId("");
      setMessage(e instanceof Error ? e.message : "Feuille illisible");
    } finally { setBusy(false); }
  }
  const cohortIds = new Set(cohorts.map(cohort => cohort.id));
  const selectable = rows.filter(row => !row.done && !row.errors.length);
  const checked = selectable.filter(row => checkedLines.has(row.line));
  const missing = checked.filter(row => !cohortIds.has(row.cohortId)).length;
  const allChecked = selectable.length > 0 && checked.length === selectable.length;

  function assignFormation() {
    if (busy || !cohortIds.has(targetId) || !checked.length) return;
    setRows(items => items.map(item => !item.done && !item.errors.length && checkedLines.has(item.line)
      ? {...item, cohortId: targetId, result: undefined}
      : item));
    const label = cohorts.find(cohort => cohort.id === targetId)?.label;
    setMessage(`${checked.length} candidat(s) affecté(s) à ${label} dans l’aperçu. Valide l’import pour enregistrer.`);
  }
  async function importRows() {
    if (busy || importing.current || !checked.length || missing) return;
    importing.current = true;
    setBusy(true); setMessage("");
    let succeeded = 0, failed = 0;
    const seen = new Set<string>();
    try {
      for (const row of checked) {
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
      setMessage(`${succeeded} fiche(s) enregistrée(s), ${failed} échec(s). Tu peux cocher d’autres candidats dans l’aperçu.`);
      if (succeeded) await onImported();
    } catch {setMessage("Import terminé, mais l’actualisation de la liste a échoué. Recharge la formation.");}
    finally {importing.current = false; setBusy(false);}
  }
  return <>
    <label className="import-trigger">Importer Excel / CSV<input hidden type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => {const file = event.target.files?.[0]; event.currentTarget.value = ""; if(file) void readFile(file);}}/></label>
    {open && <div className="import-backdrop"><section className="import-modal" role="dialog" aria-modal="true" aria-label="Importer des candidats">
      <header><div><h3>Importer les candidats</h3><p>Nom · Prénom · Mail · Numéro (téléphone) · Formation · Club · Tuteur · Mail Tuteur</p></div><button disabled={busy} onClick={() => setOpen(false)} aria-label="Fermer">×</button></header>
      <p>Coche les candidats à importer. Tu peux choisir une formation pour tout le groupe ou la modifier ligne par ligne. Aucun email d’invitation n’est envoyé.</p>
      {workbook && <label>Feuille <select disabled={busy} value={sheetName} onChange={event => void changeSheet(event.target.value)}>{workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label>}
      {rows.length > 0 && <div className="import-bulk">
        <label className="import-check">
          <input type="checkbox" checked={allChecked}
            ref={input => { if (input) input.indeterminate = !allChecked && checked.length > 0; }}
            disabled={busy || selectable.length === 0}
            onChange={event => setCheckedLines(event.target.checked ? new Set(selectable.map(row => row.line)) : new Set())} />
          Tout cocher
        </label>
        <strong>{checked.length} coché(s)</strong>
        <label>Formation du groupe <select value={targetId} disabled={busy} onChange={event => setTargetId(event.target.value)}>
          <option value="">Choisir une formation</option>
          {cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.label}</option>)}
        </select></label>
        <button type="button" disabled={busy || !checked.length || !targetId} onClick={assignFormation}>Affecter aux candidats cochés</button>
      </div>}
      {message && <p role="status" className="import-message">{message}</p>}
      <div className="import-table">
        <table>
          <thead><tr>{["Choix", "Ligne", "Nom / prénom", "Mail", "Téléphone", "Formation", "Club", "Tuteur", "Mail tuteur", "Résultat"].map(text => <th key={text} scope="col">{text}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.line} data-checked={!row.done && !row.errors.length && checkedLines.has(row.line)}>
            <td><input type="checkbox" aria-label={`Cocher ${row.firstName} ${row.lastName} (ligne ${row.line})`}
              checked={!row.done && !row.errors.length && checkedLines.has(row.line)}
              disabled={busy || row.done || !!row.errors.length}
              onChange={event => {
                const value = event.target.checked;
                setCheckedLines(lines => {
                  const next = new Set(lines);
                  if (value) next.add(row.line); else next.delete(row.line);
                  return next;
                });
              }} /></td>
            <td>{row.line}</td><td>{row.lastName} {row.firstName}</td><td>{row.email}</td><td>{row.phone}</td>
            <td>
              {row.formation && <small>Fichier : {row.formation}</small>}
              <select aria-label={`Formation de ${row.firstName} ${row.lastName} (ligne ${row.line})`}
                disabled={busy || row.done || !!row.errors.length} value={row.cohortId}
                onChange={event => {
                  const cohortId = event.target.value;
                  setRows(items => items.map(item => item.line === row.line ? {...item, cohortId, result: undefined} : item));
                }}>
                <option value="">Choisir la formation</option>
                {cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.label}</option>)}
              </select>
            </td>
            <td>{row.clubName}</td><td>{row.tutorName}</td><td>{row.tutorEmail}</td>
            <td>{row.errors.join(" · ") || row.result || (!cohortIds.has(row.cohortId) ? "Formation à choisir" : "Prêt à importer")}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <footer>
        <span>{rows.length} ligne(s) · {checked.length} coché(s){missing > 0 && ` · ${missing} sans formation`}</span>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Fermer</button>
        <button type="button" disabled={busy || !checked.length || missing > 0} onClick={() => void importRows()}>
          {busy ? "Traitement…" : `Importer ${checked.length} candidat(s) coché(s)`}
        </button>
      </footer>
    </section></div>}
    <style jsx>{`
      .import-trigger{display:inline-flex;align-items:center;padding:9px 12px;background:#6b1a2c;color:white;border-radius:8px;font-weight:900;cursor:pointer;font-size:12px}
      .import-backdrop{position:fixed;inset:0;background:rgba(25,15,18,.6);z-index:10050;display:grid;place-items:center;padding:16px}
      .import-modal{background:white;color:#302328;width:min(1200px,100%);max-height:90vh;overflow:auto;box-sizing:border-box;border-radius:16px;padding:20px}
      header,footer{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}header{background:#6b1a2c;color:white;padding:16px;border-radius:10px}h3{margin:0;color:white}p{font-size:12px;line-height:1.5}header p{margin:6px 0 0}
      button{border:0;border-radius:8px;padding:10px 14px;background:#6b1a2c;color:white;font-weight:bold;cursor:pointer}header button{background:white;color:#6b1a2c}button:disabled{opacity:.5;cursor:not-allowed}
      .import-bulk{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:12px;padding:12px;background:#fbf7f3;border:1px solid #eadfd8;border-radius:8px;font-size:12px}.import-check{display:inline-flex;align-items:center;gap:6px}input[type=checkbox]{accent-color:#6b1a2c;width:16px;height:16px}tr[data-checked=true]{background:#faf0f3}
      .import-table{overflow:auto;max-height:50vh;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px;text-align:left;border-bottom:1px solid #eadfd8;vertical-align:top}th{background:#fbf7f3}select{padding:8px;max-width:220px;border:1px solid #ddd;border-radius:7px}small{display:block;color:#84767a;margin-bottom:5px}.import-message{padding:12px;border-radius:8px;background:#fff4de}
    `}</style>
  </>;
}
