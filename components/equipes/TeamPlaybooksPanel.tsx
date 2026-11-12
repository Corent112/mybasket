"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPlaybooks, type Playbook } from "@/lib/playbook";

export default function TeamPlaybooksPanel({ teamId }: { teamId: string }) {
  const [playbooks, setPlaybooks] = useState<Playbook[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listPlaybooks(teamId).then(
      (rows) => { if (active) setPlaybooks(rows); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [teamId]);

  if (error) return <p role="alert">Impossible de charger les playbooks de cette équipe.</p>;
  if (!playbooks) return <p role="status">Chargement des playbooks…</p>;

  return (
    <section aria-label="Playbooks de l’équipe">
      {playbooks.length ? (
        <ul>
          {playbooks.map((playbook) => (
            <li key={playbook.id}>
              <Link href={`/mon-compte/playbooks/${playbook.id}`}>{playbook.title}</Link>
              {playbook.season && <span> · {playbook.season}</span>}
            </li>
          ))}
        </ul>
      ) : <p>Aucun playbook rattaché à cette équipe.</p>}
      <Link href="/mon-compte/playbooks">Gérer mes playbooks</Link>
    </section>
  );
}
