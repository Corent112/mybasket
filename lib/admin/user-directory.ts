export type DirectorySource = {
  id: string;
  email?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  platform_role?: string | null;
  status?: string | null;
  club?: string | null;
  club_name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
  is_anonymous?: boolean;
  cohort_id?: string | null;
  institution_id?: string | null;
  expires_at?: string | null;
  name?: string | null;
  training_programs?: { name?: string | null } | null;
  user_metadata?: Record<string, unknown>;
};

export type DirectoryPerson = {
  id: string;
  account_id: string | null;
  email: string | null;
  display_name: string | null;
  platform_role: string | null;
  status: string | null;
  club: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  connection_known: boolean;
  guest: boolean;
  trainings: string[];
};

const emailKey = (email: string | null | undefined) => (email || '').trim().toLowerCase();
const fullName = (row: DirectorySource) => [row.first_name, row.last_name].filter(Boolean).join(' ').trim();

/** Auth is the only source of login timestamps. Contacts never become auth accounts here. */
export function buildUserDirectory({
  profiles, authUsers, candidates, cohorts, invitations, now = Date.now(),
}: {
  profiles: DirectorySource[];
  authUsers: DirectorySource[] | null;
  candidates: DirectorySource[];
  cohorts: DirectorySource[];
  invitations: DirectorySource[];
  now?: number;
}): DirectoryPerson[] {
  const people = new Map<string, DirectoryPerson>();
  const byAccount = new Map<string, DirectoryPerson>();
  const byEmail = new Map<string, DirectoryPerson>();
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const add = (person: DirectoryPerson) => {
    people.set(person.id, person);
    if (person.account_id) byAccount.set(person.account_id, person);
    const email = emailKey(person.email);
    if (email && !byEmail.has(email)) byEmail.set(email, person);
    return person;
  };

  for (const auth of authUsers ?? profiles) {
    const profile = profilesById.get(auth.id);
    const metadata = auth.user_metadata || {};
    const lastLogin = authUsers ? auth.last_sign_in_at || null : null;
    add({
      id: auth.id, account_id: auth.id,
      email: auth.email || profile?.email || null,
      display_name: profile?.display_name || String(metadata.display_name || metadata.full_name || '') ||
        [metadata.first_name, metadata.last_name].filter(Boolean).join(' ') ||
        (auth.is_anonymous ? `Invité ${auth.id.slice(0, 8)}` : null),
      platform_role: profile?.platform_role || 'user', status: profile?.status || 'active',
      club: profile?.club || null,
      avatar_url: profile?.avatar_url || String(metadata.avatar_url || '') || null,
      created_at: auth.created_at || profile?.created_at || null,
      last_sign_in_at: lastLogin, connection_known: authUsers !== null,
      guest: Boolean(auth.is_anonymous || (auth.invited_at && !lastLogin)), trainings: [],
    });
  }

  // Orphaned profiles remain visible as contacts, without account-management actions.
  for (const profile of profiles) {
    if (byAccount.has(profile.id)) continue;
    const email = emailKey(profile.email);
    if (email && byEmail.has(email)) continue;
    add({
      id: `profile:${profile.id}`, account_id: null,
      email: profile.email || null, display_name: profile.display_name || null,
      platform_role: null, status: 'contact', club: profile.club || null,
      avatar_url: profile.avatar_url || null, created_at: profile.created_at || null,
      last_sign_in_at: null, connection_known: true, guest: false, trainings: [],
    });
  }

  const contact = (row: DirectorySource, source: string) => {
    // An explicit account relation takes precedence over an email edited on a training record.
    const existing = (row.user_id && byAccount.get(row.user_id)) || byEmail.get(emailKey(row.email));
    if (existing) {
      if (!existing.display_name) existing.display_name = fullName(row) || null;
      if (!existing.club) existing.club = row.club_name || null;
      return existing;
    }
    return add({
      id: `${source}:${row.id}`, account_id: null, email: row.email || null,
      display_name: fullName(row) || row.display_name || null,
      platform_role: null, status: 'contact', club: row.club_name || null,
      avatar_url: null, created_at: row.created_at || null,
      last_sign_in_at: null, connection_known: true, guest: false, trainings: [],
    });
  };

  const institutionalCohorts = new Map(cohorts.filter(cohort => cohort.institution_id).map(cohort => [cohort.id, cohort]));
  for (const candidate of candidates) {
    const cohort = institutionalCohorts.get(candidate.cohort_id || '');
    if (!cohort) continue;
    const person = contact(candidate, 'training');
    const label = [cohort.training_programs?.name, cohort.name].filter(Boolean).join(' · ') || 'Formation institutionnelle';
    if (!person.trainings.includes(label)) person.trainings.push(label);
  }
  for (const invitation of invitations) {
    if (invitation.status !== 'pending' || !emailKey(invitation.email)) continue;
    if (invitation.expires_at && (!Number.isFinite(Date.parse(invitation.expires_at)) || Date.parse(invitation.expires_at) <= now)) continue;
    contact(invitation, 'invitation').guest = true;
  }
  return [...people.values()].sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0) || a.id.localeCompare(b.id));
}

export function formatLastConnection(person: Pick<DirectoryPerson, 'account_id' | 'connection_known' | 'last_sign_in_at'>) {
  if (!person.account_id) return 'Sans compte';
  if (!person.connection_known) return 'Indisponible';
  if (!person.last_sign_in_at) return 'Jamais';
  const date = new Date(person.last_sign_in_at);
  if (!Number.isFinite(date.getTime())) return 'Indisponible';
  return date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function matchesDirectoryFilters(person: DirectoryPerson, access: { active: boolean; source: string | null }, filters: { q: string; role: string; status: string; category: string }) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const text = normalize([person.display_name, person.email, person.club, ...person.trainings].filter(Boolean).join(' '));
  if (filters.q && !text.includes(normalize(filters.q.trim()))) return false;
  if (filters.role !== 'all' && person.platform_role !== filters.role) return false;
  if (filters.status !== 'all' && person.status !== filters.status) return false;
  switch (filters.category) {
    case 'subscribers': return access.active && access.source === 'subscription';
    case 'free': return access.active && access.source === 'free';
    case 'guests': return person.guest;
    case 'training': return person.trainings.length > 0;
    case 'without-account': return !person.account_id;
    case 'without-subscription': return !!person.account_id && !access.active;
    case 'never-connected': return !!person.account_id && person.connection_known && !person.last_sign_in_at;
    default: return true;
  }
}
