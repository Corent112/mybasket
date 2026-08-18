"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Scenario = {
  id: string;
  cohort_id: string;
  title: string;
  module_name: string | null;
  theme: string | null;
  total_duration_minutes: number;
  pedagogical_objectives: string | null;
};

type Step = {
  id: string;
  scenario_id: string;
  duration_minutes: number;
  activity: string;
  animation_technique: string | null;
  pedagogical_support: string | null;
  sort_order: number;
};

export default function PedagogicalScenarioEditor({ cohortId }: { cohortId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [message, setMessage] = useState("");

  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? null;

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  async function reload(preferred?: string) {
    const { data, error } = await supabase
      .from("pedagogical_scenarios")
      .select("*")
      .eq("cohort_id", cohortId)
      .order("updated_at", { ascending: false });

    if (error) {
      toast(error.message);
      return;
    }

    const list = (data ?? []) as Scenario[];
    setScenarios(list);
    const next =
      preferred && list.some((scenario) => scenario.id === preferred)
        ? preferred
        : list.some((scenario) => scenario.id === selectedId)
          ? selectedId
          : list[0]?.id ?? "";

    setSelectedId(next);
    if (next) await loadSteps(next);
  }

  async function loadSteps(scenarioId: string) {
    const { data } = await supabase
      .from("pedagogical_scenario_steps")
      .select("*")
      .eq("scenario_id", scenarioId)
      .order("sort_order");

    setSteps((data ?? []) as Step[]);
  }

  useEffect(() => {
    void reload();
  }, [cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createScenario() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("pedagogical_scenarios")
      .insert({
        cohort_id: cohortId,
        title: "Nouveau scénario pédagogique",
        module_name: "",
        theme: "",
        total_duration_minutes: 60,
        pedagogical_objectives: "",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) {
      toast(error.message);
      return;
    }

    const defaults = [
      { duration_minutes: 10, activity: "Découverte", animation_technique: "", pedagogical_support: "Board", sort_order: 0 },
      { duration_minutes: 30, activity: "Exposé", animation_technique: "", pedagogical_support: "Board", sort_order: 1 },
      { duration_minutes: 20, activity: "Applicative / Débat", animation_technique: "", pedagogical_support: "Feuille de préparation pédagogique", sort_order: 2 },
    ];

    await supabase.from("pedagogical_scenario_steps").insert(
      defaults.map((step) => ({ ...step, scenario_id: data.id })),
    );

    await reload(data.id);
  }

  function patchSelected(patch: Partial<Scenario>) {
    if (!selected) return;
    setScenarios((current) =>
      current.map((scenario) =>
        scenario.id === selected.id ? { ...scenario, ...patch } : scenario,
      ),
    );
  }

  async function saveScenario() {
    if (!selected) return;

    const total = steps.reduce((sum, step) => sum + Number(step.duration_minutes || 0), 0);

    const { error } = await supabase
      .from("pedagogical_scenarios")
      .update({
        title: selected.title.trim() || "Scénario pédagogique",
        module_name: selected.module_name?.trim() || null,
        theme: selected.theme?.trim() || null,
        total_duration_minutes: total || selected.total_duration_minutes,
        pedagogical_objectives: selected.pedagogical_objectives?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selected.id);

    if (error) {
      toast(error.message);
      return;
    }

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const { error: stepError } = await supabase
        .from("pedagogical_scenario_steps")
        .update({
          duration_minutes: Number(step.duration_minutes || 0),
          activity: step.activity.trim() || `Étape ${index + 1}`,
          animation_technique: step.animation_technique?.trim() || null,
          pedagogical_support: step.pedagogical_support?.trim() || null,
          sort_order: index,
        })
        .eq("id", step.id);

      if (stepError) {
        toast(stepError.message);
        return;
      }
    }

    await reload(selected.id);
    toast("Scénario pédagogique enregistré.");
  }

  async function addStep() {
    if (!selected) return;
    const { data, error } = await supabase
      .from("pedagogical_scenario_steps")
      .insert({
        scenario_id: selected.id,
        duration_minutes: 10,
        activity: `Étape ${steps.length + 1}`,
        animation_technique: "",
        pedagogical_support: "",
        sort_order: steps.length,
      })
      .select("*")
      .single();

    if (error) {
      toast(error.message);
      return;
    }

    setSteps((current) => [...current, data as Step]);
  }

  async function removeStep(id: string) {
    const { error } = await supabase.from("pedagogical_scenario_steps").delete().eq("id", id);
    if (error) {
      toast(error.message);
      return;
    }
    setSteps((current) => current.filter((step) => step.id !== id));
  }

  const totalDuration = steps.reduce((sum, step) => sum + Number(step.duration_minutes || 0), 0);

  return (
    <section className="scenario-editor">
      {message && <div className="toast">{message}</div>}

      <div className="head">
        <div>
          <p>SCÉNARIOS PÉDAGOGIQUES</p>
          <h2>Bibliothèque de scénarios de la formation</h2>
          <span>
            Modèle repris de tes documents : Durée · Objectif(s) pédagogique(s) · Activités · Techniques d’animation / contenus · Supports pédagogiques.
          </span>
        </div>
        <button className="primary" onClick={createScenario}>+ Nouveau scénario</button>
      </div>

      <div className="layout">
        <aside>
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              className={scenario.id === selectedId ? "item active" : "item"}
              onClick={async () => {
                setSelectedId(scenario.id);
                await loadSteps(scenario.id);
              }}
            >
              <strong>{scenario.title}</strong>
              <span>{scenario.module_name || "Sans module"} · {scenario.total_duration_minutes} min</span>
            </button>
          ))}
        </aside>

        <div className="card">
          {!selected ? (
            <div className="empty">Crée un scénario pédagogique pour commencer.</div>
          ) : (
            <>
              <div className="scenario-fields">
                <label>
                  <span>Module</span>
                  <input value={selected.module_name ?? ""} onChange={(e) => patchSelected({ module_name: e.target.value })} placeholder="Module 1 - CS1 & CS3" />
                </label>
                <label>
                  <span>Thème</span>
                  <input value={selected.theme ?? ""} onChange={(e) => patchSelected({ theme: e.target.value })} placeholder="Le tir en course / Attaque de zone..." />
                </label>
                <label className="wide">
                  <span>Titre du scénario</span>
                  <input value={selected.title} onChange={(e) => patchSelected({ title: e.target.value })} />
                </label>
                <label className="wide">
                  <span>Objectif(s) pédagogique(s)</span>
                  <textarea
                    value={selected.pedagogical_objectives ?? ""}
                    onChange={(e) => patchSelected({ pedagogical_objectives: e.target.value })}
                    placeholder="Être capable de déterminer les éléments clefs..."
                  />
                </label>
              </div>

              <div className="scenario-banner">
                <strong>{selected.theme || selected.title}</strong>
                <span>{totalDuration} min</span>
              </div>

              <div className="scenario-table">
                <div className="thead">
                  <strong>Durée</strong>
                  <strong>Activités</strong>
                  <strong>Techniques d’animation - contenus</strong>
                  <strong>Supports pédagogiques</strong>
                  <span />
                </div>

                {steps.map((step, index) => (
                  <div className="trow" key={step.id}>
                    <input
                      type="number"
                      min={0}
                      value={step.duration_minutes}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, duration_minutes: Number(e.target.value) || 0 }
                              : item,
                          ),
                        )
                      }
                    />
                    <textarea
                      value={step.activity}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((item) =>
                            item.id === step.id ? { ...item, activity: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder={index === 0 ? "Découverte" : "Exposé / Débat / Applicative"}
                    />
                    <textarea
                      value={step.animation_technique ?? ""}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, animation_technique: e.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Question grand groupe, présentation, mise en situation..."
                    />
                    <textarea
                      value={step.pedagogical_support ?? ""}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, pedagogical_support: e.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Board / Feuille pédagogique / PPT..."
                    />
                    <button className="remove" onClick={() => removeStep(step.id)}>×</button>
                  </div>
                ))}
              </div>

              <div className="footer">
                <button className="secondary" onClick={addStep}>+ Ajouter une ligne</button>
                <button className="primary" onClick={saveScenario}>Enregistrer le scénario</button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .scenario-editor{display:grid;gap:12px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.head p{margin:0;color:#d4a24c;font-weight:1000;letter-spacing:.12em;font-size:.68rem}.head h2{margin:4px 0}.head span{color:#80726b;font-size:.76rem}.primary,.secondary{border-radius:9px;padding:9px 12px;font-weight:950;cursor:pointer}.primary{background:#6b1a2c;color:#fff;border:1px solid #6b1a2c}.secondary{background:#fff;color:#6b1a2c;border:1px solid #ddd1ca}.layout{display:grid;grid-template-columns:260px 1fr;gap:10px}.layout aside,.card{background:#fff;border:1px solid #eadfd8;border-radius:15px;padding:12px}.layout aside{display:grid;align-content:start;gap:5px}.item{text-align:left;border:1px solid #eee4df;background:#fff;border-radius:9px;padding:9px}.item strong,.item span{display:block}.item span{color:#85776f;font-size:.68rem}.item.active{border-color:#6b1a2c;background:#fff7f8}.scenario-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.scenario-fields label{display:grid;gap:4px}.scenario-fields label span{font-size:.64rem;text-transform:uppercase;font-weight:900;color:#7d6f67}.scenario-fields input,.scenario-fields textarea{border:1px solid #ddd1ca;border-radius:8px;padding:8px}.wide{grid-column:1/-1}.scenario-banner{display:flex;justify-content:space-between;gap:10px;margin-top:12px;padding:10px;border:1px solid #ded4cd;border-bottom:0;background:#fff;color:#d33;font-weight:950;text-align:center}.scenario-table{border:1px solid #ded4cd}.thead,.trow{display:grid;grid-template-columns:90px 1.1fr 2fr 1fr 36px}.thead>*{padding:10px;border-right:1px solid #ded4cd;background:#efefef;text-align:center}.trow>*{border:0;border-right:1px solid #ded4cd;border-top:1px solid #ded4cd;border-radius:0;padding:8px;min-height:78px}.trow input{text-align:center}.remove{background:#fff;color:#b42318;font-size:1.2rem}.footer{display:flex;justify-content:space-between;margin-top:10px}.empty{color:#887a72;padding:16px}.toast{position:fixed;top:15px;left:50%;transform:translateX(-50%);z-index:100;background:#231b18;color:#fff;border-radius:999px;padding:10px 17px}@media(max-width:900px){.layout{grid-template-columns:1fr}.thead,.trow{grid-template-columns:75px 1fr 1.4fr 1fr 34px}}@media(max-width:650px){.scenario-fields{grid-template-columns:1fr}.wide{grid-column:auto}.scenario-table{overflow:auto}.thead,.trow{min-width:760px}}
      `}</style>
    </section>
  );
}
