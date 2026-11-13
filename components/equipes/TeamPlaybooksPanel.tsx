"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PlaybookDetail from "@/components/playbook/PlaybookDetail";
import { listPlaybooks, type Playbook } from "@/lib/playbook";

export default function TeamPlaybooksPanel({ teamId }: { teamId: string }) {
  const [playbooks, setPlaybooks] = useState<Playbook[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    listPlaybooks(teamId).then(
      (rows) => {
        if (!active) return;
        setPlaybooks(rows);
        setSelectedId((id) => rows.some((row) => row.id === id) ? id : rows[0]?.id ?? "");
        setError(false);
      },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [teamId, revision]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  if (error) return <p role="alert">Impossible de charger les playbooks de cette équipe.</p>;
  if (!playbooks) return <p role="status">Chargement des playbooks…</p>;

  return (
    <section className="team-playbooks" aria-label="Playbooks de l’équipe">
      {playbooks.length > 1 && (
        <label>
          Choisir un playbook
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {playbooks.map((playbook) => (
              <option key={playbook.id} value={playbook.id}>
                {playbook.title}{playbook.season ? ` · ${playbook.season}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedId ? <PlaybookDetail key={selectedId} id={selectedId} onTeamChange={refresh} /> : (
        <div className="empty">
          <p>Aucun playbook rattaché à cette équipe.</p>
          <Link href="/mon-compte?tab=playbooks">Gérer mes playbooks</Link>
        </div>
      )}
      <style jsx>{`
        .team-playbooks { display: grid; gap: 14px; min-width: 0; }
        label { display: grid; gap: 6px; justify-items: start; color: #6b1a2c; font-weight: 700; }
        select { max-width: 100%; padding: 8px 12px; border: 1px solid #eadfe2; border-radius: 10px; background: #fff; }
        .empty { padding: 20px; background: #fff; border: 1px solid #eadfe2; border-radius: 18px; }
        .empty :global(a) { color: #6b1a2c; font-weight: 700; }
      `}</style>
    </section>
  );
}
