"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/activity";
import type { Player } from "@/types/player";
import TeamWeeklyRpeComparison from "@/components/equipes/TeamWeeklyRpeComparison";
import RpeAlertsPanel from "@/components/equipes/RpeAlertsPanel";

type Status =
  | "available"
  | "limited"
  | "injured"
  | "unavailable"
  | "absent"
  | "returning";

type Availability = {
  id: string;
  player_id: string;
  status: Status;
  starts_at: string;
  ends_at: string | null;
  reason: string | null;
};

type LoadEntry = {
  id: string;
  player_id: string | null;
  load_date: string;
  duration_minutes: number;
  planned_rpe: number | null;
  actual_rpe: number | null;
  planned_load: number;
  actual_load: number;
  load_type: string;
};

type WellnessLink = {
  id: string;
  token: string;
  response_kind: "post_session" | "wellness";
  enabled: boolean;
  title: string | null;
};

type WellnessResponse = {
  id: string;
  player_id: string;
  response_kind: "post_session" | "wellness";
  response_date: string;
  duration_minutes: number | null;
  rpe: number | null;
  fatigue: number | null;
  soreness: number | null;
  sleep: number | null;
  stress: number | null;
  comment: string | null;
  created_at: string;
};

type AlertInfo = {
  level: "normal" | "watch" | "alert";
  labels: string[];
};

const statuses: [Status, string][] = [
  ["available", "Disponible"],
  ["limited", "Limité"],
  ["injured", "Blessé"],
  ["unavailable", "Indisponible"],
  ["absent", "Absent"],
  ["returning", "Retour progressif"],
];

const statusColor = (status: Status) =>
  ["injured", "unavailable", "absent"].includes(status)
    ? "#b42318"
    : ["limited", "returning"].includes(status)
      ? "#b26a00"
      : "#15803d";

const today = () => new Date().toISOString().slice(0, 10);

function responseAlert(row?: WellnessResponse | null): AlertInfo {
  if (!row) return { level: "normal", labels: [] };

  const alerts: string[] = [];
  const watches: string[] = [];

  if (Number(row.soreness || 0) >= 8) alerts.push("douleurs");
  else if (Number(row.soreness || 0) >= 5) watches.push("douleurs");

  if (Number(row.fatigue || 0) >= 9) alerts.push("fatigue");
  else if (Number(row.fatigue || 0) >= 7) watches.push("fatigue");

  if (row.sleep != null && Number(row.sleep) <= 3) alerts.push("sommeil");
  else if (row.sleep != null && Number(row.sleep) <= 5) watches.push("sommeil");

  if (Number(row.stress || 0) >= 9) alerts.push("stress");
  else if (Number(row.stress || 0) >= 7) watches.push("stress");

  if (Number(row.rpe || 0) >= 9) watches.push("RPE");

  if (alerts.length) {
    return { level: "alert", labels: [...alerts, ...watches] };
  }

  if (watches.length) {
    return { level: "watch", labels: watches };
  }

  return { level: "normal", labels: [] };
}

export default function TeamAvailabilityLoad({
  teamId,
  players,
  canEdit,
  canViewIndividual = true,
  canViewGroup = true,
  canManageTarget = canEdit,
  canManageQuestionnaires = canEdit,
}: {
  teamId: string;
  players: Player[];
  canEdit: boolean;
  canViewIndividual?: boolean;
  canViewGroup?: boolean;
  canManageTarget?: boolean;
  canManageQuestionnaires?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [availability, setAvailability] = useState<
    Record<string, Availability>
  >({});
  const [loads, setLoads] = useState<LoadEntry[]>([]);
  const [links, setLinks] = useState<WellnessLink[]>([]);
  const [responses, setResponses] = useState<WellnessResponse[]>([]);
  const [message, setMessage] = useState("");

  const [playerId, setPlayerId] = useState(
    players[0]?.id ? String(players[0].id) : "",
  );
  const [status, setStatus] = useState<Status>("available");
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loadDate, setLoadDate] = useState(today());
  const [duration, setDuration] = useState(90);
  const [plannedRpe, setPlannedRpe] = useState(6);
  const [actualRpe, setActualRpe] = useState<number | "">("");
  const [loadType, setLoadType] = useState("basket");

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  async function reload() {
    const response = await fetch(`/api/rpe/team?teamId=${encodeURIComponent(teamId)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(payload?.error || "Chargement Charge & RPE impossible.");
      return;
    }

    const map: Record<string, Availability> = {};
    for (const row of (payload.availability || []) as Availability[]) {
      if (!map[row.player_id]) map[row.player_id] = row;
    }

    setAvailability(map);
    setLoads((payload.loads || []) as LoadEntry[]);
    setLinks((payload.links || []) as WellnessLink[]);
    setResponses((payload.responses || []) as WellnessResponse[]);
  }
  useEffect(() => {
    void reload();
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveStatus() {
    if (!canEdit || !playerId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const q = await supabase.from("player_availability").insert({
      team_id: teamId,
      player_id: playerId,
      status,
      starts_at: new Date().toISOString(),
      ends_at: endDate
        ? new Date(`${endDate}T23:59:59`).toISOString()
        : null,
      reason: reason || null,
      created_by: user.id,
    });

    if (q.error) return alert(q.error.message);

    const player = players.find((item) => String(item.id) === playerId);

    await logActivity({
      teamId,
      playerId,
      scope: "player",
      actionKey: "availability.changed",
      title: `${player?.firstName || "Joueur"} ${player?.lastName || ""} : ${
        statuses.find((item) => item[0] === status)?.[1]
      }`,
      description: reason || null,
      href: `/equipes/${teamId}/${playerId}`,
    });

    await reload();
  }

  async function saveLoad() {
    if (!canManageTarget) return;

    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_load",
        teamId,
        playerId: playerId || null,
        loadDate,
        durationMinutes: duration,
        plannedRpe,
        actualRpe: actualRpe === "" ? null : actualRpe,
        loadType,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Enregistrement de la charge impossible.");

    await logActivity({
      teamId,
      playerId: playerId || null,
      scope: "training",
      actionKey: "load.created",
      title: `Charge ajoutée · ${duration} min · RPE ${actualRpe === "" ? plannedRpe : actualRpe}`,
      href: `/equipes/${teamId}`,
    });

    await reload();
  }

  async function createLink(kind: "post_session" | "wellness") {
    if (!canManageQuestionnaires) return;
    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_link", teamId, kind }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Création du lien impossible.");
    await reload();
    toast("Lien joueur créé ✓");
  }

  async function regenerateLink(link: WellnessLink) {
    if (!canManageQuestionnaires || !window.confirm("Regénérer ce lien ? L'ancien lien ne fonctionnera plus.")) return;
    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate_link", teamId, linkId: link.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Régénération impossible.");
    await reload();
    toast("Nouveau lien créé");
  }

  async function toggleLink(link: WellnessLink) {
    if (!canManageQuestionnaires) return;
    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_link", teamId, linkId: link.id, enabled: !link.enabled }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Modification du lien impossible.");
    await reload();
  }

  function publicUrl(link: WellnessLink) {
    if (typeof window === "undefined") return `/charge/${link.token}`;
    return `${window.location.origin}/charge/${link.token}`;
  }

  async function copyLink(link: WellnessLink) {
    await navigator.clipboard.writeText(publicUrl(link));
    toast("Lien copié ✓");
  }

  async function deleteWellnessResponse(row: WellnessResponse) {
    const wording =
      row.response_kind === "post_session" && row.rpe != null
        ? `Supprimer le RPE ${row.rpe}/10 et la charge associée ?`
        : "Supprimer cette réponse joueur ?";
    if (!window.confirm(wording)) return;

    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_response", teamId, responseId: row.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Suppression impossible.");
    await reload();
    toast("RPE / réponse supprimé(e) ✓");
  }

  const totals = useMemo(() => {
    const map = new Map<
      string,
      { planned: number; actual: number }
    >();

    for (const row of loads) {
      const current = map.get(row.load_date) || {
        planned: 0,
        actual: 0,
      };

      current.planned += Number(row.planned_load || 0);
      current.actual += Number(row.actual_load || 0);
      map.set(row.load_date, current);
    }

    return Array.from(map.entries()).slice(0, 14);
  }, [loads]);

  const latestByPlayer = useMemo(() => {
    const map = new Map<string, WellnessResponse>();

    for (const row of responses) {
      if (!map.has(row.player_id)) map.set(row.player_id, row);
    }

    return map;
  }, [responses]);

  const todayResponses = useMemo(
    () => responses.filter((row) => row.response_date === today()),
    [responses],
  );

  const answeredToday = new Set(
    todayResponses.map((row) => row.player_id),
  );

  const missingToday = players.filter(
    (player) => !answeredToday.has(String(player.id)),
  );

  return (
    <section className="wrap">
      {message && <div className="toast">{message}</div>}

      <RpeAlertsPanel teamId={teamId} canViewIndividual={canViewIndividual} />

      <div className="card availabilityCard">
        <div className="cardHead">
          <div>
            <p>DISPONIBILITÉ</p>
            <h2>Disponibilité & récupération</h2>
          </div>
          <span>{players.length} joueurs</span>
        </div>

        <div className="players">
          {players.map((player) => {
            const currentAvailability =
              availability[String(player.id)];
            const currentStatus =
              currentAvailability?.status || "available";
            const alertInfo = responseAlert(
              canViewIndividual ? latestByPlayer.get(String(player.id)) : null,
            );

            const hardRed = [
              "injured",
              "unavailable",
              "absent",
            ].includes(currentStatus);

            const readinessColor =
              hardRed || alertInfo.level === "alert"
                ? "#b42318"
                : alertInfo.level === "watch" ||
                    ["limited", "returning"].includes(currentStatus)
                  ? "#b26a00"
                  : "#15803d";

            return (
              <button
                type="button"
                key={String(player.id)}
                className="player"
                style={{ borderColor: readinessColor }}
                onClick={() =>
                  (window.location.href = `/equipes/${teamId}/${player.id}`)
                }
              >
                <div>
                  <b>
                    {player.firstName} {player.lastName}
                  </b>
                  <span style={{ color: statusColor(currentStatus) }}>
                    {
                      statuses.find(
                        (item) => item[0] === currentStatus,
                      )?.[1]
                    }
                  </span>
                </div>

                <div className={`readiness ${alertInfo.level}`}>
                  {hardRed
                    ? "🔴"
                    : alertInfo.level === "alert"
                      ? "🔴"
                      : alertInfo.level === "watch"
                        ? "🟠"
                        : "🟢"}
                  <small>
                    {alertInfo.labels.length
                      ? alertInfo.labels.join(" · ")
                      : "Rien à signaler"}
                  </small>
                </div>

                {currentAvailability?.reason && (
                  <em>{currentAvailability.reason}</em>
                )}
              </button>
            );
          })}
        </div>

        {canEdit && (
          <div className="form">
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              {players.map((player) => (
                <option
                  key={String(player.id)}
                  value={String(player.id)}
                >
                  {player.firstName} {player.lastName}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as Status)
              }
            >
              {statuses.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />

            <input
              className="wide"
              placeholder="Motif / information staff"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <button onClick={saveStatus}>Mettre à jour</button>
          </div>
        )}
      </div>

      <div className="card linksCard">
        <div className="cardHead">
          <div>
            <p>QUESTIONNAIRES JOUEURS</p>
            <h2>Liens rapides</h2>
          </div>
          <span>Sans compte joueur</span>
        </div>

        <p className="hint">
          Envoie le lien dans WhatsApp ou affiche le QR code. Les
          réponses alimentent automatiquement le tableau équipe et la
          fiche du joueur.
        </p>

        <div className="linkGrid">
          {(["post_session", "wellness"] as const).map((kind) => {
            const link = links.find(
              (item) => item.response_kind === kind,
            );

            const label =
              kind === "post_session"
                ? "Après séance · RPE"
                : "Wellness · récupération";

            if (!link) {
              return (
                <div className="linkBox emptyLink" key={kind}>
                  <strong>{label}</strong>
                  <span>Aucun lien créé</span>
                  {canManageQuestionnaires && (
                    <button onClick={() => createLink(kind)}>
                      + Créer le lien
                    </button>
                  )}
                </div>
              );
            }

            const url = publicUrl(link);
            const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
              url,
            )}`;

            return (
              <div
                className={`linkBox ${
                  link.enabled ? "" : "disabled"
                }`}
                key={kind}
              >
                <div className="linkTop">
                  <div>
                    <strong>{label}</strong>
                    <span>
                      {link.enabled ? "Actif" : "Désactivé"}
                    </span>
                  </div>

                  <img src={qr} alt={`QR code ${label}`} />
                </div>

                <code>{url}</code>

                <div className="linkActions">
                  <button onClick={() => copyLink(link)}>
                    Copier
                  </button>
                  <button
                    onClick={() =>
                      window.open(
                        url,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Tester
                  </button>

                  {canManageQuestionnaires && (
                    <button onClick={() => toggleLink(link)}>
                      {link.enabled ? "Désactiver" : "Activer"}
                    </button>
                  )}

                  {canManageQuestionnaires && (
                    <button
                      className="ghost"
                      onClick={() => regenerateLink(link)}
                    >
                      Regénérer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="responseSummary">
          <div>
            <strong>{todayResponses.length}</strong>
            <span>réponse(s) aujourd'hui</span>
          </div>
          <div>
            <strong>{missingToday.length}</strong>
            <span>joueur(s) sans réponse aujourd'hui</span>
          </div>
        </div>

        {canViewIndividual && missingToday.length > 0 && (
          <div className="missing">
            <b>Sans réponse :</b>{" "}
            {missingToday
              .map(
                (player) =>
                  `${player.firstName} ${player.lastName}`,
              )
              .join(", ")}
          </div>
        )}
      </div>

      {canViewIndividual && (
        <div className="weeklyFull">
          <TeamWeeklyRpeComparison
            teamId={teamId}
            players={players}
            canEdit={canManageTarget}
          />
        </div>
      )}

      <div className="card loadCard">
        <div className="cardHead">
          <div>
            <p>CHARGE</p>
            <h2>Suivi de charge</h2>
          </div>
          <span>Durée × RPE</span>
        </div>

        {canManageTarget && (
          <div className="form loadForm">
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              {players.map((player) => (
                <option
                  key={String(player.id)}
                  value={String(player.id)}
                >
                  {player.firstName} {player.lastName}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={loadDate}
              onChange={(e) => setLoadDate(e.target.value)}
            />

            <input
              type="number"
              value={duration}
              onChange={(e) =>
                setDuration(Number(e.target.value) || 0)
              }
              placeholder="Durée"
            />

            <input
              type="number"
              min="0"
              max="10"
              step=".5"
              value={plannedRpe}
              onChange={(e) =>
                setPlannedRpe(Number(e.target.value) || 0)
              }
              placeholder="RPE visé"
            />

            <input
              type="number"
              min="0"
              max="10"
              step=".5"
              value={actualRpe}
              onChange={(e) =>
                setActualRpe(
                  e.target.value === ""
                    ? ""
                    : Number(e.target.value),
                )
              }
              placeholder="RPE réel"
            />

            <select
              value={loadType}
              onChange={(e) => setLoadType(e.target.value)}
            >
              <option value="basket">Basket</option>
              <option value="physical">
                Préparation physique
              </option>
              <option value="game">Match</option>
              <option value="individual">Individuel</option>
            </select>

            <div className="preview">
              Prévue <b>{Math.round(duration * plannedRpe)}</b> ·
              Réelle{" "}
              <b>
                {Math.round(
                  duration *
                    (actualRpe === "" ? 0 : actualRpe),
                )}
              </b>
            </div>

            <button onClick={saveLoad}>
              Enregistrer charge
            </button>
          </div>
        )}

        <div className="history">
          {totals.map(([date, row]) => (
            <div key={date}>
              <span>
                {new Date(
                  `${date}T12:00:00`,
                ).toLocaleDateString("fr-FR")}
              </span>
              <span>
                Prévue <b>{Math.round(row.planned)}</b>
              </span>
              <span>
                Réelle <b>{Math.round(row.actual)}</b>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card responseCard">
        <div className="cardHead">
          <div>
            <p>RÉPONSES</p>
            <h2>Dernières réponses joueurs</h2>
          </div>
          <span>automatique</span>
        </div>

        {canViewIndividual ? (
        <div className="responseTable">
          {responses.slice(0, 20).map((row) => {
            const player = players.find(
              (item) => String(item.id) === row.player_id,
            );
            const alertInfo = responseAlert(row);

            return (
              <button
                key={row.id}
                onClick={() =>
                  (window.location.href = `/equipes/${teamId}/${row.player_id}`)
                }
              >
                <div>
                  <strong>
                    {player?.firstName || "Joueur"}{" "}
                    {player?.lastName || ""}
                  </strong>
                  <small>
                    {new Date(
                      row.created_at,
                    ).toLocaleString("fr-FR")}{" "}
                    ·{" "}
                    {row.response_kind === "post_session"
                      ? "Après séance"
                      : "Wellness"}
                  </small>
                </div>

                <span>
                  RPE <b>{row.rpe ?? "—"}</b>
                </span>
                <span>
                  Fatigue <b>{row.fatigue ?? "—"}</b>
                </span>
                <span>
                  Sommeil <b>{row.sleep ?? "—"}</b>
                </span>
                <span>
                  Douleurs <b>{row.soreness ?? "—"}</b>
                </span>

                {canEdit && (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Supprimer ce RPE / cette réponse"
                    className="deleteResponse"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteWellnessResponse(row);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteWellnessResponse(row);
                      }
                    }}
                  >
                    🗑
                  </span>
                )}

                <em className={alertInfo.level}>
                  {alertInfo.level === "alert"
                    ? "🔴"
                    : alertInfo.level === "watch"
                      ? "🟠"
                      : "🟢"}
                </em>
              </button>
            );
          })}

          {!responses.length && (
            <div className="empty">
              Aucune réponse joueur pour le moment.
            </div>
          )}
        </div>
        ) : (
          <div className="empty">Les données individuelles ne sont pas autorisées pour ce rôle.</div>
        )}
      </div>

      <style jsx>{css}</style>
    </section>
  );
}

const css = `
.wrap{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.card{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:16px;min-width:0}
.cardHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.cardHead p{margin:0;color:#d4a24c;font-weight:1000;letter-spacing:.11em;font-size:.68rem}
.cardHead h2{margin:4px 0}.cardHead>span{font-size:.7rem;color:#8a7b73}
.availabilityCard,.linksCard,.weeklyFull{grid-column:1/-1}
.players{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.player{border:1px solid;border-radius:10px;padding:9px;display:grid;grid-template-columns:1fr auto;gap:7px;text-align:left;background:#fff;cursor:pointer}
.player b,.player span{display:block}.player span{font-size:.72rem;font-weight:900}
.player em{grid-column:1/-1;color:#81736c;font-size:.68rem;font-style:normal}
.readiness{text-align:right}.readiness small{display:block;color:#7b6d65;font-size:.62rem;margin-top:2px}
.form{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;border-top:1px solid #eee4df;margin-top:12px;padding-top:12px}
.form input,.form select{border:1px solid #ddd1ca;border-radius:9px;padding:8px;min-width:0}
.wide{grid-column:1/-1}
.form button,.linkActions button,.emptyLink button{background:#6b1a2c;color:#fff;border:0;border-radius:9px;font-weight:900;padding:8px 10px;cursor:pointer}
.preview{border:1px solid #eee4df;border-radius:9px;padding:9px}
.history>div{display:grid;grid-template-columns:1fr 1fr 1fr;padding:7px 0;border-bottom:1px solid #eee4df;font-size:.76rem}
.hint{color:#7b6d65;font-size:.76rem;line-height:1.4}
.linkGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.linkBox{border:1px solid #eadfd8;border-radius:13px;padding:11px;background:#fffaf8;min-width:0}
.linkBox.disabled{opacity:.55}.emptyLink{display:grid;gap:6px;align-content:start}
.linkTop{display:grid;grid-template-columns:1fr 92px;gap:8px;align-items:start}
.linkTop strong,.linkTop span{display:block}.linkTop span{color:#8a7b73;font-size:.7rem}
.linkTop img{width:88px;height:88px;border-radius:8px;background:white}
.linkBox code{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;border:1px solid #eee4df;border-radius:8px;padding:7px;margin-top:6px;font-size:.64rem}
.linkActions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.linkActions .ghost{background:#fff;color:#6b1a2c;border:1px solid #6b1a2c}
.responseSummary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.responseSummary>div{background:#f7f3ef;border-radius:10px;padding:10px}
.responseSummary strong,.responseSummary span{display:block}.responseSummary strong{font-size:1.3rem;color:#6b1a2c}
.responseSummary span{font-size:.68rem;color:#84766e}
.missing{margin-top:8px;background:#fff7e8;border:1px solid #ebd2a7;border-radius:10px;padding:9px;font-size:.72rem}
.responseTable{display:grid;gap:5px}
.responseTable>button{display:grid;grid-template-columns:1.5fr repeat(4,.7fr) 32px 30px;align-items:center;gap:6px;width:100%;border:1px solid #eee4df;border-radius:9px;background:#fff;padding:8px;text-align:left;cursor:pointer}
.responseTable strong,.responseTable small{display:block}.responseTable small{color:#887a72;font-size:.63rem}
.responseTable>button>span{font-size:.68rem}.responseTable em{text-align:center;font-style:normal}.deleteResponse{width:28px;height:28px;display:grid;place-items:center;border:1px solid #e7c3c0;background:#fff7f6;color:#a92d25;border-radius:8px;cursor:pointer;font-style:normal}
.empty{padding:12px;color:#8b7d75}
.toast{position:fixed;top:15px;left:50%;transform:translateX(-50%);z-index:1000;background:#231b18;color:#fff;border-radius:999px;padding:10px 17px;font-weight:900}
@media(max-width:1000px){.players{grid-template-columns:1fr 1fr}.wrap{grid-template-columns:1fr}.availabilityCard,.linksCard{grid-column:auto}}
@media(max-width:700px){.players,.linkGrid,.responseSummary{grid-template-columns:1fr}.form{grid-template-columns:1fr 1fr}.wide{grid-column:1/-1}.responseTable>button{grid-template-columns:1fr 1fr 1fr}.responseTable>button>div{grid-column:1/-1}.linkTop{grid-template-columns:1fr 78px}.linkTop img{width:74px;height:74px}}
@media(max-width:480px){.form{grid-template-columns:1fr}.wide{grid-column:auto}}
`;
