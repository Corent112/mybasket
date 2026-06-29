"use client";

import { useState } from "react";

export interface FilterGroupConfig {
  /** Clé technique : ex "theme", "type", "cat", "famille", "tempsFort" */
  key: string;
  /** Titre affiché : ex "THÈMES" */
  title: string;
  /** Valeurs possibles */
  options: string[];
}

/** Sélection : { theme: ["Dribble","Tirs"], cat: ["U15"], ... } */
export type FilterSelection = Record<string, string[]>;

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  groups: FilterGroupConfig[];
  selection: FilterSelection;
  onSelectionChange: (next: FilterSelection) => void;
}

export default function LibraryFilters({
  search, onSearchChange, groups, selection, onSelectionChange,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const toggleValue = (key: string, value: string) => {
    const current = selection[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onSelectionChange({ ...selection, [key]: next });
  };

  return (
    <aside className="filters">
      <input
        type="text"
        className="filter-search"
        placeholder="Rechercher…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {groups.map((g) => {
        const isCollapsed = !!collapsed[g.key];
        return (
          <div
            key={g.key}
            className={`filter-group${isCollapsed ? " collapsed" : ""}`}
          >
            <div
              className="filter-title"
              onClick={() => toggleGroup(g.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleGroup(g.key);
              }}
            >
              {g.title}
            </div>
            <div className="filter-options">
              {g.options.map((opt) => {
                const checked = (selection[g.key] ?? []).includes(opt);
                return (
                  <label key={opt}>
                    <input
                      type="checkbox"
                      value={opt}
                      checked={checked}
                      onChange={() => toggleValue(g.key, opt)}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
