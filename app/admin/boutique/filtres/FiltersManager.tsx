'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupedFilters } from '@/types/shop';
import { FILTER_GROUP_LABELS } from '@/types/shop';
import { addFilter, deleteFilter, toggleFilter, updateFilter } from '@/lib/shop/actions';
import { SHOP_CSS } from '@/components/shop/shopCss';

const GROUPS = ['type', 'category', 'level', 'age', 'price'];

export default function FiltersManager({ filters }: { filters: GroupedFilters }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2000); };

  const add = (group: string) => {
    const label = (drafts[group] ?? '').trim();
    if (!label) return;
    start(async () => { await addFilter(group, label); setDrafts((s) => ({ ...s, [group]: '' })); flash('Filtre ajouté'); router.refresh(); });
  };
  const rename = (id: string, label: string) => start(async () => { await updateFilter(id, label); flash('Filtre modifié'); router.refresh(); });
  const toggle = (id: string, active: boolean) => start(async () => { await toggleFilter(id, active); router.refresh(); });
  const remove = (id: string, label: string) => { if (confirm(`Supprimer « ${label} » ?`)) start(async () => { await deleteFilter(id); flash('Filtre supprimé'); router.refresh(); }); };

  return (
    <div className="adm">
      <style>{SHOP_CSS}</style>
      <div className="adm-head">
        <div><h1>BOUTIQUE — FILTRES</h1><p>Les filtres actifs apparaissent automatiquement sur la page Boutique.</p></div>
        <button className="adm-btn ghost" onClick={() => router.push('/admin/boutique')}>← Produits</button>
      </div>

      <div className="pf-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '1.1rem' }}>
        {GROUPS.map((group) => (
          <div className="pf-card" key={group} style={{ margin: 0 }}>
            <h2>{FILTER_GROUP_LABELS[group] ?? group}</h2>
            <div style={{ display: 'grid', gap: '.5rem' }}>
              {(filters[group] ?? []).map((f) => (
                <div key={f.id} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', opacity: f.active ? 1 : 0.5 }}>
                  <input
                    type="text"
                    defaultValue={f.label}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== f.label) rename(f.id, e.target.value.trim()); }}
                    style={{ flex: 1, border: '1px solid #d6d6d6', borderRadius: 8, padding: '.45rem .6rem', fontSize: '.9rem' }}
                  />
                  <button className="adm-btn ghost" style={{ padding: '.3rem .6rem' }} onClick={() => toggle(f.id, !f.active)} disabled={pending} title={f.active ? 'Désactiver' : 'Activer'}>
                    {f.active ? '👁' : '🚫'}
                  </button>
                  <button className="adm-btn ghost" style={{ padding: '.3rem .6rem', color: '#c0392b', borderColor: '#f2c3c3' }} onClick={() => remove(f.id, f.label)} disabled={pending}>✕</button>
                </div>
              ))}
              {(filters[group] ?? []).length === 0 && <div style={{ color: '#999', fontSize: '.85rem' }}>Aucun filtre.</div>}
            </div>
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.8rem' }}>
              <input
                type="text"
                placeholder="Nouveau filtre…"
                value={drafts[group] ?? ''}
                onChange={(e) => setDrafts((s) => ({ ...s, [group]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') add(group); }}
                style={{ flex: 1, border: '1px dashed #D4A24C', borderRadius: 8, padding: '.45rem .6rem', fontSize: '.9rem' }}
              />
              <button className="adm-btn primary" style={{ padding: '.45rem .9rem' }} onClick={() => add(group)} disabled={pending}>+ Ajouter</button>
            </div>
          </div>
        ))}
      </div>
      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}