"use client";
// components/club/ClubSpace.tsx
// Espace Mon Club — 100% Supabase, async.
// Calé EXACTEMENT sur les signatures de lib/club-store.ts :
//   - lectures async : readTeams / readFinance / readCotisations / readCoaches /
//     readDocs / readComms / readClubInfo / readSubscription /
//     countCalendarSessions(teamIds?) / countCreneaux
//   - écritures async : writeFinance / writeCotisations / upsertCoach /
//     deleteCoach / addDoc(section, File) / removeDoc(section, id) / addComm /
//     writeClubInfo
//   - helpers exportés réutilisés : computeMoney({teams,finance,coti}),
//     cotiStatus, tierForPlayer, fmtEuro, uid, emptyMoney, defaultFinance
//
// Aucune fonction async n'est consommée en synchrone : chargement via
// useEffect -> load() -> Promise.all, tout est stocké en state, toutes les
// écritures sont await. Aucun localStorage, aucun champ/table inventé.
import React, { useEffect, useMemo, useState, useCallback, useContext, createContext } from "react";
import {
  Team,
  Player,
  Coach,
  FinanceState,
  LicenseTier,
  Expense,
  Income,
  CotiState,
  CotiRecord,
  CotiStatus,
  Comm,
  CommKind,
  ClubDoc,
  ClubInfo,
  Subscription,
  Money,
  // lectures
  readTeams,
  readFinance,
  readCotisations,
  readCoaches,
  readDocs,
  readComms,
  readClubInfo,
  readSubscription,
  countCalendarSessions,
  countCreneaux,
  // écritures
  writeFinance,
  writeCotisations,
  upsertCoach,
  deleteCoach,
  addDoc,
  removeDoc,
  addComm,
  writeClubInfo,
  // helpers exportés
  computeMoney,
  cotiStatus,
  tierForPlayer,
  fmtEuro,
  uid,
  emptyMoney,
  defaultFinance,
} from "../../lib/club-store";
import { createCoachInvitation, sendClubEmail } from "../../lib/club-supabase";
import CreneauxPlanner from "./CreneauxPlanner";

type TabKey =
  | "dashboard"
  | "finances"
  | "planning"
  | "coachs"
  | "equipes"
  | "joueurs"
  | "cotisations"
  | "documents"
  | "communication"
  | "abonnement";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: "📊" },
  { key: "finances", label: "Finances", icon: "💶" },
  { key: "planning", label: "Planning", icon: "🗓️" },
  { key: "coachs", label: "Coachs", icon: "🧑‍🏫" },
  { key: "equipes", label: "Équipes du club", icon: "🛡️" },
  { key: "joueurs", label: "Joueurs", icon: "👕" },
  { key: "cotisations", label: "Cotisations", icon: "🧾" },
  { key: "documents", label: "Documents", icon: "📁" },
  { key: "communication", label: "Communication", icon: "📣" },
  { key: "abonnement", label: "Abonnement", icon: "⭐" },
];

const euro = fmtEuro;
function n(v: any): number {
  const x = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

/* --------------------------------------------------------- contexte documents
   readDocs() est async -> chargé une fois dans le parent et exposé aux DocDrop. */
type DocsCtxValue = { docs: Record<string, ClubDoc[]>; reload: () => Promise<void> };
const DocsCtx = createContext<DocsCtxValue>({ docs: {}, reload: async () => {} });

/* ------------------------------------------------------------------- état app */
type AppData = {
  teams: Team[];
  players: Player[];
  finance: FinanceState;
  coti: CotiState;
  coaches: Coach[];
  comms: Comm[];
  info: ClubInfo;
  sub: Subscription | null;
  creneaux: number;
  sessions: number;
  coachSessions: Record<string, number>;
};

const EMPTY_DATA: AppData = {
  teams: [],
  players: [],
  finance: defaultFinance(),
  coti: {},
  coaches: [],
  comms: [],
  info: { name: "Mon Club", season: "" },
  sub: null,
  creneaux: 0,
  sessions: 0,
  coachSessions: {},
};

/* ======================================================================= */
export default function ClubSpace() {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [docs, setDocs] = useState<Record<string, ClubDoc[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reloadDocs = useCallback(async () => {
    try {
      const d = await readDocs();
      setDocs(d || {});
    } catch {
      /* best-effort */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teams, finance, coti, coaches, info, sub, creneaux, sessions, docsMap, comms] = await Promise.all([
        readTeams(),
        readFinance(),
        readCotisations(),
        readCoaches(),
        readClubInfo(),
        readSubscription(),
        countCreneaux(),
        countCalendarSessions(),
        readDocs(),
        readComms(),
      ]);

      // séances par coach : 1 appel async / coach, parallélisé
      const counts = await Promise.all((coaches || []).map((c) => countCalendarSessions(c.teamIds)));
      const coachSessions: Record<string, number> = {};
      (coaches || []).forEach((c, i) => {
        coachSessions[c.id] = counts[i] ?? 0;
      });

      const players = (teams || []).flatMap((t) => t.players);
      setData({
        teams: teams || [],
        players,
        finance,
        coti: coti || {},
        coaches: coaches || [],
        comms: comms || [],
        info,
        sub: sub ?? null,
        creneaux: creneaux ?? 0,
        sessions: sessions ?? 0,
        coachSessions,
      });
      setDocs(docsMap || {});
    } catch (e: any) {
      setError(e?.message || "Impossible de charger l'espace club.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback((p: Partial<AppData>) => setData((d) => ({ ...d, ...p })), []);

  const money = useMemo<Money>(
    () => (loading ? emptyMoney() : computeMoney({ teams: data.teams, finance: data.finance, coti: data.coti })),
    [loading, data.teams, data.finance, data.coti]
  );

  const kpi = {
    licencies: data.players.length,
    coachs: data.coaches.length,
    equipes: data.teams.length,
    creneaux: data.creneaux,
    seances: data.sessions,
  };

  return (
    <DocsCtx.Provider value={{ docs, reload: reloadDocs }}>
      <div className="club">
        <header className="club-head">
          <div className="club-head-l">
            <div className="club-badge">🏀</div>
            <div>
              <input
                className="club-name"
                value={data.info.name}
                onChange={async (e) => {
                  const info = { ...data.info, name: e.target.value };
                  patch({ info });
                  try {
                    await writeClubInfo(info);
                  } catch {
                    /* best-effort */
                  }
                }}
              />
              <div className="club-season">Saison {data.info.season}</div>
            </div>
          </div>
          <div className="club-kpis">
            <KpiChip label="Licenciés" value={kpi.licencies} />
            <KpiChip label="Coachs" value={kpi.coachs} />
            <KpiChip label="Équipes" value={kpi.equipes} />
            <KpiChip label="Créneaux" value={kpi.creneaux} />
          </div>
        </header>

        <nav className="club-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`club-tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
              <span className="ico">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <main className="club-main">
          {error && (
            <div className="banner err">
              {error} <button className="btn ghost sm" onClick={load}>Réessayer</button>
            </div>
          )}
          {loading ? (
            <div className="loading">Chargement de l'espace club…</div>
          ) : (
            <>
              {tab === "dashboard" && <Dashboard money={money} kpi={kpi} />}
              {tab === "finances" && <Finances data={data} money={money} patch={patch} />}
              {tab === "planning" && <div style={{ padding: 20, background: "red", color: "white" }}>TEST PLANNING</div>}
              {tab === "planning" && <CreneauxPlanner />}
              {tab === "coachs" && <Coachs data={data} patch={patch} reload={load} />}
              {tab === "equipes" && <Equipes teams={data.teams} />}
              {tab === "joueurs" && <Joueurs players={data.players} />}
              {tab === "cotisations" && <Cotisations data={data} money={money} patch={patch} />}
              {tab === "documents" && <Documents />}
              {tab === "communication" && <Communication data={data} reload={load} />}
              {tab === "abonnement" && <Abonnement sub={data.sub} coaches={data.coaches} />}
            </>
          )}
        </main>

        <Styles />
      </div>
    </DocsCtx.Provider>
  );
}

/* ===================================================================== */
/* Composants partagés                                                   */
/* ===================================================================== */
function KpiChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="kchip">
      <div className="kchip-v">{value}</div>
      <div className="kchip-l">{label}</div>
    </div>
  );
}

function Card({
  title,
  sub,
  section,
  right,
  children,
}: {
  title: string;
  sub?: string;
  section?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-h">
        <div>
          <h3>{title}</h3>
          {sub && <p className="card-sub">{sub}</p>}
        </div>
        <div className="card-h-r">
          {section && <DocDrop section={section} compact />}
          {right}
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: CotiStatus }) {
  const map = { paid: "Payé", partial: "En cours", unpaid: "Impayé" } as const;
  return <span className={`pill ${status}`}>{map[status]}</span>;
}

/** Dépôt de documents Supabase. addDoc(section, File) gère upload + insert. */
function DocDrop({ section, compact }: { section: string; compact?: boolean }) {
  const { docs, reload } = useContext(DocsCtx);
  const list = docs[section] || [];
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setErr("");
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        await addDoc(section, f);
      } catch (e: any) {
        setErr(`Impossible d'ajouter "${f.name}" : ${e?.message || "erreur"}`);
      }
    }
    await reload();
    setBusy(false);
  };

  const onRemove = async (d: ClubDoc) => {
    try {
      await removeDoc(section, d.id);
    } catch (e: any) {
      setErr(e?.message || "Suppression impossible.");
    }
    await reload();
  };

  const inputId = `doc-${section}`;
  return (
    <div className={`docdrop ${compact ? "compact" : ""}`}>
      <label htmlFor={inputId} className="doc-btn" title="Ajouter un document (PDF, JPEG...)">
        📎 {compact ? "" : busy ? "Envoi…" : "Ajouter un document"}
        {list.length > 0 && <span className="doc-count">{list.length}</span>}
      </label>
      <input id={inputId} type="file" accept="application/pdf,image/*" multiple hidden disabled={busy} onChange={(e) => onFiles(e.target.files)} />
      {!compact && list.length > 0 && (
        <ul className="doc-list">
          {list.map((d) => (
            <li key={d.id}>
              <a href={d.url} download={d.name} target="_blank" rel="noreferrer" title={d.name}>
                {d.type.includes("pdf") ? "📄" : "🖼️"} {d.name}
              </a>
              <span className="doc-size">{Math.round(d.size / 1024)} ko</span>
              <button className="x" onClick={() => onRemove(d)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="doc-err">{err}</p>}
    </div>
  );
}

/* ===================================================================== */
/* 1. TABLEAU DE BORD                                                     */
/* ===================================================================== */
function Dashboard({ money, kpi }: { money: Money; kpi: { licencies: number; coachs: number; equipes: number; creneaux: number; seances: number } }) {
  const soldePos = money.soldePrevisionnel >= 0;
  return (
    <div className="grid">
      <div className="money-row">
        <BigMoney label="Recettes prévues" value={money.totalRecettes} tone="up" />
        <BigMoney label="Dépenses prévues" value={money.totalDepenses} tone="down" />
        <BigMoney label="Solde prévisionnel" value={money.soldePrevisionnel} tone={soldePos ? "up" : "down"} strong />
      </div>
      <div className="money-row">
        <BigMoney label="Encaissé (cotisations)" value={money.encaisse} tone="up" />
        <BigMoney label="Reste à encaisser" value={money.resteAEncaisser} tone="warn" />
        <BigMoney label="CA cotisations" value={money.caLicences} tone="neutral" />
      </div>

      <Card title="Vision du club" sub="Tout est calculé à partir des équipes, coachs et joueurs que tu crées." section="dashboard">
        <div className="vision">
          <VisionCell big={kpi.licencies} label="Licenciés" />
          <VisionCell big={kpi.coachs} label="Coachs" />
          <VisionCell big={kpi.equipes} label="Équipes" />
          <VisionCell big={kpi.creneaux} label="Créneaux" />
          <VisionCell big={kpi.seances} label="Évènements (calendrier)" />
        </div>
      </Card>

      <Card title="Détail financier">
        <table className="t">
          <tbody>
            <tr><td>CA cotisations (prix licences × licenciés)</td><td className="num up">{euro(money.caLicences)}</td></tr>
            <tr><td>Autres recettes</td><td className="num up">{euro(money.extraIncome)}</td></tr>
            <tr className="sep"><td><b>Total recettes</b></td><td className="num up"><b>{euro(money.totalRecettes)}</b></td></tr>
            <tr><td>Coût licences (socle + extensions)</td><td className="num down">{euro(money.coutLicences)}</td></tr>
            <tr><td>Affiliation</td><td className="num down">{euro(money.affiliation)}</td></tr>
            <tr><td>Autres dépenses</td><td className="num down">{euro(money.autresDepenses)}</td></tr>
            <tr className="sep"><td><b>Total dépenses</b></td><td className="num down"><b>{euro(money.totalDepenses)}</b></td></tr>
            <tr className="sep big"><td><b>Solde prévisionnel</b></td><td className={`num ${soldePos ? "up" : "down"}`}><b>{euro(money.soldePrevisionnel)}</b></td></tr>
          </tbody>
        </table>
        <p className="hint">Renseigne les montants dans l'onglet <b>Finances</b> · suis les encaissements dans <b>Cotisations</b>.</p>
      </Card>
    </div>
  );
}
function BigMoney({ label, value, tone, strong }: { label: string; value: number; tone: "up" | "down" | "warn" | "neutral"; strong?: boolean }) {
  return (
    <div className={`bigmoney ${tone} ${strong ? "strong" : ""}`}>
      <div className="bm-v">{euro(value)}</div>
      <div className="bm-l">{label}</div>
    </div>
  );
}
function VisionCell({ big, label }: { big: number; label: string }) {
  return (
    <div className="vcell">
      <div className="vbig">{big}</div>
      <div className="vlab">{label}</div>
    </div>
  );
}

/* ===================================================================== */
/* 2. FINANCES                                                           */
/* ===================================================================== */
function Finances({ data, money, patch }: { data: AppData; money: Money; patch: (p: Partial<AppData>) => void }) {
  const f = data.finance;

  const save = async (next: FinanceState) => {
    patch({ finance: next });
    try {
      await writeFinance(next);
    } catch {
      /* best-effort */
    }
  };

  const setTier = (id: string, p: Partial<LicenseTier>) => save({ ...f, tiers: f.tiers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const addTier = () => save({ ...f, tiers: [...f.tiers, { id: uid("tier"), label: "Nouvelle catégorie", socle: 0, extension: 0, cotisation: 0 }] });
  const delTier = (id: string) => save({ ...f, tiers: f.tiers.filter((t) => t.id !== id) });
  const setExpense = (id: string, p: Partial<Expense>) => save({ ...f, expenses: f.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const addExpense = () => save({ ...f, expenses: [...f.expenses, { id: uid("dep"), label: "", amount: 0 }] });
  const delExpense = (id: string) => save({ ...f, expenses: f.expenses.filter((e) => e.id !== id) });
  const setIncome = (id: string, p: Partial<Income>) => save({ ...f, extraIncome: f.extraIncome.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const addIncome = () => save({ ...f, extraIncome: [...f.extraIncome, { id: uid("rec"), label: "", amount: 0 }] });
  const delIncome = (id: string) => save({ ...f, extraIncome: f.extraIncome.filter((e) => e.id !== id) });

  return (
    <div className="grid">
      <Card title="Affiliation" sub="Affiliation annuelle du club à la fédération." section="finances">
        <div className="inline-field">
          <label>Montant de l'affiliation</label>
          <div className="euro-inp">
            <input type="number" value={f.affiliation} onChange={(e) => save({ ...f, affiliation: n(e.target.value) })} />
            <span>€</span>
          </div>
        </div>
      </Card>

      <Card
        title="Licences — socles, extensions & cotisations"
        sub="Pour chaque catégorie : coût fédéral (socle + extension) et prix de cotisation facturé. Le CA se calcule automatiquement."
        right={<button className="btn ghost" onClick={addTier}>+ Catégorie</button>}
      >
        <div className="t-wrap">
          <table className="t tiers">
            <thead>
              <tr><th>Catégorie</th><th>Socle €</th><th>Extension €</th><th>Coût/licence</th><th>Cotisation €</th><th>Marge/licence</th><th></th></tr>
            </thead>
            <tbody>
              {f.tiers.map((t) => {
                const cost = (t.socle || 0) + (t.extension || 0);
                const margin = (t.cotisation || 0) - cost;
                return (
                  <tr key={t.id}>
                    <td><input className="cell" value={t.label} onChange={(e) => setTier(t.id, { label: e.target.value })} /></td>
                    <td><input className="cell num-i" type="number" value={t.socle} onChange={(e) => setTier(t.id, { socle: n(e.target.value) })} /></td>
                    <td><input className="cell num-i" type="number" value={t.extension} onChange={(e) => setTier(t.id, { extension: n(e.target.value) })} /></td>
                    <td className="num down">{euro(cost)}</td>
                    <td><input className="cell num-i" type="number" value={t.cotisation} onChange={(e) => setTier(t.id, { cotisation: n(e.target.value) })} /></td>
                    <td className={`num ${margin >= 0 ? "up" : "down"}`}>{euro(margin)}</td>
                    <td><button className="x" onClick={() => delTier(t.id)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Assigne chaque licencié à une catégorie dans l'onglet <b>Cotisations</b>.</p>
      </Card>

      <Card title="Dépenses" sub="Tout ce que le club doit payer (arbitrage, équipement, salle, déplacements...)." right={<button className="btn ghost" onClick={addExpense}>+ Dépense</button>} section="finances-depenses">
        <LineEditor lines={f.expenses} onLabel={(id, v) => setExpense(id, { label: v })} onAmount={(id, v) => setExpense(id, { amount: v })} onDel={delExpense} total={money.autresDepenses} tone="down" />
      </Card>

      <Card title="Autres recettes" sub="Subventions, sponsors, buvette, tournois..." right={<button className="btn ghost" onClick={addIncome}>+ Recette</button>}>
        <LineEditor lines={f.extraIncome} onLabel={(id, v) => setIncome(id, { label: v })} onAmount={(id, v) => setIncome(id, { amount: v })} onDel={delIncome} total={money.extraIncome} tone="up" />
      </Card>
    </div>
  );
}

function LineEditor({
  lines,
  onLabel,
  onAmount,
  onDel,
  total,
  tone,
}: {
  lines: { id: string; label: string; amount: number }[];
  onLabel: (id: string, v: string) => void;
  onAmount: (id: string, v: number) => void;
  onDel: (id: string) => void;
  total: number;
  tone: "up" | "down";
}) {
  if (!lines.length) return <p className="empty">Aucune ligne. Clique sur « + » en haut à droite.</p>;
  return (
    <table className="t">
      <tbody>
        {lines.map((l) => (
          <tr key={l.id}>
            <td><input className="cell" placeholder="Libellé" value={l.label} onChange={(e) => onLabel(l.id, e.target.value)} /></td>
            <td style={{ width: 130 }}>
              <div className="euro-inp sm">
                <input type="number" value={l.amount} onChange={(e) => onAmount(l.id, n(e.target.value))} />
                <span>€</span>
              </div>
            </td>
            <td style={{ width: 36 }}><button className="x" onClick={() => onDel(l.id)}>✕</button></td>
          </tr>
        ))}
        <tr className="sep"><td><b>Total</b></td><td className={`num ${tone}`}><b>{euro(total)}</b></td><td></td></tr>
      </tbody>
    </table>
  );
}

/* ===================================================================== */
/* 4. COACHS                                                              */
/* ===================================================================== */
function Coachs({ data, patch, reload }: { data: AppData; patch: (p: Partial<AppData>) => void; reload: () => Promise<void> }) {
  const { teams, coaches, sub, coachSessions } = data;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const seats = sub?.seats ?? 0;
  const used = coaches.length;

  const invite = async () => {
    if (!name.trim() && !email.trim()) return;
    if (seats && used >= seats) {
      alert("Plus de place disponible dans ton abonnement. Augmente le nombre de sièges dans l'onglet Abonnement.");
      return;
    }
    setBusy(true);
    const coachName = name.trim() || email.trim();
    const coachEmail = email.trim();
    try {
      await upsertCoach({
        id: uid("coach"),
        name: coachName,
        email: coachEmail,
        status: "invited",
        teamIds: [],
        invitedAt: new Date().toISOString(),
      });
      await createCoachInvitation({ name: coachName, email: coachEmail });
      if (coachEmail) {
        await sendClubEmail({
          kind: "info",
          subject: "Invitation à rejoindre le club sur MyBasket",
          message: `Bonjour ${coachName},\n\nTu es invité(e) à rejoindre l'espace du club sur MyBasket. Connecte-toi avec cette adresse e-mail pour accéder à ton espace coach.`,
          recipients: [coachEmail],
        });
      }
    } catch (e: any) {
      alert(e?.message || "Invitation impossible.");
    }
    setName("");
    setEmail("");
    setBusy(false);
    await reload();
  };

  const toggleTeam = async (c: Coach, teamId: string) => {
    const has = c.teamIds.includes(teamId);
    const teamIds = has ? c.teamIds.filter((id) => id !== teamId) : [...c.teamIds, teamId];
    const updated: Coach = { ...c, teamIds };
    patch({ coaches: coaches.map((x) => (x.id === c.id ? updated : x)) });
    try {
      await upsertCoach(updated);
    } catch {
      /* best-effort */
    }
    await reload();
  };
  const setActive = async (c: Coach) => {
    const updated: Coach = { ...c, status: "active" };
    patch({ coaches: coaches.map((x) => (x.id === c.id ? updated : x)) });
    try {
      await upsertCoach(updated);
    } catch {
      /* best-effort */
    }
    await reload();
  };
  const remove = async (c: Coach) => {
    if (!confirm(`Retirer ${c.name} du club ?`)) return;
    patch({ coaches: coaches.filter((x) => x.id !== c.id) });
    try {
      await deleteCoach(c.id);
    } catch {
      /* best-effort */
    }
    await reload();
  };

  return (
    <div className="grid">
      <Card title="Inviter un coach" sub="Une invitation crée une pastille coach. Il rejoint le club via ton abonnement." right={<span className="seats">{seats ? `${used}/${seats} sièges` : `${used} coach${used > 1 ? "s" : ""}`}</span>}>
        <div className="invite-row">
          <input className="cell" placeholder="Nom du coach" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="cell" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary" onClick={invite} disabled={busy}>{busy ? "Invitation…" : "Inviter"}</button>
        </div>
        {seats > 0 && used >= seats && <p className="doc-err">Sièges épuisés — passe par l'onglet Abonnement pour en ajouter.</p>}
      </Card>

      {coaches.length === 0 ? (
        <Card title="Coachs liés"><p className="empty">Aucun coach pour le moment. Invite ton premier coach ci-dessus.</p></Card>
      ) : (
        <div className="coach-grid">
          {coaches.map((c) => {
            const myTeams = teams.filter((t) => c.teamIds.includes(t.id));
            const nbPlayers = myTeams.reduce((s, t) => s + t.players.length, 0);
            const nbSeances = coachSessions[c.id] ?? 0;
            return (
              <section key={c.id} className="coach-card">
                <div className="coach-top">
                  <div className="coach-avatar">{c.name.slice(0, 1).toUpperCase()}</div>
                  <div className="coach-id">
                    <div className="coach-name">{c.name}</div>
                    <div className="coach-mail">{c.email || "—"}</div>
                  </div>
                  <span className={`pill ${c.status === "active" ? "paid" : "partial"}`}>{c.status === "active" ? "Actif" : "Invité"}</span>
                </div>
                <div className="coach-stats">
                  <div><b>{myTeams.length}</b><span>équipe{myTeams.length > 1 ? "s" : ""}</span></div>
                  <div><b>{nbPlayers}</b><span>joueurs</span></div>
                  <div><b>{nbSeances}</b><span>séances</span></div>
                </div>
                <div className="coach-teams">
                  <div className="ct-label">Équipes rattachées</div>
                  <div className="ct-chips">
                    {teams.length === 0 && <span className="muted">Aucune équipe dans le club.</span>}
                    {teams.map((t) => (
                      <button key={t.id} className={`chip ${c.teamIds.includes(t.id) ? "on" : ""}`} onClick={() => toggleTeam(c, t.id)}>{t.name}</button>
                    ))}
                  </div>
                </div>
                <div className="coach-actions">
                  {c.status !== "active" && <button className="btn ghost sm" onClick={() => setActive(c)}>Marquer actif</button>}
                  {myTeams[0] && <a className="btn ghost sm" href={`/equipes/${myTeams[0].id}`}>Vue compte coach →</a>}
                  <DocDrop section={`coach-${c.id}`} compact />
                  <button className="btn danger sm" onClick={() => remove(c)}>Retirer</button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===================================================================== */
/* 5. ÉQUIPES DU CLUB                                                     */
/* ===================================================================== */
function Equipes({ teams }: { teams: Team[] }) {
  if (!teams.length)
    return (
      <div className="grid">
        <Card title="Équipes du club"><p className="empty">Aucune équipe. Les équipes créées par tes coachs apparaîtront ici automatiquement.</p></Card>
      </div>
    );
  return (
    <div className="grid">
      <Card title="Équipes du club" sub="Toutes les équipes créées par tes coachs, rattachées au club.">
        <div className="team-grid">
          {teams.map((t) => (
            <div key={t.id} className="team-card">
              <div className="team-top">
                <div className="team-shield">🛡️</div>
                <div>
                  <div className="team-name">{t.name}</div>
                  <div className="team-meta">{[t.category, t.gender].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              </div>
              <div className="team-stats">
                <div><b>{t.players.length}</b><span>joueurs</span></div>
                <div><b>{t.coach || "—"}</b><span>coach</span></div>
              </div>
              <div className="team-actions">
                <a className="btn ghost sm" href={`/equipes/${t.id}`}>Ouvrir (vue coach) →</a>
                <DocDrop section={`equipe-${t.id}`} compact />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ===================================================================== */
/* 6. JOUEURS                                                             */
/* ===================================================================== */
function Joueurs({ players }: { players: Player[] }) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const teamsList = useMemo(() => Array.from(new Set(players.map((p) => p.teamName))), [players]);
  const filtered = players.filter((p) => (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!team || p.teamName === team));
  return (
    <div className="grid">
      <Card title={`Joueurs du club (${players.length})`} sub="Tous les joueurs créés dans toutes les équipes par tous tes coachs.">
        <div className="filters">
          <input className="cell" placeholder="Rechercher un joueur..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="cell" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Toutes les équipes</option>
            {teamsList.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="empty">Aucun joueur trouvé.</p>
        ) : (
          <div className="t-wrap">
            <table className="t">
              <thead><tr><th>#</th><th>Joueur</th><th>Équipe</th><th>Catégorie</th><th>Coach</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.key}>
                    <td className="muted">{p.number ?? "—"}</td>
                    <td><b>{p.name}</b></td>
                    <td>{p.teamName}</td>
                    <td>{p.category || "—"}</td>
                    <td>{p.coach || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================================================================== */
/* 7. COTISATIONS                                                         */
/* ===================================================================== */
function Cotisations({ data, money, patch }: { data: AppData; money: Money; patch: (p: Partial<AppData>) => void }) {
  const { players, finance, coti } = data;
  const [filter, setFilter] = useState<"all" | CotiStatus>("all");

  const setRecord = async (key: string, p: Partial<CotiRecord>) => {
    const cur: CotiRecord = coti[key] || { tierId: finance.tiers[0]?.id || "", received: 0, payments: [] };
    const next: CotiState = { ...coti, [key]: { ...cur, ...p } };
    patch({ coti: next });
    try {
      await writeCotisations(next);
    } catch {
      /* best-effort */
    }
  };

  const addCheque = async (p: Player, due: number, received: number) => {
    const rest = Math.max(due - received, 0);
    const raw = prompt(`Montant reçu de ${p.name} (chèque, espèces...) :`, rest ? String(rest) : "");
    if (raw == null) return;
    const amount = n(raw);
    if (amount <= 0) return;
    const cur = coti[p.key] || { tierId: finance.tiers[0]?.id || "", received: 0, payments: [] };
    await setRecord(p.key, {
      received: (cur.received || 0) + amount,
      payments: [...(cur.payments || []), { id: uid("pay"), amount, date: new Date().toISOString() }],
    });
  };

  const rows = players.map((p) => {
    const tier = tierForPlayer(p, coti, finance);
    const rec = coti[p.key];
    const due = tier?.cotisation || 0;
    const received = rec?.received || 0;
    return { p, tier, due, received, status: cotiStatus(received, due) };
  });
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const counts = {
    paid: rows.filter((r) => r.status === "paid").length,
    partial: rows.filter((r) => r.status === "partial").length,
    unpaid: rows.filter((r) => r.status === "unpaid").length,
  };

  return (
    <div className="grid">
      <div className="money-row">
        <BigMoney label="Total dû" value={totalDue} tone="neutral" />
        <BigMoney label="Encaissé" value={money.encaisse} tone="up" strong />
        <BigMoney label="Reste à encaisser" value={money.resteAEncaisser} tone="warn" />
      </div>

      <Card
        title="Suivi des cotisations"
        sub="Vert = payé · Jaune = en cours · Rouge = impayé. Mets à jour en un clic quand un coach te remet un chèque."
        section="cotisations"
        right={
          <div className="seg">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Tous ({rows.length})</button>
            <button className={`g ${filter === "paid" ? "on" : ""}`} onClick={() => setFilter("paid")}>Payés ({counts.paid})</button>
            <button className={`y ${filter === "partial" ? "on" : ""}`} onClick={() => setFilter("partial")}>En cours ({counts.partial})</button>
            <button className={`r ${filter === "unpaid" ? "on" : ""}`} onClick={() => setFilter("unpaid")}>Impayés ({counts.unpaid})</button>
          </div>
        }
      >
        {players.length === 0 ? (
          <p className="empty">Aucun licencié. Les joueurs créés par tes coachs apparaîtront ici.</p>
        ) : (
          <div className="t-wrap">
            <table className="t coti">
              <thead><tr><th></th><th>Licencié</th><th>Équipe</th><th>Catégorie</th><th>Dû</th><th>Reçu</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.p.key} className={`row-${r.status}`}>
                    <td><span className={`dot ${r.status}`} /></td>
                    <td><b>{r.p.name}</b></td>
                    <td className="muted">{r.p.teamName}</td>
                    <td>
                      <select className="cell mini" value={r.tier?.id || ""} onChange={(e) => setRecord(r.p.key, { tierId: e.target.value })}>
                        {finance.tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="num">{euro(r.due)}</td>
                    <td>
                      <div className="euro-inp sm">
                        <input type="number" value={r.received} onChange={(e) => setRecord(r.p.key, { received: n(e.target.value) })} />
                        <span>€</span>
                      </div>
                    </td>
                    <td><StatusPill status={r.status} /></td>
                    <td><button className="btn ghost sm" onClick={() => addCheque(r.p, r.due, r.received)}>+ Chèque</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================================================================== */
/* 8. DOCUMENTS DU CLUB                                                   */
/* ===================================================================== */
const DOC_SECTIONS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "finances", label: "Finances" },
  { key: "finances-depenses", label: "Dépenses" },
  { key: "planning", label: "Planning / Créneaux" },
  { key: "cotisations", label: "Cotisations" },
  { key: "communication", label: "Communication" },
  { key: "club", label: "Documents généraux du club" },
];

function Documents() {
  const { docs } = useContext(DocsCtx);
  const total = Object.values(docs).reduce((s, a) => s + a.length, 0);
  const sections = Array.from(new Set([...DOC_SECTIONS.map((s) => s.key), ...Object.keys(docs)]));
  return (
    <div className="grid">
      <Card title={`Documents du club (${total})`} sub="Dépose un PDF ou une image dans n'importe quelle section. Disponible aussi sur chaque carte (icône 📎).">
        <div className="doc-sections">
          {sections.map((key) => {
            const label = DOC_SECTIONS.find((s) => s.key === key)?.label || key;
            return (
              <div key={key} className="doc-section">
                <div className="ds-head"><span className="ds-title">{label}</span></div>
                <DocDrop section={key} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ===================================================================== */
/* 9. COMMUNICATION                                                       */
/* ===================================================================== */
const KIND_LABEL: Record<CommKind, string> = {
  relance: "Relance de cotisation",
  convocation: "Convocation",
  info: "Information",
  autre: "Autre",
};

function Communication({ data, reload }: { data: AppData; reload: () => Promise<void> }) {
  const { coaches, comms } = data;
  const [kind, setKind] = useState<CommKind>("relance");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const emails = coaches.map((c) => c.email).filter(Boolean);

  const queue = async () => {
    if (!title.trim()) {
      alert("Donne un titre à ta communication.");
      return;
    }
    setSending(true);
    setFeedback("");
    const recipients = coaches.map((c) => c.id);

    // Envoi réel best-effort (n'altère pas le statut stocké, limité à draft|queued)
    const result = await sendClubEmail({ kind, subject: title.trim(), message: message.trim(), recipients: emails });

    try {
      await addComm({
        kind,
        title: title.trim(),
        message: message.trim(),
        docId: null,
        recipients,
        sentAt: new Date().toISOString(),
        status: "queued",
      });
    } catch (e: any) {
      setFeedback(`⚠️ Communication non enregistrée (${e?.message || "erreur"}).`);
      setSending(false);
      return;
    }

    setTitle("");
    setMessage("");
    setSending(false);
    setFeedback(
      result.ok
        ? result.sent > 0
          ? `✅ Envoyé à ${result.sent} coach${result.sent > 1 ? "s" : ""}.`
          : "✅ Enregistré (mode simulation : configure RESEND_API_KEY pour l'envoi réel)."
        : `⚠️ E-mail non envoyé (${result.error}). La communication est enregistrée.`
    );
    await reload();
  };

  return (
    <div className="grid">
      <Card title="Nouvelle communication" sub="Dépose un document et envoie-le à tous tes coachs : relances de cotisation, convocations, infos...">
        <div className="comm-form">
          <div className="comm-kinds">
            {(["relance", "convocation", "info", "autre"] as CommKind[]).map((k) => (
              <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <input className="cell" placeholder="Titre (ex : Relance cotisations — décembre)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="cell ta" placeholder="Message aux coachs (optionnel)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="comm-foot">
            <DocDrop section="communication" />
            <button className="btn primary" onClick={queue} disabled={sending}>{sending ? "Envoi..." : `Envoyer à tous les coachs (${coaches.length})`}</button>
          </div>
          {feedback && <p className="comm-feedback">{feedback}</p>}
          <p className="hint">
            L'envoi part vers <code>/api/club/notify</code> (Resend). Sans <code>RESEND_API_KEY</code>, la communication est enregistrée sans e-mail réel.
            {emails.length === 0 && " Aucun coach n'a d'e-mail renseigné pour l'instant."}
          </p>
        </div>
      </Card>

      <Card title="Historique des envois">
        {comms.length === 0 ? (
          <p className="empty">Aucune communication pour l'instant.</p>
        ) : (
          <ul className="comm-list">
            {comms.map((c) => (
              <li key={c.id}>
                <span className={`tag k-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                <div className="comm-body">
                  <b>{c.title}</b>
                  {c.message && <p>{c.message}</p>}
                  <span className="comm-meta">
                    {new Date(c.sentAt).toLocaleString("fr-FR")} · {c.recipients.length} coach{c.recipients.length > 1 ? "s" : ""} ·{" "}
                    {c.status === "draft" ? "Brouillon" : "En file"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ===================================================================== */
/* 10. ABONNEMENT                                                         */
/* ===================================================================== */
function Abonnement({ sub, coaches }: { sub: Subscription | null; coaches: Coach[] }) {
  return (
    <div className="grid">
      <Card title="Mon abonnement" sub="L'abonnement détermine notamment le nombre de coachs que tu peux inviter.">
        {sub ? (
          <div className="sub-box">
            <div className="sub-plan">{sub.plan}</div>
            <div className="sub-meta">
              {sub.status && <span className={`pill ${sub.status === "active" ? "paid" : "partial"}`}>{sub.status}</span>}
              {typeof sub.seats === "number" && <span className="seats">{coaches.length}/{sub.seats} sièges coach utilisés</span>}
            </div>
            <a className="btn ghost" href="/abonnements">Gérer mon abonnement →</a>
          </div>
        ) : (
          <div className="sub-box">
            <p className="empty">Aucun abonnement détecté.</p>
            <a className="btn primary" href="/abonnements">Voir les abonnements →</a>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================================================================== */
/* STYLES (design inchangé)                                               */
/* ===================================================================== */
function Styles() {
  return (
    <style jsx global>{`
      .club {
        --bordeaux: #6b1a2c;
        --or: #d4a24c;
        --noir: #0f0f12;
        --gris: #6f6f6f;
        --bg: #f6f4f1;
        --line: #e7e1da;
        --up: #2f8f57;
        --down: #c0392b;
        --warn: #c8901f;
        font-family: "Roboto", system-ui, sans-serif;
        color: var(--noir);
        background: var(--bg);
        min-height: 100%;
      }
      .club * { box-sizing: border-box; }

      .club-head { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; padding: 22px 26px; background: linear-gradient(120deg, var(--noir), #1c1c22); color: #fff; border-bottom: 3px solid var(--or); }
      .club-head-l { display: flex; align-items: center; gap: 16px; }
      .club-badge { width: 54px; height: 54px; border-radius: 14px; display: grid; place-items: center; font-size: 28px; background: var(--bordeaux); border: 2px solid var(--or); }
      .club-name { font-family: "Alfa Slab One", "Roboto", sans-serif; font-size: 26px; color: #fff; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 2px 2px; max-width: 320px; }
      .club-name:focus { outline: none; border-bottom-color: var(--or); }
      .club-season { color: var(--or); font-size: 13px; letter-spacing: .5px; margin-top: 2px; }
      .club-kpis { display: flex; gap: 10px; flex-wrap: wrap; }
      .kchip { background: rgba(255,255,255,.06); border: 1px solid rgba(212,162,76,.35); border-radius: 12px; padding: 8px 16px; text-align: center; min-width: 78px; }
      .kchip-v { font-family: "Alfa Slab One", sans-serif; font-size: 22px; color: var(--or); line-height: 1; }
      .kchip-l { font-size: 11px; color: #cfc9c2; margin-top: 4px; text-transform: uppercase; letter-spacing: .4px; }

      .club-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
      .club-tab { white-space: nowrap; border: 1px solid transparent; background: transparent; cursor: pointer; padding: 9px 14px; border-radius: 999px; font-size: 14px; color: var(--gris); font-weight: 600; display: flex; align-items: center; gap: 7px; transition: .15s; }
      .club-tab .ico { font-size: 15px; }
      .club-tab:hover { background: #f3eee9; color: var(--noir); }
      .club-tab.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }

      .club-main { padding: 24px; max-width: 1180px; margin: 0 auto; }
      .grid { display: grid; gap: 18px; }
      .loading { text-align: center; color: var(--gris); padding: 60px 0; font-size: 15px; }
      .banner { padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; font-size: 14px; display: flex; align-items: center; gap: 12px; }
      .banner.err { background: #fae5e2; color: var(--down); }

      .card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; }
      .card-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
      .card-h h3 { font-family: "Alfa Slab One", sans-serif; font-size: 17px; margin: 0; color: var(--noir); }
      .card-sub { margin: 4px 0 0; color: var(--gris); font-size: 13px; max-width: 640px; }
      .card-h-r { display: flex; align-items: center; gap: 10px; }
      .hint { font-size: 12.5px; color: var(--gris); margin: 12px 0 0; }
      .hint code, .empty code { background: #f1ece6; padding: 1px 6px; border-radius: 5px; font-size: 12px; }
      .empty { color: var(--gris); font-size: 14px; padding: 8px 0; }
      .muted { color: var(--gris); }

      .money-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      .bigmoney { border-radius: 16px; padding: 18px 20px; border: 1px solid var(--line); background: #fff; }
      .bigmoney.strong { background: linear-gradient(120deg, var(--bordeaux), #4a1220); color: #fff; border-color: var(--bordeaux); }
      .bigmoney.strong .bm-l { color: rgba(255,255,255,.8); }
      .bm-v { font-family: "Alfa Slab One", sans-serif; font-size: 26px; line-height: 1; }
      .bigmoney.up .bm-v { color: var(--up); }
      .bigmoney.down .bm-v { color: var(--down); }
      .bigmoney.warn .bm-v { color: var(--warn); }
      .bigmoney.strong .bm-v { color: #fff; }
      .bm-l { font-size: 12px; color: var(--gris); margin-top: 6px; text-transform: uppercase; letter-spacing: .5px; }

      .vision { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
      .vcell { background: #faf7f3; border: 1px solid var(--line); border-radius: 12px; padding: 16px; text-align: center; }
      .vbig { font-family: "Alfa Slab One", sans-serif; font-size: 30px; color: var(--bordeaux); line-height: 1; }
      .vlab { font-size: 12px; color: var(--gris); margin-top: 6px; }

      .t-wrap { overflow-x: auto; }
      .t { width: 100%; border-collapse: collapse; font-size: 14px; }
      .t th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--gris); padding: 8px 10px; border-bottom: 1px solid var(--line); }
      .t td { padding: 8px 10px; border-bottom: 1px solid #f1ece6; }
      .t tr.sep td { border-top: 2px solid var(--line); }
      .t tr.big td { font-size: 15px; }
      .t .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .num.up { color: var(--up); }
      .num.down { color: var(--down); }
      .tiers th:nth-child(n+2) { text-align: right; }

      .cell { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; font-size: 14px; font-family: inherit; background: #fff; }
      .cell:focus { outline: none; border-color: var(--or); }
      .cell.num-i { text-align: right; }
      .cell.mini { padding: 4px 6px; font-size: 12.5px; }
      .ta { min-height: 76px; resize: vertical; }

      .euro-inp { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; }
      .euro-inp input { border: none; padding: 7px 9px; width: 100%; text-align: right; font-family: inherit; font-size: 14px; }
      .euro-inp input:focus { outline: none; }
      .euro-inp span { padding: 0 9px; color: var(--gris); background: #f7f2ec; align-self: stretch; display: grid; place-items: center; }
      .euro-inp.sm input { padding: 5px 7px; }
      .inline-field { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .inline-field label { font-weight: 600; }
      .inline-field .euro-inp { width: 180px; }

      .btn { border: 1px solid var(--line); background: #fff; border-radius: 9px; padding: 8px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: .15s; text-decoration: none; color: var(--noir); display: inline-flex; align-items: center; gap: 6px; }
      .btn:hover { border-color: var(--or); }
      .btn.sm { padding: 5px 10px; font-size: 12.5px; }
      .btn.primary { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }
      .btn.primary:hover { background: #571423; }
      .btn.ghost { background: #faf7f3; }
      .btn.danger { color: var(--down); border-color: #f1d3cf; background: #fdf3f1; }
      .btn[disabled] { opacity: .6; cursor: default; }
      .x { border: none; background: transparent; color: var(--gris); cursor: pointer; font-size: 14px; padding: 4px; }
      .x:hover { color: var(--down); }

      .pill { font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
      .pill.paid { background: #e3f4ea; color: var(--up); }
      .pill.partial { background: #fbf2dc; color: var(--warn); }
      .pill.unpaid { background: #fae5e2; color: var(--down); }
      .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
      .dot.paid { background: var(--up); }
      .dot.partial { background: var(--warn); }
      .dot.unpaid { background: var(--down); }
      .row-unpaid td { background: #fdf6f5; }
      .row-partial td { background: #fdfaf0; }

      .chip { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer; font-family: inherit; color: var(--gris); }
      .chip.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }
      .chip:hover { border-color: var(--or); }

      .seg { display: inline-flex; gap: 4px; flex-wrap: wrap; }
      .seg button { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 5px 10px; font-size: 12.5px; cursor: pointer; font-family: inherit; color: var(--gris); }
      .seg button.on { background: var(--noir); color: #fff; border-color: var(--noir); }
      .seg button.g.on { background: var(--up); border-color: var(--up); }
      .seg button.y.on { background: var(--warn); border-color: var(--warn); }
      .seg button.r.on { background: var(--down); border-color: var(--down); }

      .filters { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
      .filters .cell { max-width: 280px; }

      .docdrop.compact { display: inline-block; }
      .doc-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px dashed var(--or); background: #fffaf1; color: #8a6a2a; border-radius: 9px; padding: 7px 12px; font-size: 13px; cursor: pointer; font-weight: 600; }
      .doc-btn:hover { background: #fdf3df; }
      .doc-count { background: var(--bordeaux); color: #fff; border-radius: 999px; font-size: 11px; padding: 1px 7px; }
      .doc-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
      .doc-list li { display: flex; align-items: center; gap: 10px; font-size: 13px; background: #faf7f3; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
      .doc-list a { color: var(--noir); text-decoration: none; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .doc-size { color: var(--gris); font-size: 11px; }
      .doc-err { color: var(--down); font-size: 12.5px; margin: 8px 0 0; }
      .doc-sections { display: grid; gap: 14px; }
      .doc-section { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: #faf7f3; }
      .ds-title { font-weight: 700; font-size: 14px; }
      .ds-head { margin-bottom: 8px; }

      .creneaux-frame { width: 100%; height: 70vh; min-height: 460px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #fff; }
      .creneaux-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
      .creneaux-foot { margin-top: 10px; display: flex; justify-content: flex-end; }

      .seats { font-size: 12.5px; color: var(--gris); font-weight: 600; }
      .invite-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .invite-row .cell { flex: 1; min-width: 160px; }
      .coach-grid, .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; }
      .coach-card, .team-card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
      .coach-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .coach-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--bordeaux); color: var(--or); display: grid; place-items: center; font-family: "Alfa Slab One", sans-serif; font-size: 20px; }
      .coach-id { flex: 1; }
      .coach-name { font-weight: 700; }
      .coach-mail { font-size: 12.5px; color: var(--gris); }
      .coach-stats, .team-stats { display: flex; gap: 8px; margin-bottom: 14px; }
      .coach-stats > div, .team-stats > div { flex: 1; background: #faf7f3; border-radius: 10px; padding: 9px; text-align: center; }
      .coach-stats b, .team-stats b { display: block; font-family: "Alfa Slab One", sans-serif; font-size: 18px; color: var(--bordeaux); }
      .coach-stats span, .team-stats span { font-size: 11px; color: var(--gris); }
      .ct-label { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--gris); margin-bottom: 6px; }
      .ct-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
      .ct-chips .chip { font-size: 12px; padding: 4px 10px; }
      .ct-chips .chip.on { background: var(--up); border-color: var(--up); }
      .coach-actions, .team-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

      .team-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .team-shield { width: 44px; height: 44px; border-radius: 12px; background: #faf7f3; border: 1px solid var(--line); display: grid; place-items: center; font-size: 22px; }
      .team-name { font-weight: 700; }
      .team-meta { font-size: 12.5px; color: var(--gris); }

      .comm-form { display: grid; gap: 12px; }
      .comm-kinds { display: flex; gap: 8px; flex-wrap: wrap; }
      .comm-foot { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
      .comm-feedback { font-size: 13.5px; font-weight: 600; margin: 4px 0 0; color: var(--noir); }
      .comm-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      .comm-list li { display: flex; gap: 12px; background: #faf7f3; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
      .tag { font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 8px; height: fit-content; white-space: nowrap; }
      .k-relance { background: #fae5e2; color: var(--down); }
      .k-convocation { background: #e3eefb; color: #2b5fa8; }
      .k-info { background: #fbf2dc; color: var(--warn); }
      .k-autre { background: #eee; color: var(--gris); }
      .comm-body { flex: 1; }
      .comm-body p { margin: 4px 0 0; font-size: 13px; color: #444; }
      .comm-meta { font-size: 11.5px; color: var(--gris); display: block; margin-top: 6px; }

      .sub-box { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
      .sub-plan { font-family: "Alfa Slab One", sans-serif; font-size: 24px; color: var(--bordeaux); }
      .sub-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

      @media (max-width: 720px) {
        .money-row { grid-template-columns: 1fr; }
        .club-main { padding: 16px; }
      }
    `}</style>
  );
}