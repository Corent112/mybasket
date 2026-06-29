"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type Target = "individual" | "club";

type Plan = {
  id: string;
  name: string;
  slug: string | null;
  target: Target;
  price_cents: number | null;
  price_monthly_cents: number | null;
  price_yearly_cents: number | null;
  price_tax_mode: "TTC" | "HT" | null;
  period: string | null;
  storage_gb: number | null;
  max_teams: number | null;
  max_playbooks: number | null;
  max_documents: number | null;
  max_favorites: number | null;
  coach_limit_label: string | null;
  description: string | null;
  features: unknown;
  status: string | null;
  is_recommended: boolean | null;
  sort_order: number | null;
};

type AccessRow = {
  plan_id: string;
  section_key: string;
  enabled: boolean;
};

type Draft = {
  name: string;
  status: string;
  priceMonthly: string;
  priceYearly: string;
  priceTaxMode: "TTC" | "HT";
  storageGb: string;
  maxTeams: string;
  maxPlaybooks: string;
  maxDocuments: string;
  maxFavorites: string;
  coachLimitLabel: string;
  description: string;
  featuresText: string;
  isRecommended: boolean;
};

const SECTIONS = [
  { key: "bibliotheque_exercice", label: "Bibliothèque exercice" },
  { key: "bibliotheque_systeme", label: "Bibliothèque système" },
  { key: "bibliotheque_seance", label: "Bibliothèque séance" },
  { key: "plaquette", label: "Plaquettes" },
  { key: "accompagnement", label: "Accompagnements" },
  { key: "annonces", label: "Annonces" },
  { key: "abonnements", label: "Abonnement" },
  { key: "boutique", label: "Boutique" },
  { key: "messagerie", label: "Messagerie" },
  { key: "favoris", label: "Mes favoris" },
  { key: "reservations", label: "Mes réservations" },
  { key: "calendrier", label: "Mon calendrier" },
  { key: "mes_exercices", label: "Mes exercices" },
  { key: "playbooks", label: "Mes playbooks" },
  { key: "profil_coach", label: "Mon profil Coach" },
  { key: "mes_annonces", label: "Mes annonces" },
  { key: "papiers", label: "Mes papiers" },
  { key: "equipes", label: "Mes équipes" },
  { key: "stats_joueur", label: "Stats joueur" },
  { key: "stats_jeu", label: "Stats jeu" },
  { key: "stats_live", label: "Stats live" },
  { key: "rotation", label: "Rotation" },
  { key: "gameplan", label: "Game plan" },
  { key: "gestion_administrative", label: "Gestion administrative" },
  { key: "club_space", label: "Espace club" },
] as const;

function toFeatureList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      // texte simple
    }

    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function centsToEuros(cents: number | null) {
  if (cents === null || cents === undefined) return "";
  return String(cents / 100);
}

function eurosToCents(value: string) {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;

  const number = Number(clean);
  if (Number.isNaN(number)) return null;

  return Math.round(number * 100);
}

function numberToDraftValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function draftValueToNumber(value: string) {
  const clean = value.trim();
  if (!clean) return null;

  const number = Number(clean);
  if (Number.isNaN(number)) return null;

  return number;
}

function planToDraft(plan: Plan): Draft {
  return {
    name: plan.name || "",
    status: plan.status || "active",
    priceMonthly: centsToEuros(plan.price_monthly_cents ?? plan.price_cents),
    priceYearly: centsToEuros(
      plan.price_yearly_cents ??
        (plan.price_monthly_cents ?? plan.price_cents ?? 0) * 10
    ),
    priceTaxMode: plan.price_tax_mode === "HT" ? "HT" : "TTC",
    storageGb: numberToDraftValue(plan.storage_gb),
    maxTeams: numberToDraftValue(plan.max_teams),
    maxPlaybooks: numberToDraftValue(plan.max_playbooks),
    maxDocuments: numberToDraftValue(plan.max_documents),
    maxFavorites: numberToDraftValue(plan.max_favorites),
    coachLimitLabel: plan.coach_limit_label || "",
    description: plan.description || "",
    featuresText: toFeatureList(plan.features).join("\n"),
    isRecommended: Boolean(plan.is_recommended),
  };
}

function accessKey(planId: string, sectionKey: string) {
  return `${planId}::${sectionKey}`;
}

function dedupePlans(plans: Plan[]) {
  return plans.filter(
    (plan, index, array) =>
      array.findIndex((item) => item.id === plan.id) === index
  );
}

export default function AdminAbonnementsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixMessage, setMatrixMessage] = useState<string | null>(null);

  const matrixPlans = useMemo(() => {
    const cleanPlans = dedupePlans(plans);
    const individual = cleanPlans.filter((plan) => plan.target === "individual");
    const club = cleanPlans.filter((plan) => plan.target === "club");

    return [...individual, ...club];
  }, [plans]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const supabase = createClient();

        const plansResult = await supabase
          .from("subscription_plans")
          .select("*")
          .order("sort_order", { ascending: true });

        if (plansResult.error) throw plansResult.error;

        const accessResult = await supabase
          .from("subscription_access")
          .select("*");

        if (accessResult.error) throw accessResult.error;

        if (!active) return;

        const loadedPlans = dedupePlans((plansResult.data || []) as Plan[]);
        const loadedAccess = (accessResult.data || []) as AccessRow[];

        const draftMap: Record<string, Draft> = {};
        loadedPlans.forEach((plan) => {
          draftMap[plan.id] = planToDraft(plan);
        });

        const accessMap: Record<string, boolean> = {};
        loadedAccess.forEach((row) => {
          accessMap[accessKey(row.plan_id, row.section_key)] = Boolean(
            row.enabled
          );
        });

        setPlans(loadedPlans);
        setDrafts(draftMap);
        setAccess(accessMap);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erreur de chargement");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  function updateDraft(planId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [planId]: {
        ...current[planId],
        ...patch,
      },
    }));
  }

  async function savePlan(plan: Plan) {
    const draft = drafts[plan.id];
    if (!draft) return;

    setSavingPlanId(plan.id);
    setSavedPlanId(null);

    try {
      const supabase = createClient();

      const monthlyCents = eurosToCents(draft.priceMonthly);
      const yearlyCents = eurosToCents(draft.priceYearly);

      const payload = {
        name: draft.name,
        status: draft.status,
        price_cents: monthlyCents,
        price_monthly_cents: monthlyCents,
        price_yearly_cents: yearlyCents,
        price_tax_mode: draft.priceTaxMode,
        storage_gb: draftValueToNumber(draft.storageGb),
        max_teams: draftValueToNumber(draft.maxTeams),
        max_playbooks: draftValueToNumber(draft.maxPlaybooks),
        max_documents: draftValueToNumber(draft.maxDocuments),
        max_favorites: draftValueToNumber(draft.maxFavorites),
        coach_limit_label:
          draft.coachLimitLabel.trim() === "" ? null : draft.coachLimitLabel,
        description: draft.description.trim() === "" ? null : draft.description,
        features: draft.featuresText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        is_recommended: draft.isRecommended,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("subscription_plans")
        .update(payload)
        .eq("id", plan.id);

      if (error) throw error;

      setPlans((current) =>
        current.map((item) =>
          item.id === plan.id ? { ...item, ...payload } : item
        )
      );

      setSavedPlanId(plan.id);

      window.setTimeout(() => {
        setSavedPlanId((current) => (current === plan.id ? null : current));
      }, 2200);
    } catch (err) {
      alert(
        "Erreur d'enregistrement : " +
          (err instanceof Error ? err.message : "erreur inconnue")
      );
    } finally {
      setSavingPlanId((current) => (current === plan.id ? null : current));
    }
  }

  function toggleAccess(planId: string, sectionKey: string) {
    const key = accessKey(planId, sectionKey);

    setAccess((current) => ({
      ...current,
      [key]: !current[key],
    }));

    setMatrixMessage(null);
  }

  async function saveMatrix() {
    setMatrixSaving(true);
    setMatrixMessage(null);

    try {
      const supabase = createClient();

      const rows: AccessRow[] = [];

      matrixPlans.forEach((plan) => {
        SECTIONS.forEach((section) => {
          rows.push({
            plan_id: plan.id,
            section_key: section.key,
            enabled: Boolean(access[accessKey(plan.id, section.key)]),
          });
        });
      });

      const { error } = await supabase.from("subscription_access").upsert(rows, {
        onConflict: "plan_id,section_key",
      });

      if (error) throw error;

      setMatrixMessage("Modifications enregistrées ✅");

      window.setTimeout(() => {
        setMatrixMessage(null);
      }, 2200);
    } catch (err) {
      setMatrixMessage(
        "Erreur : " + (err instanceof Error ? err.message : "erreur inconnue")
      );
    } finally {
      setMatrixSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.aba}>
        <div className={styles.loading}>Chargement des abonnements…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.aba}>
        <div className={styles.error}>Erreur : {error}</div>
      </main>
    );
  }

  return (
    <main className={styles.aba}>
      <header className={styles.head}>
        <p>BACK-OFFICE MYBASKET</p>
        <h1>Abonnements</h1>
        <span>
          Modifie les offres, les prix, les limites d’usage et les accès par
          abonnement.
        </span>
      </header>

      <section className={styles.block}>
        <h2>Offres individuelles</h2>

        <div className={styles.plans}>
          {plans
            .filter((plan) => plan.target === "individual")
            .map((plan) => (
              <PlanEditor
                key={`individual-${plan.id}`}
                plan={plan}
                draft={drafts[plan.id]}
                saving={savingPlanId === plan.id}
                saved={savedPlanId === plan.id}
                updateDraft={updateDraft}
                savePlan={savePlan}
              />
            ))}
        </div>
      </section>

      <section className={styles.block}>
        <h2>Offres clubs</h2>

        <div className={styles.plans}>
          {plans
            .filter((plan) => plan.target === "club")
            .map((plan) => (
              <PlanEditor
                key={`club-${plan.id}`}
                plan={plan}
                draft={drafts[plan.id]}
                saving={savingPlanId === plan.id}
                saved={savedPlanId === plan.id}
                updateDraft={updateDraft}
                savePlan={savePlan}
              />
            ))}
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <div>
            <h2>Matrice d’accès</h2>
            <p>
              Coche les accès accordés par chaque abonnement, puis enregistre.
            </p>
          </div>

          <div className={styles.matrixSave}>
            {matrixMessage && (
              <span
                className={`${styles.ok} ${
                  matrixMessage.startsWith("Erreur") ? styles.err : ""
                }`}
              >
                {matrixMessage}
              </span>
            )}

            <button
              type="button"
              className={styles.btn}
              disabled={matrixSaving}
              onClick={saveMatrix}
            >
              {matrixSaving
                ? "Enregistrement…"
                : "Enregistrer les modifications"}
            </button>
          </div>
        </div>

        <div className={styles.matrixWrap}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th className={styles.matrixCorner}>Fonctionnalité</th>

                {matrixPlans.map((plan, index) => (
                  <th
                    key={`matrix-plan-${plan.id}-${index}`}
                    className={styles.matrixPlan}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {SECTIONS.map((section, sectionIndex) => (
                <tr key={`section-row-${section.key}-${sectionIndex}`}>
                  <th className={styles.matrixFeat}>{section.label}</th>

                  {matrixPlans.map((plan, planIndex) => (
                    <td
                      key={`cell-${plan.id}-${section.key}-${planIndex}-${sectionIndex}`}
                      className={styles.matrixCell}
                    >
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={Boolean(
                            access[accessKey(plan.id, section.key)]
                          )}
                          onChange={() => toggleAccess(plan.id, section.key)}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function PlanEditor({
  plan,
  draft,
  saving,
  saved,
  updateDraft,
  savePlan,
}: {
  plan: Plan;
  draft: Draft | undefined;
  saving: boolean;
  saved: boolean;
  updateDraft: (planId: string, patch: Partial<Draft>) => void;
  savePlan: (plan: Plan) => void;
}) {
  if (!draft) return null;

  return (
    <article className={styles.plan}>
      <div className={styles.planTitle}>
        <span>
          {plan.target === "club" ? "Club" : "Individuel"}
          {plan.slug ? ` · ${plan.slug}` : ""}
        </span>
      </div>

      <label className={styles.field}>
        <span>Nom</span>
        <input
          value={draft.name}
          onChange={(e) => updateDraft(plan.id, { name: e.target.value })}
        />
      </label>

      <div className={styles.row2}>
        <label className={styles.field}>
          <span>Statut</span>
          <select
            value={draft.status}
            onChange={(e) => updateDraft(plan.id, { status: e.target.value })}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Stockage (Go)</span>
          <input
            inputMode="numeric"
            value={draft.storageGb}
            onChange={(e) =>
              updateDraft(plan.id, { storageGb: e.target.value })
            }
          />
        </label>
      </div>

      <div className={styles.limitBox}>
        <h3>Limites d’usage</h3>
        <p>-1 = illimité</p>

        <div className={styles.row2}>
          <label className={styles.field}>
            <span>Max équipes</span>
            <input
              inputMode="numeric"
              value={draft.maxTeams}
              onChange={(e) =>
                updateDraft(plan.id, { maxTeams: e.target.value })
              }
            />
          </label>

          <label className={styles.field}>
            <span>Max playbooks</span>
            <input
              inputMode="numeric"
              value={draft.maxPlaybooks}
              onChange={(e) =>
                updateDraft(plan.id, { maxPlaybooks: e.target.value })
              }
            />
          </label>
        </div>

        <div className={styles.row2}>
          <label className={styles.field}>
            <span>Max documents</span>
            <input
              inputMode="numeric"
              value={draft.maxDocuments}
              onChange={(e) =>
                updateDraft(plan.id, { maxDocuments: e.target.value })
              }
            />
          </label>

          <label className={styles.field}>
            <span>Max favoris</span>
            <input
              inputMode="numeric"
              value={draft.maxFavorites}
              onChange={(e) =>
                updateDraft(plan.id, { maxFavorites: e.target.value })
              }
            />
          </label>
        </div>
      </div>

      <div className={styles.row3}>
        <label className={styles.field}>
          <span>Prix mensuel</span>
          <input
            inputMode="decimal"
            value={draft.priceMonthly}
            onChange={(e) =>
              updateDraft(plan.id, { priceMonthly: e.target.value })
            }
          />
        </label>

        <label className={styles.field}>
          <span>Prix annuel</span>
          <input
            inputMode="decimal"
            value={draft.priceYearly}
            onChange={(e) =>
              updateDraft(plan.id, { priceYearly: e.target.value })
            }
          />
        </label>

        <label className={styles.field}>
          <span>Prix affiché</span>
          <select
            value={draft.priceTaxMode}
            onChange={(e) =>
              updateDraft(plan.id, {
                priceTaxMode: e.target.value as "TTC" | "HT",
              })
            }
          >
            <option value="TTC">TTC</option>
            <option value="HT">HT</option>
          </select>
        </label>
      </div>

      <label className={styles.field}>
        <span>Libellé limite coachs</span>
        <input
          value={draft.coachLimitLabel}
          onChange={(e) =>
            updateDraft(plan.id, { coachLimitLabel: e.target.value })
          }
          placeholder="ex. 1 à 5 entraîneurs"
        />
      </label>

      <label className={styles.field}>
        <span>Description</span>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) =>
            updateDraft(plan.id, { description: e.target.value })
          }
        />
      </label>

      <label className={styles.field}>
        <span>Fonctionnalités visibles sur la carte</span>
        <textarea
          rows={4}
          value={draft.featuresText}
          onChange={(e) =>
            updateDraft(plan.id, { featuresText: e.target.value })
          }
        />
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={draft.isRecommended}
          onChange={(e) =>
            updateDraft(plan.id, { isRecommended: e.target.checked })
          }
        />
        Recommandé
      </label>

      <div className={styles.planSave}>
        <button
          type="button"
          className={styles.btn}
          disabled={saving}
          onClick={() => savePlan(plan)}
        >
          {saving ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>

        {saved && <span className={styles.ok}>Enregistré ✅</span>}
      </div>
    </article>
  );
}