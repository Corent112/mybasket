"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";
import type { PlayerCotisation } from "@/lib/club-cotisations";
import {
  createFinanceEntry,
  createSponsor,
  deleteFinanceEntry,
  deleteSponsor,
  financeByCategory,
  financeByMonth,
  getFinanceWorkspace,
  updateFinanceEntry,
  updateSponsor,
  type ClubSponsor,
  type FinanceEntry,
  type FinanceEntryType,
  type FinanceSummaryPro,
} from "@/lib/club-finance-pro";

const TABS = [
  "Dashboard",
  "Recettes",
  "Dépenses",
  "Sponsors",
  "Cotisations",
  "Export",
] as const;

const INCOME_CATEGORIES = [
  "Sponsor",
  "Subvention",
  "Stage",
  "Tournoi",
  "Buvette",
  "Boutique",
  "Don",
  "Autre",
];

const EXPENSE_CATEGORIES = [
  "Salle",
  "Matériel",
  "Arbitrage",
  "Transport",
  "Hébergement",
  "Tournoi",
  "Communication",
  "Autre",
];

function euros(cents: number) {
  return `${(cents / 100).toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  })} €`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function amountToInput(cents: number) {
  return String((cents || 0) / 100).replace(".", ",");
}

function inputToCents(value: string) {
  return Math.round(Number(value.replace(",", ".") || 0) * 100);
}

export default function ClubFinanceProSection({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Dashboard");
  const [summary, setSummary] = useState<FinanceSummaryPro | null>(null);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [sponsors, setSponsors] = useState<ClubSponsor[]>([]);
  const [cotisations, setCotisations] = useState<PlayerCotisation[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<FinanceEntryType>("income");
  const [category, setCategory] = useState("Sponsor");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [supplier, setSupplier] = useState("");
  const [customer, setCustomer] = useState("");

  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorAmount, setSponsorAmount] = useState("");
  const [sponsorSeason, setSponsorSeason] = useState("2026-2027");

  async function load() {
    setError("");

    try {
      const data = await getFinanceWorkspace(clubId);
      setSummary(data.summary);
      setEntries(data.entries);
      setSponsors(data.sponsors);
      setCotisations(data.cotisations);
      setPlayers(data.players);
      setTeams(data.teams);
    } catch (e: any) {
      setError(e?.message || "Finance impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const incomeByCategory = useMemo(
    () => financeByCategory(entries, "income"),
    [entries]
  );

  const expenseByCategory = useMemo(
    () => financeByCategory(entries, "expense"),
    [entries]
  );

  const byMonth = useMemo(() => financeByMonth(entries), [entries]);

  const unpaidCotisations = useMemo(() => {
    return cotisations.filter((cotisation) => cotisation.remainingCents > 0);
  }, [cotisations]);

  function resetEntryForm(nextType: FinanceEntryType = entryType) {
    setEditingEntryId(null);
    setEntryType(nextType);
    setCategory(nextType === "income" ? "Sponsor" : "Salle");
    setTitle("");
    setAmount("");
    setEntryDate(today());
    setSupplier("");
    setCustomer("");
  }

  function editEntry(entry: FinanceEntry) {
    setEditingEntryId(entry.id);
    setEntryType(entry.entryType);
    setCategory(entry.category);
    setTitle(entry.title);
    setAmount(amountToInput(entry.amountCents));
    setEntryDate(entry.entryDate || today());
    setSupplier(entry.supplier || "");
    setCustomer(entry.customer || "");
    setTab(entry.entryType === "income" ? "Recettes" : "Dépenses");
    setMessage("");
    setError("");
  }

  async function removeEntry(entry: FinanceEntry) {
    const ok = window.confirm(
      `Supprimer "${entry.title}" ?\n\nCette action est définitive.`
    );

    if (!ok) return;

    try {
      await deleteFinanceEntry(clubId, entry.id);
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      setMessage("Écriture supprimée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    }
  }

  async function saveEntry() {
    setError("");
    setMessage("");

    try {
      const payload = {
        clubId,
        entryType,
        category,
        title: title || category,
        amountCents: inputToCents(amount),
        entryDate,
        supplier,
        customer,
      };

      if (editingEntryId) {
        await updateFinanceEntry(editingEntryId, payload);
        setMessage("Écriture modifiée.");
      } else {
        await createFinanceEntry(payload);
        setMessage(entryType === "income" ? "Recette créée." : "Dépense créée.");
      }

      resetEntryForm(entryType);
      await load();
    } catch (e: any) {
      setError(e?.message || "Écriture non sauvegardée.");
    }
  }

  function resetSponsorForm() {
    setEditingSponsorId(null);
    setSponsorName("");
    setSponsorAmount("");
    setSponsorSeason("2026-2027");
  }

  function editSponsor(sponsor: ClubSponsor) {
    setEditingSponsorId(sponsor.id);
    setSponsorName(sponsor.name);
    setSponsorAmount(amountToInput(sponsor.amountCents));
    setSponsorSeason(sponsor.season || "2026-2027");
    setTab("Sponsors");
    setMessage("");
    setError("");
  }

  async function removeSponsor(sponsor: ClubSponsor) {
    const ok = window.confirm(
      `Supprimer le sponsor "${sponsor.name}" ?\n\nCette action est définitive.`
    );

    if (!ok) return;

    try {
      await deleteSponsor(clubId, sponsor.id);
      setSponsors((prev) => prev.filter((item) => item.id !== sponsor.id));
      setMessage("Sponsor supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression du sponsor impossible.");
    }
  }

  async function saveSponsor() {
    setError("");
    setMessage("");

    try {
      const payload = {
        clubId,
        name: sponsorName,
        amountCents: inputToCents(sponsorAmount),
        season: sponsorSeason,
      };

      if (editingSponsorId) {
        await updateSponsor(editingSponsorId, payload);
        setMessage("Sponsor modifié.");
      } else {
        await createSponsor(payload);
        setMessage("Sponsor ajouté.");
      }

      resetSponsorForm();
      await load();
    } catch (e: any) {
      setError(e?.message || "Sponsor non sauvegardé.");
    }
  }

  return (
    <section className="finance">
      <div className="top">
        <div>
          <p>FINANCE</p>
          <h2>Centre Financier Pro</h2>
          <span>
            Recettes, dépenses, cotisations, sponsors et export comptable.
          </span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <nav>
        {TABS.map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab === "Dashboard" && (
        <div className="dashboard">
          <div className="hero">
            <p>Solde estimé saison</p>
            <strong>{euros(summary?.balanceCents ?? 0)}</strong>
            <span>
              Entrées - sorties, incluant cotisations encaissées et sponsors
              actifs.
            </span>
          </div>

          <div className="kpis">
            <b>
              {euros(summary?.totalIncomeCents ?? 0)}
              <small>recettes totales</small>
            </b>
            <b>
              {euros(summary?.expensesCents ?? 0)}
              <small>dépenses</small>
            </b>
            <b>
              {euros(summary?.cotisationsPaidCents ?? 0)}
              <small>cotisations encaissées</small>
            </b>
            <b>
              {euros(summary?.cotisationsRemainingCents ?? 0)}
              <small>reste cotisations</small>
            </b>
            <b>
              {euros(summary?.sponsorsCents ?? 0)}
              <small>sponsors</small>
            </b>
            <b>
              {summary?.unpaidCount ?? 0}
              <small>joueurs à relancer</small>
            </b>
          </div>

          <div className="panels">
            <article className="panel">
              <h3>Recettes par catégorie</h3>
              {incomeByCategory.map((item) => (
                <div className="line" key={item.category}>
                  <span>{item.category}</span>
                  <b>{euros(item.amountCents)}</b>
                </div>
              ))}
            </article>

            <article className="panel">
              <h3>Dépenses par catégorie</h3>
              {expenseByCategory.map((item) => (
                <div className="line" key={item.category}>
                  <span>{item.category}</span>
                  <b>{euros(item.amountCents)}</b>
                </div>
              ))}
            </article>

            <article className="panel wide">
              <h3>Trésorerie mensuelle</h3>
              {byMonth.map((item) => (
                <div className="month" key={item.month}>
                  <span>{item.month}</span>
                  <b>{euros(item.income)}</b>
                  <b>{euros(item.expense)}</b>
                  <strong>{euros(item.balance)}</strong>
                </div>
              ))}
            </article>
          </div>
        </div>
      )}

      {(tab === "Recettes" || tab === "Dépenses") && (
        <div className="layout">
          <aside className="form">
            <h3>
              {editingEntryId
                ? "Modifier l’écriture"
                : tab === "Recettes"
                ? "Nouvelle recette"
                : "Nouvelle dépense"}
            </h3>

            <label>
              Type
              <select
                value={entryType}
                onChange={(e) => {
                  const next = e.target.value as FinanceEntryType;
                  setEntryType(next);
                  setCategory(next === "income" ? "Sponsor" : "Salle");
                }}
              >
                <option value="income">Recette</option>
                <option value="expense">Dépense</option>
              </select>
            </label>

            <label>
              Catégorie
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(entryType === "income"
                  ? INCOME_CATEGORIES
                  : EXPENSE_CATEGORIES
                ).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              Titre
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <label>
              Montant (€)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>

            <label>
              Date
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </label>

            <label>
              Fournisseur
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </label>

            <label>
              Client / financeur
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </label>

            <div className="formActions">
              <button onClick={saveEntry}>
                {editingEntryId ? "Mettre à jour" : "Créer"}
              </button>

              {editingEntryId && (
                <button className="ghost" onClick={() => resetEntryForm(entryType)}>
                  Annuler
                </button>
              )}
            </div>
          </aside>

          <main className="table">
            <div className="row head">
              <span>Date</span>
              <span>Catégorie</span>
              <span>Titre</span>
              <span>Montant</span>
              <span>Statut</span>
              <span>Actions</span>
            </div>

            {entries
              .filter(
                (entry) =>
                  entry.entryType === (tab === "Recettes" ? "income" : "expense")
              )
              .map((entry) => (
                <div className="row" key={entry.id}>
                  <span>{entry.entryDate}</span>
                  <span>{entry.category}</span>
                  <span>{entry.title}</span>
                  <span>{euros(entry.amountCents)}</span>
                  <span>{entry.status}</span>
                  <span className="actions">
                    <button onClick={() => editEntry(entry)}>Modifier</button>
                    <button className="danger" onClick={() => removeEntry(entry)}>
                      Supprimer
                    </button>
                  </span>
                </div>
              ))}
          </main>
        </div>
      )}

      {tab === "Sponsors" && (
        <div className="layout">
          <aside className="form">
            <h3>{editingSponsorId ? "Modifier sponsor" : "Nouveau sponsor"}</h3>

            <label>
              Nom
              <input
                value={sponsorName}
                onChange={(e) => setSponsorName(e.target.value)}
              />
            </label>

            <label>
              Montant (€)
              <input
                value={sponsorAmount}
                onChange={(e) => setSponsorAmount(e.target.value)}
              />
            </label>

            <label>
              Saison
              <input
                value={sponsorSeason}
                onChange={(e) => setSponsorSeason(e.target.value)}
              />
            </label>

            <div className="formActions">
              <button onClick={saveSponsor}>
                {editingSponsorId ? "Mettre à jour" : "Ajouter"}
              </button>

              {editingSponsorId && (
                <button className="ghost" onClick={resetSponsorForm}>
                  Annuler
                </button>
              )}
            </div>
          </aside>

          <main className="cards">
            {sponsors.map((sponsor) => (
              <article className="card" key={sponsor.id}>
                <strong>{sponsor.name}</strong>
                <span>
                  {euros(sponsor.amountCents)} · {sponsor.season}
                </span>
                <small>{sponsor.status}</small>

                <div className="cardActions">
                  <button onClick={() => editSponsor(sponsor)}>Modifier</button>
                  <button className="danger" onClick={() => removeSponsor(sponsor)}>
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </main>
        </div>
      )}

      {tab === "Cotisations" && (
        <div className="table solo">
          <div className="row cot head">
            <span>Joueur</span>
            <span>Équipe</span>
            <span>Payé</span>
            <span>Reste</span>
            <span>Statut</span>
          </div>

          {unpaidCotisations.map((cotisation) => {
            const player = players.find((p) => p.id === cotisation.playerId);
            const team = teams.find((t) => t.id === cotisation.teamId);

            return (
              <div className="row cot" key={cotisation.id}>
                <span>
                  {player ? `${player.lastName} ${player.firstName}` : "—"}
                </span>
                <span>{team?.name || "—"}</span>
                <span>{euros(cotisation.paidCents)}</span>
                <span>{euros(cotisation.remainingCents)}</span>
                <span>{cotisation.status}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "Export" && (
        <div className="panel export">
          <h3>Export comptable</h3>
          <p>Exporte recettes, dépenses, sponsors et cotisations en CSV.</p>
          <a href={`/api/club/finance/export?clubId=${clubId}`} target="_blank">
            Télécharger CSV
          </a>
        </div>
      )}

      <style jsx>{`
        .finance {
          border: 1px solid #eadfd5;
          border-radius: 28px;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.06);
          font-family: Roboto, system-ui, sans-serif;
        }
        .top {
          padding: 24px;
          background: linear-gradient(135deg, #fff, #fff5e8);
          border-bottom: 1px solid #eadfd5;
        }
        .top p {
          margin: 0 0 6px;
          color: #d4a24c;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
        }
        .top h2 {
          margin: 0;
          color: #6b1a2c;
          font-family: "Alfa Slab One", serif;
          font-weight: 400;
        }
        .top span {
          color: #6b7280;
          font-weight: 700;
        }
        nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          padding: 14px 18px;
          border-bottom: 1px solid #eef2f7;
        }
        button,
        a {
          border: 1px solid #eadfd5;
          background: #6b1a2c;
          color: white;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
        }
        nav button {
          background: #fffaf2;
          color: #6b1a2c;
        }
        nav button.active {
          background: #6b1a2c;
          color: white;
        }
        .ghost {
          background: #fffaf2;
          color: #6b1a2c;
        }
        .danger {
          background: #fee2e2;
          color: #991b1b;
          border-color: #fecaca;
        }
        .alert {
          margin: 16px;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 900;
        }
        .alert.error {
          background: #fff0f0;
          color: #b91c1c;
        }
        .alert.ok {
          background: #f0fff4;
          color: #15803d;
        }
        .dashboard,
        .layout,
        .solo,
        .export {
          padding: 18px;
        }
        .hero {
          border-radius: 28px;
          background: linear-gradient(135deg, #6b1a2c, #35101a);
          color: white;
          padding: 28px;
          margin-bottom: 18px;
        }
        .hero p {
          margin: 0;
          color: #d4a24c;
          font-weight: 900;
          letter-spacing: 0.12em;
        }
        .hero strong {
          display: block;
          font-size: 3rem;
          font-family: "Alfa Slab One", serif;
        }
        .hero span {
          font-weight: 800;
        }
        .kpis {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 18px;
        }
        .kpis b {
          border: 1px solid #eadfd5;
          background: #fff8ee;
          border-radius: 20px;
          padding: 16px;
          text-align: center;
          color: #6b1a2c;
          font-size: 1.35rem;
        }
        .kpis small {
          display: block;
          color: #6b7280;
          font-size: 0.72rem;
        }
        .panels {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }
        .panel,
        .form,
        .table,
        .cards {
          border: 1px solid #eadfd5;
          border-radius: 24px;
          padding: 18px;
          background: #fff;
        }
        .panel h3,
        .form h3 {
          margin: 0 0 14px;
          color: #6b1a2c;
        }
        .wide {
          grid-column: 1/-1;
        }
        .line,
        .month {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          border-bottom: 1px solid #eef2f7;
          padding: 10px;
          font-weight: 900;
        }
        .month {
          grid-template-columns: 1fr auto auto auto;
        }
        .line span,
        .month span {
          color: #6b7280;
        }
        .line b,
        .month b,
        .month strong {
          color: #6b1a2c;
        }
        .layout {
          display: grid;
          grid-template-columns: 330px 1fr;
          gap: 18px;
        }
        .form {
          background: #fffdf8;
        }
        label {
          display: grid;
          gap: 6px;
          margin-bottom: 12px;
          color: #6b7280;
          font-weight: 900;
          font-size: 0.78rem;
        }
        input,
        select {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 11px 12px;
          font: inherit;
        }
        .formActions,
        .cardActions,
        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .table {
          overflow: hidden;
          padding: 0;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr 1.4fr 0.8fr 0.8fr 1.2fr;
          border-bottom: 1px solid #eef2f7;
        }
        .row.cot {
          grid-template-columns: 1.4fr 1fr 0.8fr 0.8fr 0.8fr;
        }
        .row span {
          padding: 12px;
          font-weight: 800;
        }
        .row.head {
          background: #f8fafc;
          color: #6b7280;
        }
        .actions button,
        .cardActions button {
          padding: 7px 10px;
          font-size: 0.72rem;
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        .card {
          border: 1px solid #eadfd5;
          border-radius: 18px;
          padding: 14px;
        }
        .card strong {
          color: #6b1a2c;
        }
        .card span,
        .card small {
          display: block;
          color: #6b7280;
          font-weight: 800;
          margin: 6px 0;
        }
        .export p {
          color: #374151;
          font-weight: 800;
        }
        @media (max-width: 1000px) {
          .kpis,
          .panels,
          .layout,
          .row,
          .row.cot,
          .month {
            grid-template-columns: 1fr;
          }
          .row.head {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}