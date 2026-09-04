"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PlanningBlock = {
  id: string;
  cohort_id: string;
  training_day: string;
  start_time: string;
  end_time: string;
  title: string;
  formation_name: string | null;
  instructor_name: string | null;
  room_name: string | null;
  location_type: string | null;
  block_type: string;
  description: string | null;
  pedagogical_scenario_id: string | null;
};

type Scenario = {
  id: string;
  cohort_id: string;
  title: string;
  module_name: string | null;
  theme: string | null;
  total_duration_minutes: number;
  pedagogical_objectives: string | null;
};

type Asset = {
  id: string;
  block_id: string;
  title: string;
  asset_type: string;
  file_url: string;
  storage_path?: string | null;
  original_filename: string | null;
};

const BLOCK_TYPES = [
  ["training", "Intervention"],
  ["court", "Terrain"],
  ["meeting", "Réunion"],
  ["meal", "Déjeuner"],
  ["assessment", "Évaluation"],
  ["break", "Pause"],
  ["other", "Autre"],
];

function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function assetIcon(asset: Asset) {
  if (asset.asset_type === "presentation") return "🖥️";
  if (asset.asset_type === "pdf") return "📄";
  return "📎";
}

function blockTypeLabel(value: string) {
  return BLOCK_TYPES.find(([key]) => key === value)?.[1] || "Bloc";
}

export default function TrainingPlanningBoard({
  cohortId,
  onAttendanceChanged,
}: {
  cohortId: string;
  onAttendanceChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [blocks, setBlocks] = useState<PlanningBlock[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [message, setMessage] = useState("");
  const [planningTitle, setPlanningTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const [savingPlanning, setSavingPlanning] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<File | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  const [form, setForm] = useState({
    training_day: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    end_time: "10:00",
    title: "",
    formation_name: "",
    instructor_name: "",
    room_name: "",
    location_type: "salle",
    block_type: "training",
    description: "",
    pedagogical_scenario_id: "",
  });

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  async function reload() {
    const [
      { data: blockData, error: blockError },
      { data: scenarioData, error: scenarioError },
      { data: cohortData },
    ] = await Promise.all([
      supabase
        .from("training_schedule_blocks")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("training_day")
        .order("start_time"),
      supabase
        .from("pedagogical_scenarios")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("training_cohorts")
        .select("name,planning_title")
        .eq("id", cohortId)
        .maybeSingle(),
    ]);

    if (blockError) console.error(blockError);
    if (scenarioError) console.error(scenarioError);

    const nextBlocks = (blockData ?? []) as PlanningBlock[];
    setBlocks(nextBlocks);
    setScenarios((scenarioData ?? []) as Scenario[]);
    setPlanningTitle(
      String(
        (cohortData as any)?.planning_title ||
          (cohortData as any)?.name ||
          "Planning de formation",
      ),
    );

    if (nextBlocks.length) {
      const { data: assetData } = await supabase
        .from("training_schedule_assets")
        .select("*")
        .in(
          "block_id",
          nextBlocks.map((block) => block.id),
        );
      setAssets((assetData ?? []) as Asset[]);
    } else {
      setAssets([]);
    }
  }

  useEffect(() => {
    void reload();
  }, [cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadAsset(
    blockId: string,
    file: File,
    options?: { reloadAfter?: boolean; notify?: boolean },
  ) {
    const reloadAfter = options?.reloadAfter ?? true;
    const notify = options?.notify ?? true;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const lower = file.name.toLowerCase();
    let assetType = "document";
    if (lower.endsWith(".pdf")) assetType = "pdf";
    if (
      lower.endsWith(".ppt") ||
      lower.endsWith(".pptx") ||
      lower.endsWith(".key")
    ) {
      assetType = "presentation";
    }

    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `${cohortId}/${blockId}/${crypto.randomUUID()}-${clean}`;

    const upload = await supabase.storage
      .from("training-assets")
      .upload(storagePath, file);

    if (upload.error) {
      toast(upload.error.message);
      return false;
    }

    const fileUrl = supabase.storage
      .from("training-assets")
      .getPublicUrl(storagePath).data.publicUrl;

    const { error } = await supabase.from("training_schedule_assets").insert({
      block_id: blockId,
      title: file.name,
      asset_type: assetType,
      storage_path: storagePath,
      file_url: fileUrl,
      original_filename: file.name,
      uploaded_by: user.id,
    });

    if (error) {
      await supabase.storage.from("training-assets").remove([storagePath]);
      toast(error.message);
      return false;
    }

    if (reloadAfter) await reload();
    if (notify) toast("Pièce jointe ajoutée.");
    return true;
  }

  async function createBlock() {
    if (!form.title.trim()) {
      toast("Le titre du bloc est obligatoire.");
      return;
    }

    if (timeToMinutes(form.end_time) <= timeToMinutes(form.start_time)) {
      toast("L’heure de fin doit être après l’heure de début.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setUploadingAsset(true);
    try {
      const { data: createdBlock, error } = await supabase
        .from("training_schedule_blocks")
        .insert({
          cohort_id: cohortId,
          training_day: form.training_day,
          start_time: form.start_time,
          end_time: form.end_time,
          title: form.title.trim(),
          formation_name: form.formation_name.trim() || null,
          instructor_name: form.instructor_name.trim() || null,
          room_name: form.room_name.trim() || null,
          location_type: form.location_type || null,
          block_type: form.block_type,
          description: form.description.trim() || null,
          pedagogical_scenario_id: form.pedagogical_scenario_id || null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error || !createdBlock?.id) {
        console.error(error);
        toast(error?.message || "Création du bloc impossible.");
        return;
      }

      if (pendingAsset) {
        const uploaded = await uploadAsset(createdBlock.id, pendingAsset, {
          reloadAfter: false,
          notify: false,
        });
        if (!uploaded) {
          await reload();
          setSelectedBlockId(createdBlock.id);
          toast("Bloc créé, mais la pièce jointe n’a pas pu être ajoutée.");
          return;
        }
      }

      setForm((current) => ({
        ...current,
        title: "",
        instructor_name: "",
        room_name: "",
        description: "",
        pedagogical_scenario_id: "",
      }));
      setPendingAsset(null);

      await reload();
      setSelectedBlockId(createdBlock.id);
      await syncAttendanceFromPlanning(false);
      toast(
        pendingAsset
          ? "Bloc et pièce jointe ajoutés au planning."
          : "Bloc ajouté au planning.",
      );
    } finally {
      setUploadingAsset(false);
    }
  }

  async function deleteBlock(blockId: string) {
    if (!window.confirm("Supprimer ce bloc du planning ?")) return;
    const { error } = await supabase
      .from("training_schedule_blocks")
      .delete()
      .eq("id", blockId);

    if (error) {
      toast(error.message);
      return;
    }

    if (selectedBlockId === blockId) setSelectedBlockId("");
    await reload();
    await syncAttendanceFromPlanning(false);
  }

  async function attachScenario(blockId: string, scenarioId: string) {
    const { error } = await supabase
      .from("training_schedule_blocks")
      .update({ pedagogical_scenario_id: scenarioId || null })
      .eq("id", blockId);

    if (error) {
      toast(error.message);
      return;
    }

    await reload();
    toast("Scénario pédagogique lié.");
  }

  async function downloadAsset(asset: Asset) {
    try {
      let blob: Blob | null = null;

      if (asset.storage_path) {
        const { data, error } = await supabase.storage
          .from("training-assets")
          .download(asset.storage_path);

        if (!error && data) blob = data;
      }

      if (!blob) {
        const response = await fetch(asset.file_url);
        if (!response.ok) throw new Error("Téléchargement impossible.");
        blob = await response.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        asset.original_filename || asset.title || "piece-jointe";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast("Téléchargement impossible.");
    }
  }

  async function savePlanningTitle(notify = true) {
    const title = planningTitle.trim();
    if (!title) {
      if (notify) toast("Donne un titre au planning.");
      return false;
    }

    const { error } = await supabase
      .from("training_cohorts")
      .update({ planning_title: title })
      .eq("id", cohortId);

    if (error) {
      toast(error.message);
      return false;
    }

    if (notify) toast("Titre du planning enregistré.");
    return true;
  }

  async function syncAttendanceFromPlanning(notify = false) {
    const response = await fetch(
      "/api/institutionnel/training/sync-planning-attendance",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortId }),
      },
    );

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast(json.error || "Synchronisation des présences impossible.");
      return false;
    }

    onAttendanceChanged?.();

    if (notify) {
      toast(
        `${json.sessions ?? 0} demi-journée(s) de présence synchronisée(s).`,
      );
    }

    return true;
  }

  async function savePlanning() {
    if (!planningTitle.trim()) {
      return toast("Donne un titre au planning.");
    }

    setSavingPlanning(true);
    try {
      const titleSaved = await savePlanningTitle(false);
      if (!titleSaved) return;

      const attendanceSynced = await syncAttendanceFromPlanning(false);
      if (!attendanceSynced) return;

      await reload();
      toast("Planning sauvegardé et présences mises à jour.");
    } finally {
      setSavingPlanning(false);
    }
  }

  async function exportPlanning() {
    if (!planningTitle.trim()) {
      return toast("Donne un titre au planning avant l’export.");
    }

    setExporting(true);
    try {
      const titleSaved = await savePlanningTitle(false);
      if (!titleSaved) return;
      const attendanceSynced = await syncAttendanceFromPlanning(false);
      if (!attendanceSynced) return;

      const response = await fetch(
        "/api/institutionnel/training/planning-pdf",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cohortId,
            title: planningTitle.trim(),
          }),
        },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        return toast(json.error || "Export impossible");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Planning - ${planningTitle.trim()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast("PDF exporté et enregistré dans Documents.");
    } finally {
      setExporting(false);
    }
  }

  const days = useMemo(() => {
    return Array.from(
      new Set(blocks.map((block) => block.training_day)),
    ).sort();
  }, [blocks]);

  const timeline = useMemo(() => {
    if (!blocks.length) {
      return {
        start: 8 * 60,
        end: 18 * 60,
        marks: [] as number[],
        height: 0,
      };
    }

    const starts = blocks.map((block) => timeToMinutes(block.start_time));
    const ends = blocks.map((block) => timeToMinutes(block.end_time));

    // Le planning s'adapte réellement aux horaires saisis.
    // On garde seulement 15 minutes de marge visuelle avant/après.
    const start = Math.floor((Math.min(...starts) - 15) / 15) * 15;
    const end = Math.ceil((Math.max(...ends) + 15) / 15) * 15;

    const marks = new Set<number>();
    for (let value = start; value <= end; value += 15) {
      marks.add(value);
    }

    // Les horaires exacts saisis sont toujours affichés, même s'ils ne
    // tombent pas sur un quart d'heure (ex. 09:10, 09:45, 10:05).
    blocks.forEach((block) => {
      marks.add(timeToMinutes(block.start_time));
      marks.add(timeToMinutes(block.end_time));
    });

    const PIXELS_PER_MINUTE = 2.55;

    return {
      start,
      end,
      marks: Array.from(marks).sort((a, b) => a - b),
      height: Math.max(180, (end - start) * PIXELS_PER_MINUTE),
    };
  }, [blocks]);

  const minuteToTop = (minute: number) => {
    if (timeline.end <= timeline.start) return 0;
    return ((minute - timeline.start) / (timeline.end - timeline.start)) * timeline.height;
  };

  const selectedBlock =
    blocks.find((block) => block.id === selectedBlockId) ?? null;
  const selectedAssets = selectedBlock
    ? assets.filter((asset) => asset.block_id === selectedBlock.id)
    : [];

  return (
    <section className="planning">
      {message && <div className="toast">{message}</div>}

      <div className="hero">
        <div>
          <p>PLANNING FORMATION</p>
          <h1>Organisation pédagogique</h1>
          <span>
            Chaque bloc alimente automatiquement le planning et les
            demi-journées de présence.
          </span>
        </div>

        <div className="planning-actions">
          <label>
            <span>Titre du planning</span>
            <input
              value={planningTitle}
              onChange={(e) => setPlanningTitle(e.target.value)}
              onBlur={() => void savePlanningTitle()}
              placeholder="Ex. Kick Off 2026-2027"
            />
          </label>

          <button
            disabled={savingPlanning}
            onClick={() => void savePlanning()}
          >
            {savingPlanning ? "Sauvegarde…" : "Sauvegarder le planning"}
          </button>

          <button
            className="secondary"
            disabled={exporting || savingPlanning}
            onClick={() => void exportPlanning()}
          >
            {exporting ? "Export…" : "Exporter PDF + Documents"}
          </button>
        </div>
      </div>

      <div className="create-card">
        <h2>Ajouter un bloc au planning</h2>

        <div className="form-grid">
          <label>
            <span>Date</span>
            <input
              type="date"
              value={form.training_day}
              onChange={(e) =>
                setForm({ ...form, training_day: e.target.value })
              }
            />
          </label>

          <label>
            <span>Début</span>
            <input
              type="time"
              value={form.start_time}
              onChange={(e) =>
                setForm({ ...form, start_time: e.target.value })
              }
            />
          </label>

          <label>
            <span>Fin</span>
            <input
              type="time"
              value={form.end_time}
              onChange={(e) =>
                setForm({ ...form, end_time: e.target.value })
              }
            />
          </label>

          <label>
            <span>Type</span>
            <select
              value={form.block_type}
              onChange={(e) =>
                setForm({ ...form, block_type: e.target.value })
              }
            >
              {BLOCK_TYPES.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Nom de la formation</span>
            <input
              value={form.formation_name}
              onChange={(e) =>
                setForm({ ...form, formation_name: e.target.value })
              }
              placeholder="DETB CS1"
            />
          </label>

          <label>
            <span>Intervenant</span>
            <input
              value={form.instructor_name}
              onChange={(e) =>
                setForm({ ...form, instructor_name: e.target.value })
              }
              placeholder="Nom / prénom"
            />
          </label>

          <label>
            <span>Salle / terrain</span>
            <input
              value={form.room_name}
              onChange={(e) =>
                setForm({ ...form, room_name: e.target.value })
              }
              placeholder="Annexe 3 / Terrain / Salle fédérale..."
            />
          </label>

          <label>
            <span>Lieu</span>
            <select
              value={form.location_type}
              onChange={(e) =>
                setForm({ ...form, location_type: e.target.value })
              }
            >
              <option value="salle">Salle</option>
              <option value="terrain">Terrain</option>
              <option value="visio">Visio</option>
              <option value="autre">Autre</option>
            </select>
          </label>

          <label className="wide">
            <span>Titre / contenu</span>
            <input
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
              placeholder="Être capable de déterminer les éléments clefs du tir..."
            />
          </label>

          <label className="wide">
            <span>Description / consigne</span>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>

          <label className="wide">
            <span>Scénario pédagogique</span>
            <select
              value={form.pedagogical_scenario_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  pedagogical_scenario_id: e.target.value,
                })
              }
            >
              <option value="">Aucun</option>
              {scenarios.map((scenario) => (
                <option value={scenario.id} key={scenario.id}>
                  {scenario.title}
                </option>
              ))}
            </select>
          </label>

          <div className="wide attachment-create">
            <div>
              <span className="field-label">Pièce jointe</span>
              <small>
                PDF, PowerPoint, Keynote, Word… La pièce sera liée au
                bloc dès sa création.
              </small>
            </div>

            <label className="attachment-picker">
              <span>
                {pendingAsset
                  ? `📎 ${pendingAsset.name}`
                  : "+ Choisir une pièce jointe"}
              </span>
              <input
                hidden
                type="file"
                accept=".pdf,.ppt,.pptx,.key,.doc,.docx"
                onChange={(e) => {
                  setPendingAsset(e.target.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            {pendingAsset && (
              <button
                type="button"
                className="remove-pending"
                onClick={() => setPendingAsset(null)}
              >
                Retirer
              </button>
            )}
          </div>
        </div>

        <button
          className="primary"
          disabled={uploadingAsset}
          onClick={() => void createBlock()}
        >
          {uploadingAsset
            ? "Ajout…"
            : pendingAsset
              ? "+ Ajouter au planning avec la pièce jointe"
              : "+ Ajouter au planning"}
        </button>
      </div>

      <div className="board-card">
        <div className="board-head">
          <div>
            <p>VUE SEMAINE / SESSION</p>
            <h2>Planning</h2>
          </div>
          <span>
            Clique sur un bloc pour ouvrir, télécharger ou ajouter ses
            pièces jointes.
          </span>
        </div>

        {!days.length ? (
          <div className="empty">
            Aucun bloc pour cette promotion.
          </div>
        ) : (
          <div className="table-scroll">
            <div
              className="timeline-board"
              style={{
                gridTemplateColumns: `82px repeat(${days.length}, minmax(245px, 1fr))`,
              }}
            >
              <div className="corner" />
              {days.map((day) => (
                <div className="day-head" key={day}>
                  {formatDay(day)}
                </div>
              ))}

              <div className="time-axis" style={{ height: timeline.height }}>
                {timeline.marks.map((minute) => {
                  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
                  const mm = String(minute % 60).padStart(2, "0");

                  return (
                    <span
                      className="time-mark"
                      key={`time-${minute}`}
                      style={{ top: minuteToTop(minute) }}
                    >
                      {hh}:{mm}
                    </span>
                  );
                })}
              </div>

              {days.map((day) => {
                const dayBlocks = blocks.filter(
                  (block) => block.training_day === day,
                );

                return (
                  <div
                    className="day-column"
                    key={`column-${day}`}
                    style={{ height: timeline.height }}
                  >
                    {timeline.marks.map((minute) => (
                      <span
                        className="timeline-line"
                        key={`${day}-line-${minute}`}
                        style={{ top: minuteToTop(minute) }}
                      />
                    ))}

                    {dayBlocks.map((block) => {
                      const startMinute = timeToMinutes(block.start_time);
                      const endMinute = timeToMinutes(block.end_time);
                      const top = minuteToTop(startMinute);
                      const bottom = minuteToTop(endMinute);
                      const blockAssetCount = assets.filter(
                        (asset) => asset.block_id === block.id,
                      ).length;

                      return (
                        <button
                          key={block.id}
                          className={`block type-${block.block_type} ${selectedBlockId === block.id ? "selected" : ""}`}
                          style={{
                            top,
                            height: Math.max(1, bottom - top),
                          }}
                          onClick={() => setSelectedBlockId(block.id)}
                        >
                          <div className="block-headline">
                            <div className="block-headline-main">
                              <span className="block-time">
                                {block.start_time.slice(0, 5)} → {block.end_time.slice(0, 5)}
                              </span>
                              <span className="block-duration">
                                {timeToMinutes(block.end_time) - timeToMinutes(block.start_time)} min
                              </span>
                              {block.formation_name && (
                                <span className="block-formation">{block.formation_name}</span>
                              )}
                            </div>
                            <span className="block-type">
                              {blockTypeLabel(block.block_type)}
                            </span>
                          </div>

                          <div className="block-mainline">
                            <strong className="block-title">{block.title}</strong>
                          </div>

                          <div className="block-bottomline">
                            <div className="block-meta">
                              {block.instructor_name && (
                                <span title="Intervenant">👤 {block.instructor_name}</span>
                              )}
                              {block.room_name && (
                                <span title="Salle / terrain">📍 {block.room_name}</span>
                              )}
                            </div>

                            <div className="block-flags">
                              {block.pedagogical_scenario_id && (
                                <span title="Scénario pédagogique lié">📘</span>
                              )}
                              {blockAssetCount > 0 && (
                                <span title={`${blockAssetCount} pièce(s) jointe(s)`}>
                                  📎 {blockAssetCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedBlock && (
        <div className="detail-card">
          <div className="detail-head">
            <div>
              <p>BLOC SÉLECTIONNÉ</p>
              <h2>{selectedBlock.title}</h2>
              <span>
                {formatDay(selectedBlock.training_day)} · {selectedBlock.start_time.slice(0, 5)} → {selectedBlock.end_time.slice(0, 5)}
              </span>
            </div>

            <button
              className="danger"
              onClick={() => void deleteBlock(selectedBlock.id)}
            >
              Supprimer
            </button>
          </div>

          <div className="selected-summary">
            <div><small>Formation</small><strong>{selectedBlock.formation_name || "—"}</strong></div>
            <div><small>Type</small><strong>{blockTypeLabel(selectedBlock.block_type)}</strong></div>
            <div><small>Intervenant</small><strong>{selectedBlock.instructor_name || "—"}</strong></div>
            <div><small>Salle / terrain</small><strong>{selectedBlock.room_name || "—"}</strong></div>
            {selectedBlock.description && (
              <div className="selected-description">
                <small>Description / consigne</small>
                <strong>{selectedBlock.description}</strong>
              </div>
            )}
          </div>

          <div className="detail-grid">
            <label>
              <span>Scénario pédagogique</span>
              <select
                value={
                  selectedBlock.pedagogical_scenario_id ?? ""
                }
                onChange={(e) =>
                  void attachScenario(
                    selectedBlock.id,
                    e.target.value,
                  )
                }
              >
                <option value="">Aucun</option>
                {scenarios.map((scenario) => (
                  <option
                    key={scenario.id}
                    value={scenario.id}
                  >
                    {scenario.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="upload">
              + Ajouter une pièce jointe
              <input
                hidden
                type="file"
                accept=".pdf,.ppt,.pptx,.key,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void uploadAsset(selectedBlock.id, file);
                  }
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="assets">
            {selectedAssets.map((asset) => (
              <article className="asset-card" key={asset.id}>
                <div className="asset-name">
                  <span>{assetIcon(asset)}</span>
                  <strong>{asset.title}</strong>
                </div>

                <div className="asset-actions">
                  <a
                    href={asset.file_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir
                  </a>
                  <button
                    type="button"
                    onClick={() => void downloadAsset(asset)}
                  >
                    Télécharger
                  </button>
                </div>
              </article>
            ))}

            {!selectedAssets.length && (
              <div className="empty">
                Aucune pièce jointe à cette intervention.
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .planning {
          display: grid;
          gap: 14px;
        }
        .planning-actions {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) auto;
          gap: 8px;
          align-items: end;
        }
        .planning-actions label {
          display: grid;
          gap: 4px;
          font-size: 0.72rem;
          font-weight: 900;
          color: #6b1a2c;
        }
        .planning-actions input {
          border: 1px solid #d8c9c2;
          border-radius: 9px;
          padding: 9px;
          background: #fff;
        }
        .secondary {
          background: #fff !important;
          color: #6b1a2c !important;
          border: 1px solid #d8bbc2 !important;
        }
        .hero {
          background: linear-gradient(135deg, #6b1a2c, #35101a);
          color: #fff;
          border-radius: 23px;
          padding: 22px;
        }
        .hero p,
        .board-head p,
        .detail-head p {
          margin: 0;
          color: #d4a24c;
          font-weight: 1000;
          letter-spacing: 0.12em;
          font-size: 0.68rem;
        }
        .hero h1,
        .board-head h2,
        .detail-head h2 {
          margin: 5px 0;
        }
        .create-card,
        .board-card,
        .detail-card {
          background: #fff;
          border: 1px solid #eadfd8;
          border-radius: 16px;
          padding: 16px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .form-grid label,
        .detail-grid label {
          display: grid;
          gap: 4px;
        }
        .form-grid label span,
        .detail-grid label span,
        .field-label {
          font-size: 0.65rem;
          text-transform: uppercase;
          font-weight: 900;
          color: #7c6d65;
        }
        .form-grid input,
        .form-grid select,
        .form-grid textarea,
        .detail-grid select {
          border: 1px solid #ddd1ca;
          border-radius: 8px;
          padding: 8px;
          width: 100%;
        }
        .wide {
          grid-column: 1/-1;
        }
        .attachment-create {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          border: 1px dashed #d7c5be;
          background: #faf7f5;
          border-radius: 10px;
          padding: 10px;
        }
        .attachment-create small {
          display: block;
          margin-top: 3px;
          color: #887a74;
          font-size: 0.68rem;
        }
        .attachment-picker {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          padding: 8px 11px;
          border-radius: 8px;
          border: 1px solid #d7bbc2;
          background: #fff;
          color: #6b1a2c;
          cursor: pointer;
          font-weight: 900;
          max-width: 360px;
        }
        .attachment-picker span {
          color: #6b1a2c !important;
          text-transform: none !important;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .remove-pending {
          background: transparent;
          color: #9d2731;
          border: 0;
          cursor: pointer;
          font-weight: 900;
        }
        .primary,
        .upload {
          display: inline-block;
          margin-top: 10px;
          background: #6b1a2c;
          color: #fff;
          border: 0;
          border-radius: 9px;
          padding: 9px 12px;
          font-weight: 950;
          cursor: pointer;
        }
        .primary:disabled {
          opacity: 0.55;
          cursor: wait;
        }
        .board-head,
        .detail-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .board-head > span,
        .detail-head > div > span {
          color: #85766e;
          font-size: 0.77rem;
        }
        .table-scroll {
          overflow: auto;
          margin-top: 12px;
        }
        .timeline-board {
          display: grid;
          min-width: max-content;
          border: 1px solid #ded4cd;
          background: #fff;
        }
        .corner,
        .day-head {
          min-height: 38px;
          border-right: 1px solid #ded4cd;
          border-bottom: 1px solid #ded4cd;
        }
        .corner {
          background: #f2efec;
        }
        .day-head {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #2e2826;
          color: #fff;
          font-weight: 950;
          text-transform: capitalize;
        }
        .time-axis {
          position: relative;
          background: #f6f3f1;
          border-right: 1px solid #ded4cd;
          min-width: 82px;
        }
        .time-mark {
          position: absolute;
          right: 8px;
          transform: translateY(-50%);
          color: #5d5154;
          font-size: .64rem;
          font-weight: 900;
          white-space: nowrap;
        }
        .day-column {
          position: relative;
          min-width: 270px;
          border-right: 2px solid #cdbfba;
          overflow: hidden;
          background:
            linear-gradient(
              to right,
              #faf7f5 0,
              #faf7f5 8px,
              #fff 8px,
              #fff calc(100% - 8px),
              #faf7f5 calc(100% - 8px)
            );
        }
        .timeline-line {
          position: absolute;
          left: 8px;
          right: 8px;
          height: 1px;
          background: #eee7e3;
          pointer-events: none;
        }
        .block {
          position: absolute;
          left: 7px;
          right: 7px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 4px;
          text-align: left;
          padding: 7px 9px;
          background: #fff;
          border: 1px solid #dbc9c3;
          border-left: 4px solid #6b1a2c;
          border-radius: 7px;
          cursor: pointer;
          overflow: hidden;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(49,31,36,.07);
          transition: background .15s ease, box-shadow .15s ease;
        }
        .block:hover {
          background: #fffaf7;
          box-shadow: 0 3px 8px rgba(49,31,36,.13);
          z-index: 2;
        }
        .block.selected {
          background: #fff7f2;
          border-color: #6b1a2c;
          box-shadow: 0 0 0 2px rgba(107,26,44,.14);
          z-index: 3;
        }
        .block-headline,
        .block-bottomline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .block-headline-main {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow: hidden;
        }
        .block-time {
          flex: 0 0 auto;
          color: #3a2b2e !important;
          font-size: .63rem !important;
          font-weight: 1000;
          white-space: nowrap;
        }
        .block-duration {
          flex: 0 0 auto;
          color: #8b7b7e !important;
          font-size: .53rem !important;
          font-weight: 900;
          white-space: nowrap;
        }
        .block-formation {
          min-width: 0;
          color: #8a5b12 !important;
          font-size: .58rem !important;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: .03em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .block-type {
          flex: 0 0 auto;
          padding: 2px 6px;
          border-radius: 999px;
          background: #f3ece8;
          color: #78676a !important;
          font-size: .53rem !important;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .03em;
          white-space: nowrap;
        }
        .block-mainline {
          display: flex;
          min-width: 0;
          width: 100%;
        }
        .block-title {
          width: 100%;
          color: #321f24;
          font-size: .76rem;
          line-height: 1.08;
          font-weight: 1000;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .block-meta {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          overflow: hidden;
          padding: 0;
          border: 0;
        }
        .block-meta span {
          min-width: 0;
          color: #62575a !important;
          font-size: .57rem !important;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .block-flags {
          display: flex;
          align-items: center;
          gap: 5px;
          flex: 0 0 auto;
        }
        .block-flags span {
          color: #6b1a2c !important;
          font-size: .56rem !important;
          font-weight: 900;
          white-space: nowrap;
        }
        .type-court {
          background: #fff9f7;
          border-left-color: #ba4e3d;
        }
        .type-meeting {
          background: #f8f4ff;
          border-left-color: #7962aa;
        }
        .type-meal {
          background: #f3f1ef;
          border-left-color: #8a8179;
        }
        .type-assessment {
          background: #fff4e8;
          border-left-color: #d9902f;
        }
        .type-break {
          background: #f8f8f8;
          border-left-color: #a49a95;
        }
        .type-other {
          border-left-color: #80726f;
        }
        .selected-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
          padding: 10px;
          border: 1px solid #eee3df;
          border-radius: 10px;
          background: #fbf8f6;
        }
        .selected-summary > div {
          min-width: 0;
        }
        .selected-summary small,
        .selected-summary strong {
          display: block;
        }
        .selected-summary small {
          margin-bottom: 3px;
          color: #8a7770;
          font-size: .58rem;
          font-weight: 900;
          text-transform: uppercase;
        }
        .selected-summary strong {
          color: #3b2a2d;
          font-size: .72rem;
          line-height: 1.25;
        }
        .selected-description {
          grid-column: 1 / -1;
          padding-top: 7px;
          border-top: 1px solid #eadfda;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 9px;
          align-items: end;
          margin-top: 10px;
        }
        .danger {
          border: 1px solid #b42318;
          background: #fff;
          color: #b42318;
          border-radius: 9px;
          padding: 8px 10px;
          font-weight: 900;
        }
        .assets {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
          margin-top: 12px;
        }
        .asset-card {
          display: grid;
          gap: 9px;
          border: 1px solid #eee4df;
          border-radius: 10px;
          padding: 10px;
          min-width: 0;
        }
        .asset-name {
          display: flex;
          gap: 8px;
          align-items: center;
          min-width: 0;
          color: #6b1a2c;
        }
        .asset-name strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .asset-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .asset-actions a,
        .asset-actions button {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          border: 1px solid #d9c8c2;
          border-radius: 8px;
          padding: 6px 8px;
          text-decoration: none;
          background: #fff;
          color: #6b1a2c;
          font: inherit;
          font-size: 0.72rem;
          font-weight: 900;
          cursor: pointer;
        }
        .empty {
          color: #897b73;
          padding: 12px;
        }
        .toast {
          position: fixed;
          top: 15px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          background: #231b18;
          color: #fff;
          border-radius: 999px;
          padding: 10px 17px;
          font-weight: 900;
        }
        @media (max-width: 900px) {
          .form-grid {
            grid-template-columns: 1fr 1fr;
          }
          .assets {
            grid-template-columns: 1fr;
          }
          .detail-grid {
            grid-template-columns: 1fr;
          }
          .attachment-create {
            grid-template-columns: 1fr;
          }
          .selected-summary {
            grid-template-columns: 1fr 1fr;
          }
          .attachment-picker {
            max-width: none;
          }
        }
        @media (max-width: 600px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
          .wide {
            grid-column: auto;
          }
        }
      `}</style>
    </section>
  );
}
