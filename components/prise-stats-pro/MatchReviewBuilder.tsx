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
  | 'passer'
  | 'receiver'
  | 'opponent'
  | 'team'
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
  /** Logique exécutée après le clic sur ce bouton. */
  logic?: MatchReviewFlowStep[];
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

const storageGet = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
};

const storageSet = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* Safari/private mode: keep working in memory */ }
};

const storageRemove = (key: string) => {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(key); } catch { /* noop */ }
};

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
  player: "Qui réalise l’action",
  passer: 'Qui réalise la passe',
  receiver: 'Qui reçoit',
  opponent: 'Joueur adverse concerné',
  team: 'Équipe / collectif',
  value: 'Résultat / valeur',
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

type PresetControl = Omit<MatchReviewControl, 'id' | 'logic'> & {
  logic?: MatchReviewFlowStepType[];
};

type PresetBlock = {
  key: string;
  label: string;
  icon: string;
  color: string;
  controls: PresetControl[];
};

const logic = (...types: MatchReviewFlowStepType[]): MatchReviewFlowStep[] =>
  types.map((type) => ({ id: uid(), type, required: !['comment', 'clip'].includes(type) }));

const PRESET_BLOCKS: PresetBlock[] = [
  {
    key: 'systeme', label: 'Système de jeu', icon: '🏀', color: '#D4A24C',
    controls: ['Contre attaque', 'Transition', 'Libre', 'Système 1', 'Système 2', 'Système 3', 'Système 4', 'Système 5', 'Système 6', 'Système 7', 'Système 8', 'SLOB 1', 'SLOB 2', 'BLOB 1', 'BLOB 2'].map((label) => ({
      label, type: 'button' as const, color: '#D4A24C', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['player', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'temps-fort', label: 'Temps fort', icon: '⚡', color: '#D4A24C',
    controls: ['1v1', 'Hand Off', 'Drive & Kick', 'Jeu sans ballon', 'Passing', 'Rebond offensif', 'Autres'].map((label) => ({
      label, type: 'button' as const, color: '#D4A24C', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: label === 'Passing' ? ['passer', 'receiver', 'value', 'clip', 'save'] as MatchReviewFlowStepType[] : ['player', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'attaque', label: 'Actions attaque', icon: '🔵', color: '#3B82F6',
    controls: ['Tir', 'Faute provoquée', 'Touche / Sortie', 'Perte de balle', 'Contre', 'Faute commise', 'Faute technique'].map((label) => ({
      label, type: 'button' as const, color: '#3B82F6', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['player', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'defense', label: 'Actions défense', icon: '🔴', color: '#EF4444',
    controls: ['Tir adverse', 'Interception / récupération', 'BP adverse', 'Contre', 'Touche', 'Faute provoquée', 'Faute commise', 'Faute technique'].map((label) => ({
      label, type: 'button' as const, color: '#EF4444', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['player', 'opponent', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'transition', label: 'Transition', icon: '🏃', color: '#84CC16',
    controls: ['Montée de balle', 'Fast break', 'Repli défensif', 'Retour défense'].map((label) => ({
      label, type: 'button' as const, color: '#84CC16', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['player', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'individuel', label: 'Individuel', icon: '🧍', color: '#A855F7',
    controls: [
      { label: '+ (positif)', type: 'button', color: '#22C55E', value: 1, createClip: true, preRoll: 4, postRoll: 4, logic: ['player', 'clip', 'save'] },
      { label: '− (négatif)', type: 'button', color: '#EF4444', value: -1, createClip: true, preRoll: 4, postRoll: 4, logic: ['player', 'clip', 'save'] },
      { label: 'Bonne décision', type: 'button', color: '#22C55E', value: 1, createClip: true, preRoll: 4, postRoll: 4, logic: ['player', 'clip', 'save'] },
      { label: 'Mauvaise décision', type: 'button', color: '#EF4444', value: -1, createClip: true, preRoll: 4, postRoll: 4, logic: ['player', 'clip', 'save'] },
    ],
  },
  {
    key: 'collectif', label: 'Collectif', icon: '👥', color: '#22D3EE',
    controls: ['Espacement', 'Circulation', 'Lecture jeu', 'Discipline'].map((label) => ({
      label, type: 'button' as const, color: '#22D3EE', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['team', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'rebond', label: 'Rebond', icon: '↔', color: '#10B981',
    controls: ['Rebond offensif', 'Rebond défensif', 'Box out +', 'Box out −'].map((label) => ({
      label, type: 'button' as const, color: '#10B981', value: label.endsWith('−') ? -1 : 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['player', 'value', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'faute', label: 'Faute', icon: '❌', color: '#F97316',
    controls: ['Faute provoquée', 'Faute personnelle', 'Faute technique'].map((label) => ({
      label, type: 'button' as const, color: '#F97316', value: 1, createClip: true, preRoll: 4, postRoll: 4,
      logic: ['player', 'opponent', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: 'autres', label: 'Autres', icon: '＋', color: '#94A3B8',
    controls: ['Commentaire', 'Créer un clip', 'Temps mort', 'Autre'].map((label) => ({
      label,
      type: label === 'Commentaire' ? 'text' as const : 'button' as const,
      color: '#94A3B8', value: 1, createClip: label !== 'Commentaire', preRoll: 4, postRoll: 4,
      logic: label === 'Commentaire' ? ['comment', 'save'] as MatchReviewFlowStepType[] : ['player', 'clip', 'save'] as MatchReviewFlowStepType[],
    })),
  },
];

const clonePresetControl = (control: PresetControl): MatchReviewControl => ({
  ...control,
  id: uid(),
  logic: logic(...(control.logic || ['player', 'clip', 'save'])),
});

const safeParseTemplates = (): MatchReviewTemplate[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(storageGet(TEMPLATE_STORAGE) || '[]');
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
  const [editorTab, setEditorTab] = useState<'logic' | 'blocks'>('blocks');
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
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
    const source = stored.length ? stored : [blankTemplate()];
    // Migration douce des modèles créés avec les premières versions du constructeur :
    // chaque ancien bouton reçoit une logique modifiable par défaut.
    const next = source.map((template) => ({
      ...template,
      blocks: (template.blocks || []).map((block) => ({
        ...block,
        controls: (block.controls || []).map((control) => ({
          ...control,
          logic: control.logic?.length ? control.logic : logic('player', 'clip', 'save'),
        })),
      })),
    }));
    const storedActive = storageGet(ACTIVE_TEMPLATE_STORAGE) || '';
    const resolved = next.some((template) => template.id === storedActive) ? storedActive : next[0].id;
    setTemplates(next);
    setActiveId(resolved);
    storageSet(TEMPLATE_STORAGE, JSON.stringify(next));
  }, []);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(storageGet(`${EVENT_STORAGE_PREFIX}${projectId}`) || '[]');
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
    storageSet(TEMPLATE_STORAGE, JSON.stringify(next));
  };

  const setActiveTemplateId = (id: string) => {
    setActiveId(id);
    storageSet(ACTIVE_TEMPLATE_STORAGE, id);
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

  const insertBlockAt = (index: number, preset?: PresetBlock) => {
    const block: MatchReviewBlock = preset ? {
      id: uid(),
      title: preset.label,
      subtitle: 'Bloc prédéfini — entièrement modifiable',
      color: preset.color,
      columns: 2,
      controls: preset.controls.map(clonePresetControl),
    } : {
      id: uid(),
      title: 'Nouveau bloc',
      subtitle: '',
      color: '#6B1A2C',
      columns: 2,
      controls: [],
    };
    updateActive((template) => {
      const blocks = template.blocks.slice();
      blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
      return { ...template, blocks };
    });
    setSelectedBlockId(block.id);
    setSelectedControlId(null);
    setEditorTab('blocks');
  };

  const addBlock = () => { insertBlockAt(insertIndex ?? (active?.blocks.length || 0)); setInsertIndex(null); };
  const addPresetBlock = (preset: PresetBlock) => { insertBlockAt(insertIndex ?? (active?.blocks.length || 0), preset); setInsertIndex(null); };

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
      logic: logic('player', 'clip', 'save'),
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

  const updateControlLogic = (blockId: string, controlId: string, updater: (steps: MatchReviewFlowStep[]) => MatchReviewFlowStep[]) => {
    const block = active?.blocks.find((item) => item.id === blockId);
    const control = block?.controls.find((item) => item.id === controlId);
    if (!block || !control) return;
    updateControl(blockId, controlId, { logic: updater(control.logic || logic('player', 'clip', 'save')) });
  };

  const addControlLogicStep = (blockId: string, controlId: string) => {
    updateControlLogic(blockId, controlId, (steps) => [...steps, { id: uid(), type: 'comment', required: false }]);
  };

  const moveControlLogicStep = (blockId: string, controlId: string, stepId: string, delta: -1 | 1) => {
    updateControlLogic(blockId, controlId, (steps) => {
      const index = steps.findIndex((step) => step.id === stepId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= steps.length) return steps;
      const next = steps.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
    if (projectId) storageSet(`${EVENT_STORAGE_PREFIX}${projectId}`, JSON.stringify(next));
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
          <div className={styles.historyHead}><b>Dernières saisies</b><button type="button" onClick={() => { setEvents([]); if (projectId) storageRemove(`${EVENT_STORAGE_PREFIX}${projectId}`); }}>Vider</button></div>
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
              <div>
                <b>◉ CONSTRUCTEUR · RETOUR DE MATCH</b>
                <span>Reprends les blocs déjà connus de LiveStats, insère-les dans l’ordre que tu veux et modifie chaque bouton.</span>
              </div>
              <button type="button" className={styles.editorClose} aria-label="Fermer" onClick={() => setEditorOpen(false)}>×</button>
            </header>

            <div className={styles.builderTabs}>
              <button type="button" className={editorTab === 'logic' ? styles.tabOn : ''} onClick={() => setEditorTab('logic')}>◉ Logique & chemin</button>
              <button type="button" className={editorTab === 'blocks' ? styles.tabOn : ''} onClick={() => setEditorTab('blocks')}>🧩 Boutons par bloc</button>
              <div className={styles.templateMini}>
                <select value={active.id} onChange={(event) => setActiveTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
                <button type="button" onClick={addTemplate}>＋</button>
                <button type="button" onClick={duplicateTemplate}>⧉</button>
              </div>
            </div>

            {editorTab === 'blocks' ? (
              <>
                <div className={styles.builderNotice}>
                  <span>Chaque bloc garde la même présentation pendant le codage. Les blocs prédéfinis créent automatiquement leurs boutons et leur logique, mais tout reste modifiable.</span>
                  <button type="button" onClick={() => setInsertIndex(active.blocks.length)}>＋ Insérer un bloc</button>
                </div>

                <div className={styles.visualBuilderGrid}>
                  <aside className={styles.presetLibrary}>
                    <h3>BLOCS PRÉDÉFINIS</h3>
                    <p>Clique sur un bloc pour l’ajouter {insertIndex != null ? `en position ${insertIndex + 1}` : 'à la fin'}.</p>
                    {PRESET_BLOCKS.map((preset) => (
                      <button key={preset.key} type="button" onClick={() => addPresetBlock(preset)}>
                        <span>{preset.icon}</span><b>{preset.label}</b>
                      </button>
                    ))}
                    <button type="button" className={styles.blankPreset} onClick={addBlock}><span>＋</span><b>Bloc vide</b></button>
                    {insertIndex != null && <button type="button" className={styles.cancelInsert} onClick={() => setInsertIndex(null)}>Annuler l’insertion</button>}
                  </aside>

                  <main className={styles.organisationArea}>
                    <div className={styles.organisationHead}>
                      <b>ORGANISATION DES BLOCS</b>
                      <span>{active.blocks.length} bloc{active.blocks.length > 1 ? 's' : ''} au total</span>
                    </div>

                    {active.blocks.length === 0 ? (
                      <button type="button" className={styles.emptyBuilder} onClick={() => setInsertIndex(0)}>＋ Ajouter ton premier bloc</button>
                    ) : (
                      <div className={styles.visualBlocks}>
                        {active.blocks.map((block, blockIndex) => (
                          <section key={block.id} className={`${styles.visualBlock} ${selectedBlockId === block.id ? styles.visualBlockSelected : ''}`}>
                            <header onClick={() => { setSelectedBlockId(block.id); setSelectedControlId(null); }}>
                              <div className={styles.blockIdentity}>
                                <span className={styles.blockDot} style={{ background: normalizeHex(block.color) }} />
                                <div><b>Bloc {blockIndex + 1}</b><small>{block.title}</small></div>
                              </div>
                              <div className={styles.blockActions}>
                                <button type="button" onClick={(event) => { event.stopPropagation(); addControl(block.id); }}>＋ Bouton</button>
                                <button type="button" title="Monter" disabled={blockIndex === 0} onClick={(event) => { event.stopPropagation(); moveBlock(block.id, -1); }}>←</button>
                                <button type="button" title="Descendre" disabled={blockIndex === active.blocks.length - 1} onClick={(event) => { event.stopPropagation(); moveBlock(block.id, 1); }}>→</button>
                                <button type="button" className={styles.iconDanger} title="Supprimer" onClick={(event) => { event.stopPropagation(); deleteBlock(block.id); }}>×</button>
                              </div>
                            </header>

                            <div className={styles.visualControlList}>
                              {block.controls.map((control, controlIndex) => (
                                <div key={control.id} className={`${styles.visualControl} ${selectedControlId === control.id ? styles.visualControlSelected : ''}`} onClick={() => { setSelectedBlockId(block.id); setSelectedControlId(control.id); }}>
                                  <span className={styles.dragHandle}>⠿</span>
                                  <b>{control.label}</b>
                                  <button type="button" title="Modifier" onClick={(event) => { event.stopPropagation(); setSelectedBlockId(block.id); setSelectedControlId(control.id); }}>✎</button>
                                  <button type="button" title="Monter" disabled={controlIndex === 0} onClick={(event) => { event.stopPropagation(); moveControl(block.id, control.id, -1); }}>↑</button>
                                  <button type="button" title="Descendre" disabled={controlIndex === block.controls.length - 1} onClick={(event) => { event.stopPropagation(); moveControl(block.id, control.id, 1); }}>↓</button>
                                  <button type="button" className={styles.iconDanger} title="Supprimer" onClick={(event) => { event.stopPropagation(); deleteControl(block.id, control.id); }}>×</button>
                                </div>
                              ))}
                              <button type="button" className={styles.addVisualControl} onClick={() => addControl(block.id)}>＋ Ajouter un bouton</button>
                            </div>

                            <button type="button" className={styles.insertHere} onClick={() => setInsertIndex(blockIndex + 1)}>＋ Insérer un bloc ici</button>
                          </section>
                        ))}
                      </div>
                    )}
                  </main>

                  <aside className={styles.visualProperties}>
                    <h3>MODIFIER</h3>
                    {selectedBlock && !selectedControl && (
                      <>
                        <b>Bloc {Math.max(1, active.blocks.findIndex((block) => block.id === selectedBlock.id) + 1)}</b>
                        <label>Nom du bloc<input value={selectedBlock.title} onChange={(event) => updateBlock(selectedBlock.id, { title: event.target.value })} /></label>
                        <label>Sous-titre<input value={selectedBlock.subtitle || ''} onChange={(event) => updateBlock(selectedBlock.id, { subtitle: event.target.value })} /></label>
                        <label>Couleur<input type="color" value={normalizeHex(selectedBlock.color)} onChange={(event) => updateBlock(selectedBlock.id, { color: event.target.value })} /></label>
                        <label>Colonnes<select value={selectedBlock.columns} onChange={(event) => updateBlock(selectedBlock.id, { columns: Number(event.target.value) as 1|2|3|4 })}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
                      </>
                    )}
                    {selectedBlock && selectedControl && (
                      <>
                        <b>{selectedControl.label}</b>
                        <label>Nom du bouton<input value={selectedControl.label} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { label: event.target.value })} /></label>
                        <label>Type<select value={selectedControl.type} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { type: event.target.value as MatchReviewControlType })}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label>Couleur<input type="color" value={normalizeHex(selectedControl.color, '#D4A24C')} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { color: event.target.value })} /></label>
                        <label className={styles.check}><input type="checkbox" checked={!!selectedControl.createClip} onChange={(event) => updateControl(selectedBlock.id, selectedControl.id, { createClip: event.target.checked })} /> Créer un clip</label>
                        <div className={styles.logicMiniTitle}>LOGIQUE DU BOUTON</div>
                        <div className={styles.logicMiniList}>
                          {(selectedControl.logic || []).map((step, index) => (
                            <div key={step.id}>
                              <span>{index + 1}</span>
                              <select value={step.type} onChange={(event) => updateControlLogic(selectedBlock.id, selectedControl.id, (steps) => steps.map((item) => item.id === step.id ? { ...item, type: event.target.value as MatchReviewFlowStepType } : item))}>{Object.entries(stepLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                              <button type="button" disabled={index === 0} onClick={() => moveControlLogicStep(selectedBlock.id, selectedControl.id, step.id, -1)}>↑</button>
                              <button type="button" disabled={index === (selectedControl.logic || []).length - 1} onClick={() => moveControlLogicStep(selectedBlock.id, selectedControl.id, step.id, 1)}>↓</button>
                              <button type="button" onClick={() => updateControlLogic(selectedBlock.id, selectedControl.id, (steps) => steps.filter((item) => item.id !== step.id))}>×</button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addControlLogicStep(selectedBlock.id, selectedControl.id)}>＋ Étape</button>
                        </div>
                      </>
                    )}
                    {!selectedBlock && <p>Sélectionne un bloc ou un bouton pour le modifier.</p>}
                  </aside>
                </div>
              </>
            ) : (
              <div className={styles.logicScreen}>
                <div className={styles.logicScreenHead}>
                  <div><b>LOGIQUE GÉNÉRÉE</b><span>Chaque bloc prédéfini a déjà sa logique. Tu peux ensuite la modifier bouton par bouton dans « Boutons par bloc ».</span></div>
                  <button type="button" onClick={() => setEditorTab('blocks')}>Modifier les blocs</button>
                </div>
                <div className={styles.logicBlocks}>
                  {active.blocks.map((block, blockIndex) => (
                    <section key={block.id}>
                      <header><b>Bloc {blockIndex + 1}</b><span>{block.title}</span></header>
                      {block.controls.map((control) => (
                        <div key={control.id} className={styles.logicButtonRow}>
                          <strong>{control.label}</strong>
                          <div>{(control.logic || logic('player', 'clip', 'save')).map((step, index) => <span key={step.id}>{index > 0 && <i>→</i>}{stepLabels[step.type]}</span>)}</div>
                          <button type="button" onClick={() => { setSelectedBlockId(block.id); setSelectedControlId(control.id); setEditorTab('blocks'); }}>Modifier</button>
                        </div>
                      ))}
                    </section>
                  ))}
                  {active.blocks.length === 0 && <div className={styles.emptyLogic}>Ajoute un bloc prédéfini : sa logique apparaîtra automatiquement ici.</div>}
                </div>
              </div>
            )}

            <footer className={styles.editorFoot}>
              <div className={styles.modelQuickEdit}>
                <input value={active.name} onChange={(event) => updateActive((template) => ({ ...template, name: event.target.value }))} aria-label="Nom de la configuration" />
                <button type="button" className={styles.danger} onClick={deleteTemplate}>Supprimer le modèle</button>
              </div>
              <div><button type="button" onClick={() => setEditorOpen(false)}>💾 Enregistrer la configuration</button></div>
            </footer>
          </div>
        </div>
      )}

      {!embedded && !editorOpen && <button type="button" className={styles.closeStandalone} onClick={onClose}>Fermer</button>}
    </div>
  );
}
