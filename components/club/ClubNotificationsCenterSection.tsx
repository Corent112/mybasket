"use client";

// components/club/ClubNotificationsCenterSection.tsx
import { useEffect, useMemo, useState } from "react";
import type { ClubCoach, ClubPlayer, ClubTeam } from "@/lib/club-core";
import {
  createClubTask,
  generateClubSystemAlerts,
  getNotificationsWorkspace,
  markNotificationRead,
  updateClubTaskStatus,
  type ClubNotificationCenterItem,
  type ClubTask,
} from "@/lib/club-notifications-center";

const TABS = ["Notifications", "Tâches", "Alertes auto"] as const;

export default function ClubNotificationsCenterSection({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Notifications");
  const [notifications, setNotifications] = useState<ClubNotificationCenterItem[]>([]);
  const [tasks, setTasks] = useState<ClubTask[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function load() {
    setError("");
    try {
      const data = await getNotificationsWorkspace(clubId);
      setNotifications(data.notifications);
      setTasks(data.tasks);
      setPlayers(data.players);
      setTeams(data.teams);
      setCoaches(data.coaches);
    } catch (e: any) {
      setError(e?.message || "Centre de notifications impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => !filter || item.status === filter || item.type === filter || item.priority === filter);
  }, [notifications, filter]);

  const counters = useMemo(() => ({
    unread: notifications.filter((item) => item.status !== "read").length,
    high: notifications.filter((item) => item.priority === "high").length,
    todo: tasks.filter((task) => task.status !== "done" && task.status !== "archived").length,
    done: tasks.filter((task) => task.status === "done").length,
  }), [notifications, tasks]);

  function relatedName(item: ClubNotificationCenterItem | ClubTask) {
    if (item.relatedPlayerId) {
      const player = players.find((p) => p.id === item.relatedPlayerId);
      if (player) return `${player.firstName} ${player.lastName}`;
    }

    if (item.relatedTeamId) {
      const team = teams.find((t) => t.id === item.relatedTeamId);
      if (team) return team.name;
    }

    if (item.relatedCoachId) {
      const coach = coaches.find((c) => c.id === item.relatedCoachId);
      if (coach) return coach.name;
    }

    return "Club";
  }

  async function read(item: ClubNotificationCenterItem) {
    await markNotificationRead(item.id);
    setNotifications((prev) => prev.map((n) => n.id === item.id ? { ...n, status: "read" } : n));
  }

  async function addTaskFromNotification(item?: ClubNotificationCenterItem) {
    const title = prompt("Titre de la tâche ?", item?.title || "");
    if (!title) return;

    const description = prompt("Description ?", item?.message || "") || "";

    try {
      const task = await createClubTask({
        clubId,
        title,
        description,
        priority: item?.priority || "normal",
        relatedPlayerId: item?.relatedPlayerId || null,
        relatedTeamId: item?.relatedTeamId || null,
        relatedCoachId: item?.relatedCoachId || null,
      });
      setTasks((prev) => [task, ...prev]);
      setMessage("Tâche créée.");
    } catch (e: any) {
      setError(e?.message || "Tâche non créée.");
    }
  }

  async function changeTaskStatus(task: ClubTask, status: "todo" | "doing" | "done" | "archived") {
    await updateClubTaskStatus(task.id, status);
    setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status } : item));
  }

  async function generateAlerts() {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const rows = await generateClubSystemAlerts(clubId);
      setNotifications((prev) => [...rows, ...prev]);
      setMessage(`${rows.length} alertes générées.`);
    } catch (e: any) {
      setError(e?.message || "Génération impossible.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="center">
      <div className="top">
        <div>
          <p>CENTRE CLUB</p>
          <h2>Notifications & tâches</h2>
          <span>Alertes système, tâches internes et suivi opérationnel du club.</span>
        </div>
        <button onClick={() => addTaskFromNotification()}>+ Tâche</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <nav>
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      <div className="kpis">
        <b>{counters.unread}<small>non lues</small></b>
        <b>{counters.high}<small>prioritaires</small></b>
        <b>{counters.todo}<small>tâches ouvertes</small></b>
        <b>{counters.done}<small>terminées</small></b>
      </div>

      {tab === "Notifications" && (
        <div className="panel">
          <div className="tools">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Toutes</option>
              <option value="unread">Non lues</option>
              <option value="read">Lues</option>
              <option value="high">Priorité haute</option>
              <option value="payment">Paiement</option>
              <option value="license">Licence</option>
              <option value="team">Équipe</option>
              <option value="coach">Coach</option>
            </select>
          </div>

          <div className="cards">
            {filteredNotifications.map((item) => (
              <article className={`card ${item.priority}`} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>{item.type} · {item.status} · {relatedName(item)}</small>
                </div>
                <div className="actions">
                  <button onClick={() => read(item)}>Marquer lu</button>
                  <button className="ghost" onClick={() => addTaskFromNotification(item)}>Créer tâche</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "Tâches" && (
        <div className="panel">
          <div className="taskBoard">
            {["todo", "doing", "done"].map((status) => (
              <div className="column" key={status}>
                <h3>{status}</h3>
                {tasks.filter((task) => task.status === status).map((task) => (
                  <article className={`task ${task.priority}`} key={task.id}>
                    <strong>{task.title}</strong>
                    <p>{task.description}</p>
                    <small>{relatedName(task)}</small>
                    <div className="actions">
                      <button onClick={() => changeTaskStatus(task, "todo")}>À faire</button>
                      <button onClick={() => changeTaskStatus(task, "doing")}>En cours</button>
                      <button onClick={() => changeTaskStatus(task, "done")}>Fait</button>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Alertes auto" && (
        <div className="panel solo">
          <h3>Générer les alertes système</h3>
          <p>Le système analyse les joueurs, équipes et coachs pour créer les alertes licence, paiement, équipe vide, coach manquant, etc.</p>
          <button disabled={working} onClick={generateAlerts}>
            {working ? "Analyse..." : "Analyser le club"}
          </button>
        </div>
      )}

      <style jsx>{`
        .center{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}button:disabled{opacity:.55}
        nav{display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #eef2f7}nav button{background:#fffaf2;color:#6b1a2c}nav button.active{background:#6b1a2c;color:white}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:18px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:16px;text-align:center;color:#6b1a2c;font-size:1.4rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .panel{margin:0 18px 18px;border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 14px;color:#6b1a2c}.panel.solo p{color:#374151;font-weight:800}
        select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}.tools{margin-bottom:14px}
        .cards{display:grid;gap:12px}.card,.task{border:1px solid #eadfd5;border-radius:18px;padding:14px;display:flex;justify-content:space-between;gap:14px}.card.high,.task.high{background:#fff0f0}.card strong,.task strong{color:#6b1a2c}.card p,.task p{color:#374151;font-weight:800}.card small,.task small{color:#6b7280;font-weight:900}.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}
        .taskBoard{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.column{background:#fffdf8;border:1px solid #eadfd5;border-radius:20px;padding:14px}.task{display:grid;margin-bottom:10px}
        @media(max-width:1000px){.kpis,.taskBoard{grid-template-columns:1fr}.card{display:grid}}
      `}</style>
    </section>
  );
}
