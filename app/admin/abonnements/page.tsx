"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";
import {
  CLUB_PERMISSION_GROUPS,
  INDIVIDUAL_PERMISSION_GROUPS,
  type PermissionGroup,
} from "@/lib/subscription-permissions";

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
  max_teams: number | null;
  max_assistants_per_team?: number | null;
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

type AccessRow = { plan_id: string; section_key: string; enabled: boolean };

type Draft = {
  name: string;
  status: string;
  priceMonthly: string;
  priceYearly: string;
  priceTaxMode: "TTC" | "HT";
  maxTeams: string;
  maxAssistantsPerTeam: string;
  maxPlaybooks: string;
  maxDocuments: string;
  maxFavorites: string;
  coachLimitLabel: string;
  description: string;
  featuresText: string;
  isRecommended: boolean;
};

function toFeatureList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function centsToEuros(cents: number | null) {
  return cents == null ? "" : String(cents / 100);
}
function eurosToCents(value: string) {
  const n = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
}
function numberToDraftValue(value: number | null | undefined) {
  return value == null ? "" : String(value);
}
function draftValueToNumber(value: string) {
  const n = Number(value.trim());
  return value.trim() && Number.isFinite(n) ? n : null;
}
function accessKey(planId: string, sectionKey: string) {
  return `${planId}::${sectionKey}`;
}
function dedupePlans(plans: Plan[]) {
  return plans.filter((plan, index, array) => array.findIndex((p) => p.id === plan.id) === index);
}
function planToDraft(plan: Plan): Draft {
  return {
    name: plan.name || "",
    status: plan.status || "active",
    priceMonthly: centsToEuros(plan.price_monthly_cents ?? plan.price_cents),
    priceYearly: centsToEuros(plan.price_yearly_cents ?? (plan.price_monthly_cents ?? plan.price_cents ?? 0) * 10),
    priceTaxMode: plan.price_tax_mode === "HT" ? "HT" : "TTC",
    maxTeams: numberToDraftValue(plan.max_teams),
    maxAssistantsPerTeam: numberToDraftValue(plan.max_assistants_per_team),
    maxPlaybooks: numberToDraftValue(plan.max_playbooks),
    maxDocuments: numberToDraftValue(plan.max_documents),
    maxFavorites: numberToDraftValue(plan.max_favorites),
    coachLimitLabel: plan.coach_limit_label || "",
    description: plan.description || "",
    featuresText: toFeatureList(plan.features).join("\n"),
    isRecommended: Boolean(plan.is_recommended),
  };
}

const LIVE_STATS_KEYS = new Set(["stats_jeu", "stats_joueur", "stats_live"]);
const PREMIUM_EXTRA_KEYS = new Set(["video_tool", "offline_mode"]);

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
  const [activeTarget, setActiveTarget] = useState<Target>("individual");

  const cleanPlans = useMemo(() => dedupePlans(plans), [plans]);
  const offerPlans = useMemo(
    () => cleanPlans.filter((plan) => plan.target === activeTarget),
    [cleanPlans, activeTarget],
  );
  const matrixPlans = offerPlans;
  const matrixGroups: PermissionGroup[] =
    activeTarget === "club" ? CLUB_PERMISSION_GROUPS : INDIVIDUAL_PERMISSION_GROUPS;

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const supabase = createClient();
        const [plansResult, accessResult] = await Promise.all([
          supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true }),
          supabase.from("subscription_access").select("*"),
        ]);
        if (plansResult.error) throw plansResult.error;
        if (accessResult.error) throw accessResult.error;
        if (!active) return;
        const loadedPlans = dedupePlans((plansResult.data || []) as Plan[]);
        const draftMap: Record<string, Draft> = {};
        loadedPlans.forEach((plan) => { draftMap[plan.id] = planToDraft(plan); });
        const accessMap: Record<string, boolean> = {};
        ((accessResult.data || []) as AccessRow[]).forEach((row) => {
          accessMap[accessKey(row.plan_id, row.section_key)] = Boolean(row.enabled);
        });
        setPlans(loadedPlans);
        setDrafts(draftMap);
        setAccess(accessMap);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => { active = false; };
  }, []);

  function updateDraft(planId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [planId]: { ...current[planId], ...patch } }));
  }

  async function savePlan(plan: Plan) {
    const draft = drafts[plan.id];
    if (!draft) return;
    setSavingPlanId(plan.id);
    setSavedPlanId(null);
    try {
      const supabase = createClient();
      const monthlyCents = eurosToCents(draft.priceMonthly);
      const payload = {
        name: draft.name,
        status: draft.status,
        price_cents: monthlyCents,
        price_monthly_cents: monthlyCents,
        price_yearly_cents: eurosToCents(draft.priceYearly),
        price_tax_mode: draft.priceTaxMode,
        max_teams: draftValueToNumber(draft.maxTeams),
        max_assistants_per_team: draftValueToNumber(draft.maxAssistantsPerTeam),
        max_playbooks: draftValueToNumber(draft.maxPlaybooks),
        max_documents: draftValueToNumber(draft.maxDocuments),
        max_favorites: draftValueToNumber(draft.maxFavorites),
        coach_limit_label: draft.coachLimitLabel.trim() || null,
        description: draft.description.trim() || null,
        features: draft.featuresText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        is_recommended: draft.isRecommended,
        updated_at: new Date().toISOString(),
      };

      const { data: savedRows, error: saveError } = await supabase
        .from("subscription_plans")
        .update(payload)
        .eq("id", plan.id)
        .select("id");

      if (saveError) throw saveError;
      if (!savedRows?.length) {
        throw new Error("Aucune ligne n'a été modifiée. Vérifie les droits d'écriture admin/RLS sur subscription_plans.");
      }

      setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, ...payload } : item));
      setSavedPlanId(plan.id);
      window.setTimeout(() => setSavedPlanId((id) => id === plan.id ? null : id), 2200);
    } catch (err) {
      alert("Erreur d'enregistrement : " + (err instanceof Error ? err.message : "erreur inconnue"));
    } finally {
      setSavingPlanId((id) => id === plan.id ? null : id);
    }
  }

  function toggleAccess(planId: string, sectionKey: string) {
    const key = accessKey(planId, sectionKey);
    setAccess((current) => ({ ...current, [key]: !current[key] }));
    setMatrixMessage(null);
  }

  function applyLiveStatsPreset(planId: string) {
    setAccess((current) => {
      const next = { ...current };
      LIVE_STATS_KEYS.forEach((key) => { next[accessKey(planId, key)] = true; });
      PREMIUM_EXTRA_KEYS.forEach((key) => { next[accessKey(planId, key)] = false; });
      return next;
    });
    setMatrixMessage("Preset LiveStats appliqué — pense à enregistrer.");
  }

  function applyFullPreset(planId: string) {
    setAccess((current) => {
      const next = { ...current };
      matrixGroups.forEach((group) => group.items.forEach((item) => {
        next[accessKey(planId, item.key)] = true;
      }));
      return next;
    });
    setMatrixMessage("Accès total appliqué — pense à enregistrer.");
  }

  async function saveMatrix() {
    setMatrixSaving(true);
    setMatrixMessage(null);
    try {
      const rows: AccessRow[] = [];
      matrixPlans.forEach((plan) => matrixGroups.forEach((group) => group.items.forEach((section) => {
        rows.push({ plan_id: plan.id, section_key: section.key, enabled: Boolean(access[accessKey(plan.id, section.key)]) });
      })));
      const supabase = createClient();

      const { data: savedRows, error: saveError } = await supabase
        .from("subscription_access")
        .upsert(rows, { onConflict: "plan_id,section_key" })
        .select("plan_id,section_key");

      if (saveError) throw saveError;
      if (!savedRows || savedRows.length !== rows.length) {
        throw new Error("La matrice n'a pas été entièrement enregistrée. Vérifie les droits d'écriture admin/RLS sur subscription_access.");
      }

      setMatrixMessage(`Matrice ${activeTarget === "club" ? "Club" : "Individuelle"} enregistrée ✅`);
      window.setTimeout(() => setMatrixMessage(null), 2400);
    } catch (err) {
      setMatrixMessage("Erreur : " + (err instanceof Error ? err.message : "erreur inconnue"));
    } finally {
      setMatrixSaving(false);
    }
  }

  if (loading) return <main className={styles.aba}><div className={styles.loading}>Chargement des abonnements…</div></main>;
  if (error) return <main className={styles.aba}><div className={styles.error}>Erreur : {error}</div></main>;

  return (
    <main className={styles.aba}>
      <header className={styles.head}>
        <div>
          <p>BACK-OFFICE MYBASKET</p>
          <h1>Abonnements</h1>
          <span>Une seule source de vérité pour les offres, limites et droits d'accès.</span>
        </div>
        <div className={styles.headLegend}>
          <b>LiveStats</b><span>collectif + individuel · connecté</span>
          <b>Premium</b><span>accès total · vidéo + hors ligne</span>
        </div>
      </header>

      <section className={styles.block}>
        <div className={styles.sectionTop}>
          <div><span className={styles.eyebrow}>OFFRES COMMERCIALES</span><h2>Configurer les abonnements</h2></div>
          <TargetTabs value={activeTarget} onChange={setActiveTarget} individualCount={cleanPlans.filter(p => p.target === "individual").length} clubCount={cleanPlans.filter(p => p.target === "club").length} />
        </div>
        {activeTarget === "club" && (
          <div className={styles.institutionQuote}>
            <div>
              <strong>🏛️ Institutions</strong>
              <span>Comités · Ligues · Pôles · Fédération</span>
            </div>
            <b>Sur devis</b>
          </div>
        )}

        {offerPlans.length ? (
          <div className={styles.plans}>{offerPlans.map((plan) => (
            <PlanEditor key={plan.id} plan={plan} draft={drafts[plan.id]} saving={savingPlanId === plan.id} saved={savedPlanId === plan.id} updateDraft={updateDraft} savePlan={savePlan} />
          ))}</div>
        ) : <div className={styles.emptyState}>Aucune offre {activeTarget === "club" ? "Club" : "individuelle"} trouvée dans subscription_plans.</div>}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <div>
            <span className={styles.eyebrow}>SOURCE DE VÉRITÉ DES DROITS</span>
            <h2>Matrice d'accès</h2>
            <p>Les droits Club sont de nouveau visibles ici, séparés de l'individuel pour garder une lecture claire.</p>
          </div>
          <div className={styles.matrixSave}>
            {matrixMessage && <span className={`${styles.ok} ${matrixMessage.startsWith("Erreur") ? styles.err : ""}`}>{matrixMessage}</span>}
            <button type="button" className={styles.btn} disabled={matrixSaving} onClick={saveMatrix}>{matrixSaving ? "Enregistrement…" : "Enregistrer la matrice"}</button>
          </div>
        </div>

        <div className={styles.matrixToolbar}>
          <div className={styles.matrixContext}>
            Matrice <strong>{activeTarget === "club" ? "Club" : "Individuelle"}</strong>
            <span>— les cases ouvrent ou ferment les pages et fonctionnalités correspondantes.</span>
          </div>
          <div className={styles.legend}><span><i className={styles.dotStats}/> LiveStats = stats en ligne</span><span><i className={styles.dotPremium}/> Premium = tout, vidéo + hors ligne</span></div>
        </div>

        <div className={styles.systemAccessNote}><strong>Accès système toujours ouverts</strong><span>Profil · Mon abonnement · Boutique · Calendrier personnel</span></div>

        {matrixPlans.length ? (
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th className={styles.matrixCorner}>Fonctionnalité</th>
                  {matrixPlans.map((plan) => (
                    <th key={plan.id} className={styles.matrixPlan}>
                      <strong>{plan.name}</strong>
                      <small>{plan.slug || (plan.target === "club" ? "club" : "individuel")}</small>
                      <div className={styles.presetButtons}>
                        <button type="button" onClick={() => applyLiveStatsPreset(plan.id)}>LiveStats</button>
                        <button type="button" onClick={() => applyFullPreset(plan.id)}>Tout</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className={styles.matrixGroupRow}><th className={styles.matrixGroup} colSpan={matrixPlans.length + 1}>{group.label}</th></tr>
                    {group.items.map((section) => (
                      <tr key={section.key} className={PREMIUM_EXTRA_KEYS.has(section.key) ? styles.premiumRow : LIVE_STATS_KEYS.has(section.key) ? styles.statsRow : undefined}>
                        <th className={styles.matrixFeat}><span>{section.label}</span>{section.hint ? <small>{section.hint}</small> : null}</th>
                        {matrixPlans.map((plan) => (
                          <td key={`${plan.id}-${section.key}`} className={styles.matrixCell}>
                            <label className={styles.check}><input type="checkbox" checked={Boolean(access[accessKey(plan.id, section.key)])} onChange={() => toggleAccess(plan.id, section.key)} /><span /></label>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className={styles.emptyState}>Aucun plan {activeTarget === "club" ? "Club" : "individuel"} à afficher dans la matrice.</div>}
      </section>
    </main>
  );
}

function TargetTabs({ value, onChange, individualCount, clubCount }: { value: Target; onChange: (target: Target) => void; individualCount: number; clubCount: number }) {
  return <div className={styles.tabs}>
    <button type="button" className={value === "individual" ? styles.tabActive : ""} onClick={() => onChange("individual")}>👤 Individuel <b>{individualCount}</b></button>
    <button type="button" className={value === "club" ? styles.tabActive : ""} onClick={() => onChange("club")}>🏀 Clubs <b>{clubCount}</b></button>
  </div>;
}

function PlanEditor({ plan, draft, saving, saved, updateDraft, savePlan }: {
  plan: Plan; draft: Draft | undefined; saving: boolean; saved: boolean;
  updateDraft: (planId: string, patch: Partial<Draft>) => void;
  savePlan: (plan: Plan) => Promise<void>;
}) {
  if (!draft) return null;
  const price = draft.priceMonthly || "—";
  return (
    <article className={`${styles.plan} ${draft.isRecommended ? styles.planRecommended : ""}`}>
      <div className={styles.planHeader}>
        <div><span className={styles.planBadge}>{plan.target === "club" ? "CLUB" : "INDIVIDUEL"}</span><small>{plan.slug || "sans slug"}</small></div>
        <label className={styles.recommended}><input type="checkbox" checked={draft.isRecommended} onChange={(e) => updateDraft(plan.id, { isRecommended: e.target.checked })} /> Recommandé</label>
      </div>
      <div className={styles.planHero}>
        <label className={styles.nameField}><span>Nom de l'offre</span><input value={draft.name} onChange={(e) => updateDraft(plan.id, { name: e.target.value })} /></label>
        <div className={styles.pricePreview}><strong>{price} €</strong><span>/ mois</span></div>
      </div>
      <div className={styles.quickGrid}>
        <label className={styles.field}><span>Statut</span><select value={draft.status} onChange={(e) => updateDraft(plan.id, { status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className={styles.field}><span>Prix mensuel</span><input inputMode="decimal" value={draft.priceMonthly} onChange={(e) => updateDraft(plan.id, { priceMonthly: e.target.value })} /></label>
        <label className={styles.field}><span>Prix annuel</span><input inputMode="decimal" value={draft.priceYearly} onChange={(e) => updateDraft(plan.id, { priceYearly: e.target.value })} /></label>
        <label className={styles.field}><span>Affichage</span><select value={draft.priceTaxMode} onChange={(e) => updateDraft(plan.id, { priceTaxMode: e.target.value as "TTC" | "HT" })}><option value="TTC">TTC</option><option value="HT">HT</option></select></label>
      </div>
      <div className={styles.limitStrip}>
        <LimitInput label="Équipes" value={draft.maxTeams} onChange={(value) => updateDraft(plan.id, { maxTeams: value })} />
        {plan.target === "individual" && <LimitInput label="Assistants / équipe" value={draft.maxAssistantsPerTeam} onChange={(value) => updateDraft(plan.id, { maxAssistantsPerTeam: value })} />}
        <LimitInput label="Playbooks" value={draft.maxPlaybooks} onChange={(value) => updateDraft(plan.id, { maxPlaybooks: value })} />
        <LimitInput label="Documents" value={draft.maxDocuments} onChange={(value) => updateDraft(plan.id, { maxDocuments: value })} />
        <LimitInput label="Favoris" value={draft.maxFavorites} onChange={(value) => updateDraft(plan.id, { maxFavorites: value })} />
      </div>
      <small className={styles.limitHint}>-1 = illimité</small>
      <details className={styles.details}>
        <summary>Contenu commercial & réglages avancés</summary>
        <div className={styles.detailsBody}>
          <label className={styles.field}><span>Libellé limite coachs</span><input value={draft.coachLimitLabel} onChange={(e) => updateDraft(plan.id, { coachLimitLabel: e.target.value })} placeholder="ex. 1 à 5 entraîneurs" /></label>
          <label className={styles.field}><span>Description</span><textarea rows={2} value={draft.description} onChange={(e) => updateDraft(plan.id, { description: e.target.value })} /></label>
          <label className={styles.field}><span>Fonctionnalités visibles sur la carte</span><textarea rows={4} value={draft.featuresText} onChange={(e) => updateDraft(plan.id, { featuresText: e.target.value })} /></label>
        </div>
      </details>
      <div className={styles.planSave}><button type="button" className={styles.btn} disabled={saving} onClick={() => savePlan(plan)}>{saving ? "Enregistrement…" : "Enregistrer l'offre"}</button>{saved && <span className={styles.ok}>Enregistré ✅</span>}</div>
    </article>
  );
}

function LimitInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.limitInput}><span>{label}</span><input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
