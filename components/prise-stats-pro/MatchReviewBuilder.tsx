'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './MatchReviewBuilder.module.css';

export type MatchReviewControlType =
  | 'button'
  | 'plus-minus'
  | 'counter'
  | 'rating'
  | 'choice'
  | 'text';

export type MatchReviewFlowStepType =
  | 'block'
  | 'control'
  | 'player'
  | 'value'
  | 'comment'
  | 'clip'
  | 'save';

export type MatchReviewControl = {
  id: string;
  label: string;
  type: MatchReviewControlType;
  color: string;
  value?: number;
  shortcut?: string;
  requirePlayer?: boolean;
  requireComment?: boolean;
  createClip?: boolean;
  preRoll?: number;
  postRoll?: number;
  options?: string[];
};

export type MatchReviewBlock = {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
  columns: 1 | 2 | 3 | 4;
  controls: MatchReviewControl[];
};

export type MatchReviewFlowStep = {
  id: string;
  type: MatchReviewFlowStepType;
  required: boolean;
};

export type MatchReviewLayout = {
  columns: 1 | 2 | 3;
  compact: boolean;
  showPlayerPanel: boolean;
  showVideo: boolean;
  showHistory: boolean;
};

export type MatchReviewTemplate = {
  id: string;
  name: string;
  description: string;
  blocks: MatchReviewBlock[];
  flow: MatchReviewFlowStep[];
  layout: MatchReviewLayout;
  updatedAt: string;
};

export type MatchReviewEvent = {
  id: string;
  templateId: string;
  templateName: string;
  blockId: string;
  blockTitle: string;
  controlId: string;
  controlLabel: string;
  controlType: MatchReviewControlType;
  value: string | number | null;
  playerId: string | null;
  playerName: string | null;
  comment: string;
  createClip: boolean;
  preRoll: number;
  postRoll: number;
  videoTime: number | null;
  createdAt: string;
};

type PlayerOption = { id: string; name: string; num?: number | string | null };

type Props = {
  projectId?: string | null;
  players?: PlayerOption[];
  getVideoTime?: () => number | null;
  embedded?: boolean;
  initialEditorOpen?: boolean;
  onClose?: () => void;
  onRecord?: (event: MatchReviewEvent) => void;
  onLayoutChange?: (layout: MatchReviewLayout) => void;
};

const TEMPLATE_STORAGE = 'mybasket.match-review.templates.v2';
const ACTIVE_TEMPLATE_STORAGE = 'mybasket.match-review.active-template.v2';
const EVENT_STORAGE_PREFIX = 'mybasket.match-review.events.v2.';

const uid = () => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}_${Math.random().toString(36).slice(2)}`; }
};

const blankTemplate = (): MatchReviewTemplate => ({
  id: uid(),
  name: 'Nouveau retour de match',
  description: 'Configuration 100 % personnalisable',
  blocks: [],
  flow: [
    { id: uid(), type: 'block', required: true },
    { id: uid(), type: 'control', required: true },
    { id: uid(), type: 'player', required: false },
    { id: uid(), type: 'value', required: false },
    { id: uid(), type: 'comment', required: false },
    { id: uid(), type: 'clip', required: false },
    { id: uid(), type: 'save', required: true },
  ],
  layout: {
    columns: 2,
    compact: false,
    showPlayerPanel: true,
    showVideo: true,
    showHistory: true,
  },
  updatedAt: new Date().toISOString(),
});

const stepLabels: Record<MatchReviewFlowStepType, string> = {
  block: 'Bloc',
  control: 'Bouton / action',
  player: 'Joueur',
  value: 'Valeur',
  comment: 'Commentaire',
  clip: 'Clip vidéo',
  save: 'Enregistrer',
};

const typeLabels: Record<MatchReviewControlType, string> = {
  button: 'Bouton simple',
  'plus-minus': '+ / −',
  counter: 'Compteur',
  rating: 'Note',
  choice: 'Choix multiple',
  text: 'Texte / commentaire',
};

const safeParseTemplates = (): MatchReviewTemplate[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const normalizeHex = (value: string, fallback = '#6B1A2C') => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export default function MatchReviewBuilder({
  projectId,
  players = [],
  getVideoTime,
  embedded = false,
  initialEditorOpen = false,
  onClose,
  onRecord,
  onLayoutChange,
}: Props) {
  const [templates, setTemplates] = useState<MatchReviewTemplate[]>([]);
  const [activeId, setActiveId] = useState('');
  const [editorOpen, setEditorOpen] = useState(initialEditorOpen);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [events, setEvents] = useState<MatchReviewEvent[]>([]);
  const [pending, setPending] = useState<{ block: MatchReviewBlock; control: MatchReviewControl } | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState('');
  const [pendingComment, setPendingComment] = useState('');
  const [pendingValue, setPendingValue] = useState<string | number>('');
  const [runtimePlayerId, setRuntimePlayerId] = useState('');

  useEffect(() => {
    const stored = safeParseTemplates();
    const next = stored.length ? stored : [blankTemplate()];
    const storedActive = localStorage.getItem(ACTIVE_TEMPLATE_STORAGE) || '';
    const resolved = next.some((template) => template.id === storedActive) ? storedActive : next[0].id;
    setTemplates(next);
    setActiveId(resolved);
    if (!stored.length) localStorage.setItem(TEMPLATE_STORAGE, JSON.stringify(next));
  }, []);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(localStorage.getItem(`${EVENT_STORAGE_PREFIX}${projectId}`) || '[]');
      setEvents(Array.isArray(parsed) ? parsed : []);
    } catch { setEvents([]); }
  }, [projectId]);

  const active = useMemo(
    () => templates.find((template) => template.id === activeId) || templates[0] || null,
    [templates, activeId],
  );

  useEffect(() => {
    if (active) onLayoutChange?.(active.layout);
  }, [active, onLayoutChange]);

  const persistTemplates = (next: MatchReviewTemplate[]) => {
    setTemplates(next);
    if (typeof window !== 'undefined') localStorage.setItem(TEMPLATE_STORAGE, JSON.stringify(next));
  };

  const setActiveTemplateId = (id: string) => {
    setActiveId(id);
    if (typeof window !== 'undefined') localStorage.setItem(ACTIVE_TEMPLATE_STORAGE, id);
    setSelectedBlockId(null);
    setSelectedControlId(null);
  };

  const updateActive = (updater: (template: MatchReviewTemplate) => MatchReviewTemplate) => {
    if (!active) return;
    persistTemplates(templates.map((template) => template.id === active.id
      ? { ...updater(template), updatedAt: new Date().toISOString() }
      : template));
  };

  const addTemplate = () => {
    const template = blankTemplate();
    persistTemplates([...templates, template]);
    setActiveTemplateId(template.id);
    setEditorOpen(true);
  };

  const duplicateTemplate = () => {
    if (!active) return;
    const copy: MatchReviewTemplate = {
      ...active,
      id: uid(),
      name: `${active.name} — copie`,
      blocks: active.blocks.map((block) => ({
        ...block,
        id: uid(),
        controls: block.controls.map((control) => ({ ...control, id: uid() })),
      })),
      flow: active.flow.map((step) => ({ ...step, id: uid() })),
      updatedAt: new Date().toISOString(),
    };
    persistTemplates([...templates, copy]);
    setActiveTemplateId(copy.id);
  };

  const deleteTemplate = () => {
    if (!active) return;
    if (templates.length === 1) {
      const fresh = blankTemplate();
      persistTemplates([fresh]);
      setActiveTemplateId(fresh.id);
      return;
    }
    if (!window.confirm(`Supprimer le modèle « ${active.name} » ?`)) return;
    const next = templates.filter((template) => template.id !== active.id);
    persistTemplates(next);
    setActiveTemplateId(next[0].id);
  };

  const addBlock = () => {
    const block: MatchReviewBlock = {
      id: uid(),
      title: `Bloc ${active ? active.blocks.length + 1 : 1}`,
      subtitle: '',
      color: '#6B1A2C',
      columns: 2,
      controls: [],
    };
    updateActive((template) => ({ ...template, blocks: [...template.blocks, block] }));
    setSelectedBlockId(block.id);
    setSelectedControlId(null);
  };

  const updateBlock = (blockId: string, patch: Partial<MatchReviewBlock>) => {
    updateActive((template) => ({
      ...template,
      blocks: template.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
  };

  const deleteBlock = (blockId: string) => {
    updateActive((template) => ({ ...template, blocks: template.blocks.filter((block) => block.id !== blockId) }));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
      setSelectedControlId(null);
    }
  };

  const moveBlock = (blockId: string, delta: -1 | 1) => {
    if (!active) return;
    const index = active.blocks.findIndex((block) => block.id === blockId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= active.blocks.length) return;
    const blocks = active.blocks.slice();
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    updateActive((template) => ({ ...template, blocks }));
  };

  const addControl = (blockId: string) => {
    const control: MatchReviewControl = {
      id: uid(),
      label: 'Nouveau bouton',
      type: 'button',
      color: '#D4A24C',
      value: 1,
      requirePlayer: false,
      requireComment: false,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      options: ['Option 1', 'Option 2'],
    };
    updateActive((template) => ({
      ...template,
      blocks: template.blocks.map((block) => block.id === blockId
        ? { ...block, controls: [...block.controls, control] }
        : block),
    }));
    setSelectedBlockId(blockId);
    setSelectedControlId(control.id);
  };

  const updateControl = (blockId: string, controlId: string, patch: Partial<MatchReviewControl>) => {
    updateActive((template) => ({
      ...template,
      blocks: template.blocks.map((block) => block.id === blockId ? {
        ...block,
        controls: block.controls.map((control) => control.id === controlId ? { ...control, ...patch } : control),
      } : block),
    }));
  };

  const deleteControl = (blockId: string, controlId: string) => {
    updateActive((template) => ({
      ...template,
      blocks: template.blocks.map((block) => block.id === blockId
        ? { ...block, controls: block.controls.filter((control) => control.id !== controlId) }
        : block),
    }));
    if (selectedControlId === controlId) setSelectedControlId(null);
  };

  const moveControl = (blockId: string, controlId: string, delta: -1 | 1) => {
    if (!active) return;
    const block = active.blocks.find((item) => item.id === blockId);
    if (!block) return;
    const index = block.controls.findIndex((control) => control.id === controlId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= block.controls.length) return;
    const controls = block.controls.slice();
    [controls[index], controls[target]] = [controls[target], controls[index]];
    updateBlock(blockId, { controls });
  };

  const addFlowStep = () => {
    updateActive((template) => ({
      ...template,
      flow: [...template.flow, { id: uid(), type: 'comment', required: false }],
    }));
  };

  const updateFlowStep = (stepId: string, patch: Partial<MatchReviewFlowStep>) => {
    updateActive((template) => ({
      ...template,
      flow: template.flow.map((step) => step.id === stepId ? { ...step, ...patch } : step),
    }));
  };

  const moveFlowStep = (stepId: string, delta: -1 | 1) => {
    if (!active) return;
    const index = active.flow.findIndex((step) => step.id === stepId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= active.flow.length) return;
    const flow = active.flow.slice();
    [flow[index], flow[target]] = [flow[target], flow[index]];
    updateActive((template) => ({ ...template, flow }));
  };

  const removeFlowStep = (stepId: string) => {
    updateActive((template) => ({ ...template, flow: template.flow.filter((step) => step.id !== stepId) }));
  };

  const beginControl = (block: MatchReviewBlock, control: MatchReviewControl, forcedValue?: string | number) => {
    setPending({ block, control });
    setPendingPlayerId(runtimePlayerId);
    setPendingComment('');
    if (forcedValue != null) setPendingValue(forcedValue);
    else if (control.type === 'button' || control.type === 'counter') setPendingValue(control.value ?? 1);
    else if (control.type === 'rating') setPendingValue(3);
    else setPendingValue('');
  };

  const saveEvent = () => {
    if (!active || !pending) return;
    const { block, control } = pending;
    if (control.requirePlayer && !pendingPlayerId) return;
    if (control.requireComment && !pendingComment.trim()) return;
    if ((control.type === 'choice' || control.type === 'plus-minus' || control.type === 'rating') && pendingValue === '') return;
    const player = players.find((item) => item.id === pendingPlayerId) || null;
    const event: MatchReviewEvent = {
      id: uid(),
      templateId: active.id,
      templateName: active.name,
      blockId: block.id,
      blockTitle: block.title,
      controlId: control.id,
      controlLabel: control.label,
      controlType: control.type,
      value: pendingValue === '' ? null : pendingValue,
      playerId: player?.id || null,
      playerName: player?.name || null,
      comment: pendingComment.trim(),
      createClip: !!control.createClip,
      preRoll: Math.max(0, Number(control.preRoll || 0)),
      postRoll: Math.max(0, Number(control.postRoll || 0)),
      videoTime: getVideoTime ? getVideoTime() : null,
      createdAt: new Date().toISOString(),
    };
    const next = [event, ...events];
    setEvents(next);
    if (projectId && typeof window !== 'undefined') localStorage.setItem(`${EVENT_STORAGE_PREFIX}${projectId}`, JSON.stringify(next));
    onRecord?.(event);
    setPending(null);
  };

  const selectedBlock = active?.blocks.find((block) => block.id === selectedBlockId) || null;
  const selectedControl = selectedBlock?.controls.find((control) => control.id === selectedControlId) || null;

  if (!active) return null;

  const runtime = (
    <div className={styles.runtime}>
      <div className={styles.runtimeHead}>
        <div>
          <strong>{active.name}</strong>
          <span>{active.description || 'Retour de match personnalisé'}</span>
        </div>
        <button type="button" onClick={() => setEditorOpen(true)}>⚙ Personnaliser</button>
      </div>
      <div className={styles.flowPreview}>
        {active.flow.map((step, index) => (
          <span key={step.id}>{index > 0 && <i>→</i>}{stepLabels[step.type]}{step.required ? ' *' : ''}</span>
        ))}
      </div>
      {active.layout.showPlayerPanel && players.length > 0 && (
        <div className={styles.playerStrip}>
          <button type="button" className={!runtimePlayerId ? styles.playerOn : ''} onClick={() => setRuntimePlayerId('')}>Équipe</button>
          {players.map((player) => (
            <button key={player.id} type="button" className={runtimePlayerId === player.id ? styles.playerOn : ''} onClick={() => setRuntimePlayerId(player.id)}>
              {player.num != null ? <b>#{player.num}</b> : null}<span>{player.name}</span>
            </button>
          ))}
        </div>
      )}
      {active.blocks.length === 0 ? (
        <button type="button" className={styles.emptyBuilder} onClick={() => setEditorOpen(true)}>
          ＋ Créer mon premier bloc
          <small>Retour de match est vide : construis entièrement ta logique.</small>
        </button>
      ) : (
        <div className={styles.runtimeBlocks} style={{ gridTemplateColumns: `repeat(${active.layout.columns}, minmax(0, 1fr))` }}>
          {active.blocks.map((block) => (
            <section key={block.id} className={styles.runtimeBlock} style={{ borderColor: normalizeHex(block.color) }}>
              <header style={{ background: `${normalizeHex(block.color)}22` }}>
                <div><strong>{block.title}</strong>{block.subtitle && <span>{block.subtitle}</span>}</div>
              </header>
              <div className={styles.runtimeControls} style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` }}>
                {block.controls.map((control) => {
                  if (control.type === 'plus-minus') {
                    return (
                      <div key={control.id} className={styles.pmControl}>
                        <span>{control.label}</span>
                        <div><button type="button" onClick={() => beginControl(block, control, -1)}>−</button><button type="button" onClick={() => beginControl(block, control, 1)}>＋</button></div>
                      </div>
                    );
                  }
                  if (control.type === 'rating') {
                    return (
                      <div key={control.id} className={styles.ratingControl}>
                        <span>{control.label}</span>
                        <div>{[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => beginControl(block, control, value)}>{value}</button>)}</div>
                      </div>
                    );
                  }
                  if (control.type === 'choice') {
                    return (
                      <div key={control.id} className={styles.choiceControl}>
                        <span>{control.label}</span>
                        <div>{(control.options || []).map((option) => <button key={option} type="button" onClick={() => beginControl(block, control, option)}>{option}</button>)}</div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={control.id}
                      type="button"
                      className={styles.runtimeButton}
                      style={{ borderColor: normalizeHex(control.color, '#D4A24C'), background: `${normalizeHex(control.color, '#D4A24C')}1f` }}
                      onClick={() => beginControl(block, control)}
                    >
                      <b>{control.label}</b>
                      <small>{typeLabels[control.type]}{control.shortcut ? ` · ${control.shortcut}` : ''}</small>
                    </button>
                  );
                })}
                {block.controls.length === 0 && <button type="button" className={styles.emptyControl} onClick={() => { setSelectedBlockId(block.id); setEditorOpen(true); }}>＋ Ajouter un bouton</button>}
              </div>
            </section>
          ))}
        </div>
      )}
      {active.layout.showHistory && events.length > 0 && (
        <div className={styles.history}>
          <div className={styles.historyHead}><b>Dernières saisies</b><button type="button" onClick={() => { setEvents([]); if (projectId) localStorage.removeItem(`${EVENT_STORAGE_PREFIX}${projectId}`); }}>Vider</button></div>
          {events.slice(0, 8).map((event) => <div key={event.id}><span>{event.blockTitle} · {event.controlLabel}</span><b>{event.value ?? ''}</b><small>{event.playerName || ''}{event.comment ? ` · ${event.comment}` : ''}</small></div>)}
        </div>
      )}
    </div>
  );

  return (
    <div className={embedded ? styles.embedded : styles.modalShell}>
      {runtime}

      {pending && (
        <div className={styles.pendingOverlay} onMouseDown={(event) => { if (event.currentTarget === event.target) setPending(null); }}>
          <div className={styles.pendingCard}>
            <header><div><b>{pending.block.title}</b><span>{pending.control.label}</span></div><button type="button" onClick={() => setPending(null)}>×</button></header>
            {(pending.control.requirePlayer || active.flow.some((step) => step.type === 'player' && step.required)) && (
              <label>Joueur
                <select value={pendingPlayerId} onChange={(event) => setPendingPlayerId(event.target.value)}>
                  <option value="">— Choisir —</option>
                  {players.map((player) => <option key={player.id} value={player.id}>{player.num != null ? `#${player.num} · ` : ''}{player.name}</option>)}
                </select>
              </label>
            )}
            {pending.control.type === 'text' && <label>Texte<textarea value={String(pendingValue)} onChange={(event) => setPendingValue(event.target.value)} autoFocus /></label>}
            {pending.control.type === 'counter' && <label>Valeur<input type="number" value={pendingValue} onChange={(event) => setPendingValue(Number(event.target.value))} /></label>}
            {(pending.control.requireComment || active.flow.some((step) => step.type === 'comment' && step.required)) && <label>Commentaire<textarea value={pendingComment} onChange={(event) => setPendingComment(event.target.value)} /></label>}
            {pending.control.createClip && <div className={styles.clipInfo}>🎬 Clip : {pending.control.preRoll ?? 0}s avant · {pending.control.postRoll ?? 0}s après</div>}
            <button type="button" className={styles.saveEvent} onClick={saveEvent}>Enregistrer</button>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className={styles.editorOverlay}>
          <div className={styles.editor}>
            <header className={styles.editorHead}>
              <div><b>CONSTRUCTEUR · RETOUR DE MATCH</b><span>Tout est personnalisable : blocs, boutons, ordre, logique, valeurs et comportement.</span></div>
              <button type="button" onClick={() => { setEditorOpen(false); if (!embedded) onClose?.(); }}>×</button>
            </header>

            <div className={styles.templateBar}>
              <select value={active.id} onChange={(event) => setActiveTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
              <button type="button" onClick={addTemplate}>＋ Nouveau</button>
              <button type="button" onClick={duplicateTemplate}>⧉ Dupliquer</button>
              <button type="button" className={styles.danger} onClick={deleteTemplate}>Supprimer</button>
            </div>

            <div className={styles.editorGrid}>
              <aside className={styles.builderSidebar}>
                <section>
                  <h3>Modèle</h3>
                  <label>Nom<input value={active.name} onChange={(event) => updateActive((template) => ({ ...template, name: event.target.value }))} /></label>
                  <label>Description<textarea value={active.description} onChange={(event) => updateActive((template) => ({ ...template, description: event.target.value }))} /></label>
                </section>
                <section>
                  <h3>Disposition</h3>
                  <label>Colonnes principales<select value={active.layout.columns} onChange={(event) => updateActive((template) => ({ ...template, layout: { ...template.layout, columns: Number(event.target.value) as 1|2|3 } }))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
                  <label className={styles.check}><input type="checkbox" checked={active.layout.compact} onChange={(event) => updateActive((template) => ({ ...template, layout: { ...template.layout, compact: event.target.checked } }))} /> Mode compact</label>
                  <label className={styles.check}><input type="checkbox" checked={active.layout.showPlayerPanel} onChange={(event) => updateActive((template) => ({ ...template, layout: { ...template.layout, showPlayerPanel: event.target.checked } }))} /> Afficher joueurs</label>
                  <label className={styles.check}><input type="checkbox" checked={active.layout.showVideo} onChange={(event) => updateActive((template) => ({ ...template, layout: { ...template.layout, showVideo: event.target.checked } }))} /> Afficher vidéo</label>
                  <label className={styles.check}><input type="checkbox" checked={active.layout.showHistory} onChange={(event) => updateActive((template) => ({ ...template, layout: { ...template.layout, showHistory: event.target.checked } }))} /> Historique</label>
                </section>
              </aside>

              <main className={styles.builderMain}>
                <section className={styles.flowEditor}>
                  <div className={styles.sectionHead}><div><b>1. LOGIQUE / ORDRE DE CODAGE</b><span>L'utilisateur choisit entièrement le chemin.</span></div><button type="button" onClick={addFlowStep}>＋ Étape</button></div>
                  <div className={styles.flowRows}>
                    {active.flow.map((step, index) => (
                      <div key={step.id} className={styles.flowRow}>
                        <b>{index + 1}</b>
                        <select value={step.type} onChange={(event) => updateFlowStep(step.id, { type: event.target.value as MatchReviewFlowStepType })}>{Object.entries(stepLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                        <label className={styles.check}><input type="checkbox" checked={step.required} onChange={(event) => updateFlowStep(step.id, { required: event.target.checked })} /> Obligatoire</label>
                        <button type="button" disabled={index === 0} onClick={() => moveFlowStep(step.id, -1)}>↑</button><button type="button" disabled={index === active.flow.length - 1} onClick={() => moveFlowStep(step.id, 1)}>↓</button><button type="button" onClick={() => removeFlowStep(step.id)}>×</button>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className={styles.sectionHead}><div><b>2. BLOCS ET BOUTONS</b><span>Ordre libre. Chaque bloc et chaque bouton ont leurs propres règles.</span></div><button type="button" onClick={addBlock}>＋ Bloc</button></div>
                  <div className={styles.blockEditorList}>
                    {active.blocks.map((block, blockIndex) => (
                      <div key={block.id} className={`${styles.blockEditor} ${selectedBlockId === block.id ? styles.selected : ''}`}>
                        <div className={styles.blockTitleRow} onClick={() => { setSelectedBlockId(block.id); setSelectedControlId(null); }}>
                          <span className={styles.colorDot} style={{ background: normalizeHex(block.color) }} />
                          <b>{block.title}</b><small>{block.controls.length} bouton{block.controls.length > 1 ? 's' : ''}</small>
                          <button type="button" disabled={blockIndex === 0} onClick={(event) => { event.stopPropagation(); moveBlock(block.id, -1); }}>↑</button>
                          <button type="button" disabled={blockIndex === active.blocks.length - 1} onClick={(event) => { event.stopPropagation(); moveBlock(block.id, 1); }}>↓</button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); deleteBlock(block.id); }}>×</button>
                        </div>
                        <div className={styles.controlList}>
                          {block.controls.map((control, controlIndex) => (
                            <button key={control.id} type="button" className={selectedControlId === control.id ? styles.selectedControl : ''} onClick={() => { setSelectedBlockId(block.id); setSelectedControlId(control.id); }}>
                              <span style={{ background: normalizeHex(control.color, '#D4A24C') }} />
                              <b>{control.label}</b><small>{typeLabels[control.type]}</small>
                              <i onClick={(event) => { event.stopPropagation(); moveControl(block.id, control.id, -1); }} className={controlIndex === 0 ? styles.disabled : ''}>↑</i>
                              <i onClick={(event) => { event.stopPropagation(); moveControl(block.id, control.id, 1); }} className={controlIndex === block.controls.length - 1 ? styles.disabled : ''}>↓</i>
                            </button>
                          ))}
                          <button type="button" className={styles.addControl} onClick={() => addControl(block.id)}>＋ Ajouter un bouton</button>
                        </div>
                      </div>
                    ))}
                    {active.blocks.length === 0 && <button type="button" className={styles.emptyBuilder} onClick={addBlock}>＋ Créer le premier bloc</button>}
                  </div>
                </section>
              </main>

              <aside className={styles.properties}>
                <h3>PROPRIÉTÉS</h3>
                {selectedBlock && !selectedControl && (
                  <>
                    <b>Bloc</b>
                    <label>Nom<input value={selectedBlock.title} onChange={(event) => updateBlock(selectedBlock.id, { title: event.target.value })} /></label>
                    <label>Sous-titre<input value={selectedBlock.subtitle || ''} onChange={(event) => updateBlock(selectedBlock.id, { subtitle: event.target.value })} /></label>
                    <label>Couleur<input type="color" value={normalizeHex(selectedBlock.color)} onChange={(event) => updateBlock(selectedBlock.id, { color: event.target.value })} /></label>
                    <label>Colonnes<select value={selectedBlock.columns} onChange={(event) => updateBlock(selectedBlock.id, { columns: Number(event.target.value) as 1|2|3|4 })}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
                  </>
                )}
                {selectedBlock && selectedControl && (
                  <>
                    <b>Bouton / contrôle</b>
                    <label>Libellé<input value={selectedControl.label} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { label: event.target.value })} /></label>
                    <label>Type<select value={selectedControl.type} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { type: event.target.value as MatchReviewControlType })}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Couleur<input type="color" value={normalizeHex(selectedControl.color, '#D4A24C')} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { color: event.target.value })} /></label>
                    {(selectedControl.type === 'button' || selectedControl.type === 'counter') && <label>Valeur<input type="number" value={selectedControl.value ?? 1} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { value: Number(event.target.value) })} /></label>}
                    {selectedControl.type === 'choice' && <label>Options<textarea value={(selectedControl.options || []).join('\n')} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { options: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} placeholder="Une option par ligne" /></label>}
                    <label>Raccourci<input value={selectedControl.shortcut || ''} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { shortcut: event.target.value.slice(0, 20) })} /></label>
                    <label className={styles.check}><input type="checkbox" checked={!!selectedControl.requirePlayer} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { requirePlayer: event.target.checked })} /> Demander un joueur</label>
                    <label className={styles.check}><input type="checkbox" checked={!!selectedControl.requireComment} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { requireComment: event.target.checked })} /> Demander un commentaire</label>
                    <label className={styles.check}><input type="checkbox" checked={!!selectedControl.createClip} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { createClip: event.target.checked })} /> Créer un clip</label>
                    {selectedControl.createClip && <div className={styles.twoCols}><label>Avant (s)<input type="number" min={0} value={selectedControl.preRoll ?? 0} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { preRoll: Math.max(0, Number(event.target.value)) })} /></label><label>Après (s)<input type="number" min={0} value={selectedControl.postRoll ?? 0} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { postRoll: Math.max(0, Number(event.target.value)) })} /></label></div>}
                    <button type="button" className={styles.dangerWide} onClick={() => deleteControl(selectedBlock.id, selectedControl.id)}>Supprimer ce bouton</button>
                  </>
                )}
                {!selectedBlock && <p>Sélectionne un bloc ou un bouton pour modifier tous ses paramètres.</p>}
              </aside>
            </div>

            <footer className={styles.editorFoot}>
              <span>✓ Sauvegarde automatique dans ce navigateur</span>
              <button type="button" onClick={() => setEditorOpen(false)}>Voir le mode codage</button>
            </footer>
          </div>
        </div>
      )}

      {!embedded && !editorOpen && <button type="button" className={styles.closeStandalone} onClick={onClose}>Fermer</button>}
    </div>
  );
}
