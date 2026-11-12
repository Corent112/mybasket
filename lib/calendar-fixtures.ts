type CalendarTeam = { id: string; name: string; category?: string | null; cat?: string | null };
type CalendarRow = {
  title?: string | null;
  description?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  start_time?: string | null;
  location?: string | null;
  team_id?: string | null;
  attachment_url?: string | null;
  assigned_player_ids?: unknown;
  updated_at?: string | null;
};

export function calendarAgeGroup(value?: string | null): string | undefined {
  const label = value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const age = label?.match(/\bU\s*[-–]?\s*(\d{1,2})(?=$|[^0-9])/i)?.[1];
  if (age) return `U${Number(age)}`;
  if (/\bespoirs\b/i.test(label ?? '')) return 'U21';
}

export function calendarTeamAge(team?: CalendarTeam) {
  return calendarAgeGroup(team?.category) ?? calendarAgeGroup(team?.cat) ?? calendarAgeGroup(team?.name);
}

export function calendarCompetitionAge(description?: string | null) {
  return calendarAgeGroup(description?.match(/compétition\s*:\s*([^·\n]+)/i)?.[1]);
}

export function calendarOpponent(title: string) {
  return title
    .replace(/^\s*(?:match\s+)?(?:U\s*[-–]?\s*\d{1,2}\s+|espoirs\s+)?(?:vs\.?\s+|@\s*)/i, '')
    .replace(/^Match\s+/i, '').trim();
}

/** Collapse imported fixtures for display and prefer the original event linked to the right team. */
export function reconcileCalendarFixtures<T extends CalendarRow>(rows: T[], teams: CalendarTeam[]): T[] {
  const teamsById = new Map(teams.map((team) => [String(team.id), team]));
  const fixtures = new Map<string, { index: number; rank: number; timestamp: string }>();
  const result: T[] = [];

  for (const row of rows) {
    const description = row.description ?? '';
    if (!['game', 'match'].includes(row.event_type ?? '') ||
        !/^(?:Match|Synchronisé)\s+(?:FFBB|LNB)\b/i.test(description)) {
      result.push(row);
      continue;
    }

    const linkedAge = calendarTeamAge(teamsById.get(String(row.team_id ?? '')));
    const competitionAge = calendarCompetitionAge(description);
    const age = competitionAge ?? linkedAge ?? calendarAgeGroup(row.title);
    const mismatched = Boolean(competitionAge && linkedAge && competitionAge !== linkedAge);
    const candidates = mismatched ? teams.filter((team) => calendarTeamAge(team) === competitionAge) : [];
    const teamId = mismatched ? (candidates.length === 1 ? candidates[0].id : null) : row.team_id;
    const opponent = calendarOpponent(row.title ?? '');
    const side = /(?:@|extérieur)/i.test(`${row.location ?? ''} ${row.title ?? ''} ${description}`) ? '@' :
      /(?:\bvs\b|domicile)/i.test(`${row.location ?? ''} ${row.title ?? ''} ${description}`) ? 'vs' : '';
    const corrected = {
      ...row, team_id: teamId,
      title: [age, side, opponent].filter(Boolean).join(' ') || row.title,
    };

    const normalizedOpponent = opponent.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const marker = description.match(/\[mybasket-match:([^\]]+)\]/i)?.[1];
    const scope = String(teamId ?? '');
    const identity = marker && scope
      ? JSON.stringify([scope, marker])
      : null;
    const key = JSON.stringify([scope, age, row.event_date, row.start_time?.slice(0, 5), side, normalizedOpponent]);
    if (!row.event_date || !normalizedOpponent || (!scope && !age)) {
      result.push(corrected);
      continue;
    }

    const known = fixtures.get(key) ?? (identity ? fixtures.get(identity) : undefined);
    const rank = (mismatched ? 0 : 4) + (row.attachment_url ? 2 : 0) +
      (Array.isArray(row.assigned_player_ids) && row.assigned_player_ids.length ? 1 : 0);
    const timestamp = row.updated_at ?? '';
    const slot = known ?? { index: result.length, rank, timestamp };
    if (!known) result.push(corrected);
    else if (rank > known.rank || (rank === known.rank && timestamp > known.timestamp)) {
      result[slot.index] = corrected;
      slot.rank = rank;
      slot.timestamp = timestamp;
    }
    fixtures.set(key, slot);
    if (identity) fixtures.set(identity, slot);
  }

  return result;
}
