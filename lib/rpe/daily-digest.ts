import { averageOtherPlayers, evaluateRpe, type RpeEvaluation } from "./engine";
import { painZoneLabel } from "./pain-zones";

export type DigestPlayer = { id: string; first_name?: string | null; last_name?: string | null };
export type DigestResponse = {
  player_id: string;
  created_at?: string | null;
  response_date?: string | null;
  rpe?: unknown;
  duration_minutes?: unknown;
  fatigue?: unknown;
  sleep?: unknown;
  stress?: unknown;
  comment?: unknown;
  is_injured?: unknown;
  pain_zones?: unknown;
  pain_details?: unknown;
};
export type DailyDigestInput = {
  kind: "post_session" | "wellness";
  teamName: string;
  responseDate: string;
  players: DigestPlayer[];
  responses: DigestResponse[];
  wellnessResponses?: DigestResponse[];
  plannedRpe?: unknown;
  teamLogo?: string | null;
  href: string;
};
type Pain = { id: string; label: string; intensity: number | null; type: string; since: string; comment: string };
export type DigestEntry = {
  id: string;
  name: string;
  evening: DigestResponse | null;
  morning: DigestResponse | null;
  rpe: number | null;
  duration: number | null;
  load: number | null;
  injured: boolean;
  evaluation: RpeEvaluation | null;
  eveningPain: Pain[];
  morningPain: Pain[];
  mood: number | null;
  hit: boolean | null;
  reasons: string[];
};

// Null, blank and invalid values never become 0. A real reported zero stays zero.
function number(value: unknown, max = 10): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function esc(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function average(values: Array<number | null>): number | null {
  const valid = values.filter((n): n is number => n !== null);
  return valid.length ? Math.round(valid.reduce((sum, n) => sum + n, 0) / valid.length * 10) / 10 : null;
}
function latest(rows: DigestResponse[], date: string, ids: Set<string>) {
  const map = new Map<string, DigestResponse>();
  for (const row of rows) {
    const id = String(row.player_id);
    if (!ids.has(id) || (row.response_date && row.response_date !== date)) continue;
    const previous = map.get(id);
    const stamp = (r: DigestResponse) => Date.parse(r.created_at || "") || 0;
    if (!previous || stamp(row) >= stamp(previous)) map.set(id, row);
  }
  return map;
}
function pains(row: DigestResponse | null): Pain[] {
  if (!row || !Array.isArray(row.pain_zones)) return [];
  const details = object(row.pain_details);
  return [...new Set(row.pain_zones.filter((id): id is string => typeof id === "string" && !!id && !id.startsWith("_")))].map(id => {
    const detail = object(details[id]);
    return { id, label: painZoneLabel(id), intensity: number(detail.intensity), type: text(detail.type), since: text(detail.since), comment: text(detail.comment) };
  });
}
function painSummary(pain: Pain) {
  return `${pain.label} : ${pain.intensity === null ? "intensité non renseignée" : `${pain.intensity}/10`}`;
}
function signed(n: number) { return `${n > 0 ? "+" : ""}${n.toLocaleString("fr-FR")}`; }

export function buildDailyDigest(input: DailyDigestInput) {
  const players = [...new Map(input.players.map(p => [String(p.id), p])).values()];
  const ids = new Set(players.map(p => String(p.id)));
  const evening = input.kind === "post_session" ? latest(input.responses, input.responseDate, ids) : new Map<string, DigestResponse>();
  const morning = latest(input.kind === "wellness" ? input.responses : input.wellnessResponses || [], input.responseDate, ids);
  const target = number(input.plannedRpe);
  const comparable = [...evening.entries()].flatMap(([id, row]) => {
    const value = number(row.rpe);
    return row.is_injured === true || value === null ? [] : [{ player_id: id, rpe: value, created_at: row.created_at }];
  });
  const entries: DigestEntry[] = players.map(player => {
    const id = String(player.id);
    const pm = evening.get(id) || null, am = morning.get(id) || null;
    const rpe = number(pm?.rpe), duration = number(pm?.duration_minutes, 1440);
    const injured = pm?.is_injured === true;
    const evaluation = pm && !injured && rpe !== null && target !== null ? evaluateRpe({ rpeValue: rpe, targetRpe: target, groupAverage: averageOtherPlayers(comparable, id) }) : null;
    // The evening form sends legacy default fatigue/sleep/stress/_wellness fields.
    // They are not questions asked that evening: only use a real morning response.
    const meta = object(object(am?.pain_details)._wellness);
    const mood = number(meta.mood);
    const hit = typeof meta.hitReceived === "boolean" ? meta.hitReceived : null;
    const eveningPain = pains(pm), morningPain = pains(am);
    const reasons: string[] = [];
    if (evaluation?.severity === "alert") reasons.push(`RPE : ${signed(evaluation.targetDelta!)} au prévu et ${signed(evaluation.groupDelta!)} à la moyenne des autres joueurs.`);
    else if (evaluation?.severity === "watch") reasons.push(`RPE : ${signed(evaluation.targetDelta!)} au prévu${evaluation.groupDelta === null ? " ; comparaison au groupe indisponible" : ` ; écart au groupe ${signed(evaluation.groupDelta)}`}.`);
    if (injured) reasons.push("Se déclare blessé(e) après séance ; RPE exclu de la moyenne et des comparaisons.");
    if (eveningPain.length) reasons.push(`Après séance — ${eveningPain.map(painSummary).join(" ; ")}.`);
    if (morningPain.length) reasons.push(`Wellness du matin — ${morningPain.map(painSummary).join(" ; ")}.`);
    if (hit === true) reasons.push("Coup reçu signalé dans le Wellness du matin.");
    return { id, name: [player.first_name, player.last_name].filter(Boolean).join(" ") || "Joueur", evening: pm, morning: am, rpe, duration, load: rpe !== null && duration !== null ? Math.round(rpe * duration * 10) / 10 : null, injured, evaluation, eveningPain, morningPain, mood, hit, reasons };
  });
  const answered = entries.filter(e => input.kind === "wellness" ? e.morning : e.evening);
  return {
    entries, answered,
    missing: entries.filter(e => input.kind === "wellness" ? !e.morning : !e.evening),
    attention: entries.filter(e => e.reasons.length),
    total: players.length, target,
    averageRpe: average(comparable.map(row => row.rpe)), averageCount: comparable.length,
    averageSleep: average(entries.map(e => number(e.morning?.sleep))),
    averageFatigue: average(entries.map(e => number(e.morning?.fatigue))),
    painPlayers: entries.filter(e => e.eveningPain.length || e.morningPain.length).length,
    wellnessCount: entries.filter(e => e.morning).length,
    injuredCount: entries.filter(e => e.injured).length,
    redCount: entries.filter(e => e.evaluation?.severity === "alert").length,
    watchCount: entries.filter(e => e.evaluation?.severity === "watch").length,
  };
}

const colors = { burgundy: "#6B1A2C", gold: "#D4A24C", ink: "#2B2322", muted: "#766B66", line: "#E8DFD9" };
function format(n: number | null, suffix = "") { return n === null ? "Non renseigné" : `${n.toLocaleString("fr-FR")}${suffix}`; }
function metric(label: string, value: string) {
  return `<td width="50%" valign="top" style="width:50%;padding:10px 8px;overflow-wrap:anywhere"><div style="font-size:11px;line-height:16px;color:${colors.muted}">${esc(label)}</div><div style="margin-top:3px;font-size:17px;line-height:23px;font-weight:800;color:${colors.burgundy}">${esc(value)}</div></td>`;
}
function metrics(items: Array<[string, string]>) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed"><tbody>${Array.from({length: Math.ceil(items.length / 2)}, (_, i) => `<tr>${items.slice(i * 2, i * 2 + 2).map(([label, value]) => metric(label, value)).join("")}</tr>`).join("")}</tbody></table>`;
}
function painHtml(row: DigestResponse | null, items: Pain[], morning: boolean) {
  if (!row) return "";
  const label = morning ? "Douleurs — matin" : "Douleurs — après séance";
  if (!Array.isArray(row.pain_zones)) return `<p style="margin:10px 0 0;color:${colors.muted};font-size:12px">${label} : non renseignées.</p>`;
  if (!items.length) return `<p style="margin:10px 0 0;color:${colors.muted};font-size:12px">${label} : aucune déclarée.</p>`;
  return `<div style="margin-top:12px;padding:12px;background:#FFF6E8;border:1px solid #EED8AC;border-radius:10px"><div style="font-size:11px;font-weight:800;color:#805318">${label}</div>${items.map(p => `<div style="margin-top:9px;font-size:13px;line-height:20px;overflow-wrap:anywhere"><strong>${esc(p.label)} · ${p.intensity === null ? "intensité non renseignée" : `${esc(p.intensity)}/10`}</strong>${morning && (p.type || p.since) ? `<div style="font-size:12px;color:#6D5A42">${esc([p.type, p.since && `Depuis : ${p.since}`].filter(Boolean).join(" · "))}</div>` : ""}${p.comment ? `<div style="margin-top:2px;color:#584D43">${esc(p.comment)}</div>` : ""}</div>`).join("")}</div>`;
}
function status(entry: DigestEntry, kind: DailyDigestInput["kind"], target: number | null) {
  if (kind === "wellness") return entry.morning ? "Wellness renseigné" : "Wellness sans réponse";
  if (!entry.evening) return "RPE sans réponse";
  if (entry.injured) return "Blessure déclarée";
  if (entry.rpe === null) return "RPE non renseigné";
  if (target === null) return "RPE prévu non renseigné";
  if (entry.evaluation?.severity === "alert") return "Alerte RPE";
  if (entry.evaluation?.severity === "watch") return "Écart RPE à consulter";
  return "RPE : seuil non dépassé";
}

export function renderDailyDigest(input: DailyDigestInput): string {
  const model = buildDailyDigest(input);
  const evening = input.kind === "post_session";
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${input.responseDate}T12:00:00Z`));
  const title = evening ? "Bilan RPE & Wellness" : "Bilan Wellness du matin";
  const logo = input.teamLogo && /^https?:\/\//i.test(input.teamLogo) ? `<img src="${esc(input.teamLogo)}" width="52" height="52" alt="${esc(input.teamName)}" style="display:block;width:52px;height:52px;object-fit:contain;background:#fff;border-radius:10px"/>` : "";
  const summary: Array<[string, string]> = [[evening ? "Réponses RPE" : "Réponses Wellness", `${model.answered.length} / ${model.total}`], [evening ? "RPE moyen" : "Sommeil moyen", format(evening ? model.averageRpe : model.averageSleep, " /10")], [evening ? "RPE théorique prévu" : "Fatigue moyenne", format(evening ? model.target : model.averageFatigue, " /10")], ["Joueurs avec douleur déclarée", String(model.painPlayers)]];
  const attention = model.attention.length ? model.attention.map(e => `<div style="margin-top:10px;padding:12px;background:#FFF8ED;border:1px solid #EED8AC;border-radius:10px"><strong style="font-size:14px">${esc(e.name)}</strong>${e.reasons.map(r => `<div style="margin-top:5px;font-size:12px;line-height:19px;overflow-wrap:anywhere">${esc(r)}</div>`).join("")}</div>`).join("") : `<p style="font-size:13px;line-height:20px;color:${colors.muted}">Aucun signalement de douleur, de blessure ou de coup reçu dans les réponses disponibles${evening && model.target !== null ? ", et aucun dépassement du seuil RPE" : ""}.</p>`;
  const cards = model.entries.filter(e => e.evening || e.morning).map(e => {
    const badge = status(e, input.kind, model.target);
    const badgeColor = e.injured || e.evaluation?.severity === "alert" ? "#A62A2A" : e.evaluation?.severity === "watch" ? "#805318" : colors.muted;
    const pm = evening && e.evening ? `<div style="margin-top:13px;font-size:11px;color:${colors.muted};font-weight:800">APRÈS SÉANCE · DERNIÈRE RÉPONSE</div>${metrics([["RPE ressenti", format(e.rpe, " /10")], ["Durée", format(e.duration, " min")], ["Charge (RPE × durée)", format(e.load, " UA")], ["Écart au RPE prévu", e.evaluation?.targetDelta == null ? "Non calculable" : signed(e.evaluation.targetDelta)]])}${e.injured ? `<p style="font-size:12px;color:#A62A2A">Se déclare blessé(e). Hors moyenne RPE et comparaisons.</p>` : ""}${painHtml(e.evening, e.eveningPain, false)}${text(e.evening.comment) ? `<p style="margin:12px 0 0;font-size:13px;line-height:20px;overflow-wrap:anywhere"><strong>Commentaire après séance :</strong> ${esc(text(e.evening.comment))}</p>` : ""}` : "";
    const am = e.morning ? `<div style="margin-top:15px;padding-top:12px;border-top:1px solid ${colors.line}"><div style="font-size:11px;font-weight:800;color:${colors.muted}">WELLNESS · RÉPONSE DU MATIN</div>${metrics([["Qualité du sommeil", format(number(e.morning.sleep), " /10")], ["Fatigue", format(number(e.morning.fatigue), " /10")], ["Stress", format(number(e.morning.stress), " /10")], ["Humeur", format(e.mood, " /10")]])}<p style="margin:7px 0;font-size:12px"><strong>Coup reçu :</strong> ${e.hit === null ? "Non renseigné" : e.hit ? "Oui" : "Non"}</p>${painHtml(e.morning, e.morningPain, true)}${text(e.morning.comment) ? `<p style="font-size:13px;line-height:20px;overflow-wrap:anywhere"><strong>Commentaire du matin :</strong> ${esc(text(e.morning.comment))}</p>` : ""}</div>` : evening ? `<p style="margin:14px 0 0;font-size:12px;color:${colors.muted}">Wellness du matin : sans réponse. Sommeil, fatigue, stress et humeur non disponibles.</p>` : "";
    return `<tr><td style="padding:0 16px 14px"><div data-player="${esc(e.id)}" style="padding:16px;background:#FFFFFF;border:1px solid ${colors.line};border-radius:14px;overflow-wrap:anywhere"><div style="font-size:17px;line-height:24px;font-weight:800;color:${colors.ink}">${esc(e.name)}</div><div style="margin-top:4px;font-size:11px;line-height:17px;color:${badgeColor}">${esc(badge)}</div>${pm}${am}</div></td></tr>`;
  }).join("");
  const href = /^https?:\/\//i.test(input.href) ? input.href : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3EFEC;color:${colors.ink};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F3EFEC"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#FBF8F5;border:1px solid ${colors.line};border-radius:18px;overflow:hidden;table-layout:fixed">
<tr><td style="padding:22px 18px;background:${colors.burgundy};border-bottom:4px solid ${colors.gold}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="overflow-wrap:anywhere"><div style="font-size:10px;letter-spacing:1px;color:#E8C681;font-weight:800">MYBASKET · SUIVI QUOTIDIEN</div><h1 style="margin:8px 0 6px;font-size:23px;line-height:29px;color:#FFFFFF">${title}</h1><div style="font-size:13px;line-height:20px;color:#EBDDE1">${esc(input.teamName)}<br/>${esc(date)}</div></td>${logo ? `<td width="62" align="right" valign="top">${logo}</td>` : ""}</tr></table></td></tr>
<tr><td style="padding:12px 16px 4px">${metrics(summary)}<p style="margin:6px 8px;font-size:11px;line-height:18px;color:${colors.muted}">${evening ? `Moyenne sur ${model.averageCount} RPE valides, hors joueurs se déclarant blessés. Wellness du matin : ${model.wellnessCount}/${model.total} réponses.` : "Moyennes calculées uniquement sur les valeurs renseignées."}</p>${evening && model.target === null ? `<p style="margin:8px;padding:10px;border-radius:8px;background:#F0EBE5;font-size:12px;line-height:18px">RPE théorique non renseigné : la comparaison au prévu est indisponible. Cela ne permet pas de conclure à l’absence d’écart.</p>` : ""}</td></tr>
<tr><td style="padding:12px 16px 20px"><h2 style="margin:0;font-size:16px;color:${colors.burgundy}">À consulter · ${model.attention.length} joueur(s)</h2><p style="margin:6px 0;font-size:11px;line-height:18px;color:${colors.muted}">Les douleurs et les coups reçus sont des déclarations, distinctes des alertes comparatives RPE.${evening ? ` Alertes RPE : ${model.redCount} · Écarts RPE à consulter : ${model.watchCount}.` : ""}</p>${attention}</td></tr>
<tr><td style="padding:0 18px 12px"><h2 style="margin:0;font-size:16px;color:${colors.burgundy}">Réponses par joueur</h2></td></tr>${cards}
${model.missing.length ? `<tr><td style="padding:0 16px 16px"><div style="padding:14px;background:#F0EBE5;border-radius:10px;font-size:12px;line-height:20px;overflow-wrap:anywhere"><strong>${evening ? "RPE" : "Wellness"} sans réponse (${model.missing.length}) :</strong><br/>${esc(model.missing.map(e => e.name).join(" · "))}</div></td></tr>` : ""}
${href ? `<tr><td align="center" style="padding:4px 16px 22px"><a href="${esc(href)}" style="display:inline-block;padding:13px 18px;background:${colors.burgundy};color:#FFFFFF;border-radius:10px;text-decoration:none;font-size:13px;line-height:20px;font-weight:800">Ouvrir le suivi dans MyBasket →</a></td></tr>` : ""}
<tr><td style="padding:16px;border-top:1px solid ${colors.line};font-size:11px;line-height:18px;text-align:center;color:${colors.muted}"><strong style="color:${colors.burgundy}">MYBASKET</strong><br/>Ce bilan reprend les réponses du ${esc(date)}. Une valeur manquante n’est pas remplacée par une note par défaut.<br/>Ces indicateurs ne constituent pas un diagnostic médical.</td></tr>
</table></td></tr></table></body></html>`;
}
