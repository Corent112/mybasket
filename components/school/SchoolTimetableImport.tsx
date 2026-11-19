"use client";
import { useState } from "react";
import {
  normalizeSchoolCourses,
  type SchoolCourse,
} from "@/lib/school-timetable";
const DAYS = [
  "",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
export default function SchoolTimetableImport({
  teamId,
  playerId,
}: {
  teamId: string;
  playerId: string;
}) {
  const [checked, setChecked] = useState(false);
  const [courses, setCourses] = useState<SchoolCourse[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  async function scan(file: File) {
    if (file.size > 3500000) {
      setNotice("Choisis une photo ou un PDF de moins de 3,5 Mo.");
      return;
    }
    setBusy(true);
    setNotice("Lecture de l’emploi du temps…");
    setCourses([]);
    setWarnings([]);
    setChecked(false);
    try {
      const body = new FormData();
      body.set("teamId", teamId);
      body.set("playerId", playerId);
      body.set("file", file);
      const r = await fetch("/api/school/timetable", { method: "POST", body });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setCourses(data.courses);
      setWarnings(data.warnings || []);
      setNotice("Vérifie les cours et choisis la période à ajouter.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function patch(i: number, value: Partial<SchoolCourse>) {
    setCourses((old) =>
      old.map((c, index) => (index === i ? { ...c, ...value } : c)),
    );
  }
  async function save() {
    if (normalizeSchoolCourses(courses).length !== courses.length) {
      setNotice("Vérifie les jours, titres et horaires de chaque cours.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/school/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, playerId, courses, from, to }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setNotice(
        `${data.saved} cours enregistrés dans le calendrier du joueur.`,
      );
      window.dispatchEvent(new Event("mybasket:calendar-updated"));
      setCourses([]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="school-import">
      <h3>Emploi du temps scolaire</h3>
      <p>
        Importe une photo ou un PDF, vérifie les cours, puis ajoute-les au
        calendrier.
      </p>
      <label className="upload">
        {busy ? "Traitement…" : "＋ Importer l’emploi du temps"}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void scan(file);
            e.target.value = "";
          }}
        />
      </label>
      {notice && <p role="status">{notice}</p>}
      {warnings.map((w, i) => (
        <p key={i} className="warning">
          {w}
        </p>
      ))}
      {!!courses.length && (
        <>
          <div className="period">
            <label>
              Du
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Au
              <input
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <div className="rows">
            {courses.map((course, i) => (
              <div className="course" key={i}>
                <select
                  aria-label="Jour du cours"
                  value={course.day}
                  onChange={(e) => patch(i, { day: Number(e.target.value) })}
                >
                  {DAYS.slice(1).map((d, index) => (
                    <option key={d} value={index + 1}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Matière"
                  value={course.title}
                  onChange={(e) => patch(i, { title: e.target.value })}
                />
                <input
                  aria-label="Début du cours"
                  type="time"
                  value={course.start}
                  onChange={(e) => patch(i, { start: e.target.value })}
                />
                <input
                  aria-label="Fin du cours"
                  type="time"
                  value={course.end}
                  onChange={(e) => patch(i, { end: e.target.value })}
                />
                <button
                  aria-label="Retirer ce cours"
                  onClick={() =>
                    setCourses((old) => old.filter((_, index) => index !== i))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {!!warnings.length && (
            <label
              style={{
                display: "flex",
                gap: 8,
                fontSize: 12,
                margin: "12px 0",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              J’ai vérifié les horaires et les éventuelles alternances de
              semaines.
            </label>
          )}
          <button
            disabled={busy || !from || !to || (!!warnings.length && !checked)}
            onClick={() => void save()}
          >
            Ajouter les cours au calendrier
          </button>
        </>
      )}
      <style jsx>{`
        .school-import {
          padding: 20px;
          background: white;
          border: 1px solid #e9dfe3;
          border-radius: 18px;
          margin-bottom: 18px;
        }
        .school-import h3 {
          color: #6b1a2c;
          margin: 0 0 8px;
        }
        .school-import p {
          font-size: 12px;
          color: #847079;
          line-height: 1.6;
        }
        .upload,
        .school-import > button {
          display: inline-block;
          background: #6b1a2c;
          color: white;
          border: 0;
          border-radius: 11px;
          padding: 12px 16px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .upload input {
          display: none;
        }
        .school-import input,
        .school-import select {
          min-width: 0;
          box-sizing: border-box;
          padding: 9px;
          border: 1px solid #dfd1d8;
          border-radius: 9px;
          background: #fff;
          font: inherit;
          font-size: 12px;
        }
        .period {
          display: flex;
          gap: 14px;
          margin: 16px 0;
        }
        .period label {
          display: grid;
          gap: 5px;
          font-size: 12px;
        }
        .rows {
          display: grid;
          gap: 8px;
          margin: 14px 0;
        }
        .course {
          display: grid;
          grid-template-columns: 100px minmax(120px, 1fr) 100px 100px 35px;
          gap: 8px;
        }
        .course button {
          border: 0;
          border-radius: 9px;
          color: #6b1a2c;
          background: #f5e9ed;
          font-size: 21px;
        }
        .warning {
          color: #9b4c12 !important;
        }
        .school-import button:disabled {
          opacity: 0.5;
        }
        @media (max-width: 700px) {
          .course {
            grid-template-columns: 1fr 1fr;
          }
          .course button {
            grid-column: 2;
            justify-self: end;
            width: 35px;
          }
          .period {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </section>
  );
}
