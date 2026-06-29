"use client";

import { useMemo } from "react";
import LibraryFilters, {
  type FilterGroupConfig,
  type FilterSelection,
} from "@/components/library/LibraryFilters";

type SortKey = "recent" | "az" | "za";

export interface LibraryItem {
  id: string;
  title: string;
  createdAt: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface Props<T extends LibraryItem> {
  items: T[];
  filterGroups: FilterGroupConfig[];
  selection: FilterSelection;
  onSelectionChange: (next: FilterSelection) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  countLabel: (count: number) => string;
  createLabel: string;
  onCreate: () => void;
  renderCard: (item: T) => React.ReactNode;
  emptyText?: string;
}

export default function LibraryGrid<T extends LibraryItem>({
  items,
  filterGroups,
  selection,
  onSelectionChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  countLabel,
  createLabel,
  onCreate,
  renderCard,
  emptyText = "Aucun résultat. Essaie d'élargir tes filtres ou crée un nouvel ajout.",
}: Props<T>) {
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    let list = items.filter((item) => {
      for (const group of filterGroups) {
        const selectedValues = selection[group.key];

        if (!selectedValues || selectedValues.length === 0) {
          continue;
        }

        const value = item[group.key];

        if (typeof value !== "string") {
          return false;
        }

        if (!selectedValues.includes(value)) {
          return false;
        }
      }

      if (query) {
        const searchableParts: string[] = [item.title];

        if (item.description) {
          searchableParts.push(item.description);
        }

        if (item.tags) {
          searchableParts.push(item.tags.join(" "));
        }

        for (const group of filterGroups) {
          const value = item[group.key];

          if (typeof value === "string") {
            searchableParts.push(value);
          }
        }

        if (!searchableParts.join(" ").toLowerCase().includes(query)) {
          return false;
        }
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "az":
          return a.title.localeCompare(b.title, "fr");

        case "za":
          return b.title.localeCompare(a.title, "fr");

        case "recent":
        default:
          return (
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
          );
      }
    });

    return list;
  }, [items, filterGroups, selection, search, sort]);

  return (
    <div className="list-layout">
      <LibraryFilters
        search={search}
        onSearchChange={onSearchChange}
        groups={filterGroups}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />

      <section>
        <div className="list-header">
          <div className="list-count">{countLabel(filtered.length)}</div>

          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
            <button
              className="btn btn-black btn-small"
              type="button"
              onClick={onCreate}
            >
              {createLabel}
            </button>

            <select
              className="sort-select"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SortKey)}
              aria-label="Tri"
            >
              <option value="recent">Plus récents</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="list-empty">{emptyText}</div>
        ) : (
          <div className="cards-grid">
            {filtered.map((item) => (
              <div key={item.id}>{renderCard(item)}</div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}