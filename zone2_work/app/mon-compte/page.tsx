'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MonCalendrier from './Calendrier';
import Messagerie from '@/components/account/Messagerie';
import MesPapiers from './MesPapiers';
import LiveStatsModule from "@/components/management/LiveStatsModule";
import StatsJoueursModule from "@/components/management/StatsJoueursModule";
import StatsTempsFortsModule from "@/components/management/StatsTempsFortsModule";
import StatsEquipeModule from "@/components/management/StatsEquipeModule";
import RotationModule from "@/components/management/RotationModule";
import HistoriqueMatchsModule from "@/components/management/HistoriqueMatchsModule";

import {
  getTeams,
  saveTeam,
  deleteTeam,
  upsertPlayer,
  addMatch,
  deleteMatch,
} from '@/lib/equipes-store';
import {
  listPlaybooks,
  createPlaybook as createPlaybookDb,
  deletePlaybook as deletePlaybookDb,
  updatePlaybook,
  type Playbook,
} from "@/lib/playbook";
import TeamForm from '@/components/equipes/TeamForm';
import PlayerForm from '@/components/equipes/PlayerForm';
import type { Player, Team, TeamMatch } from '@/types/player';
import GamePlanModule from "@/components/management/GamePlanModule";
import GestionAdminModule from "@/components/management/GestionAdminModule";


type Form = {
  photo: string;
  logo: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  phone: string;
  club: string;
  category: string;
  subscription: string;
};

type MenuItem = {
  key: string;
  label: string;
  icon: string;
  href?: string;
};

const STORAGE_KEY = 'mybasket_profile';
const CATS = ['U9', 'U11', 'U13', 'U15', 'U18', 'U21', 'SENIOR'];

const blank = (): Form => ({
  photo: '',
  logo: '',
  firstName: '',
  lastName: '',
  birthdate: '',
  phone: '',
  club: '',
  category: '',
  subscription: 'Aucun',
});

const MENU: MenuItem[] = [
  { key: 'profil', label: 'Mon Profil', icon: '👤' },
  { key: 'messagerie', label: 'Messagerie', icon: '💬' },

  {
  key: 'club',
  label: 'Espace Club',
  icon: '🏛️',
  href: '/mon-compte/club',
},

  { key: 'abonnement', label: 'Mon Abonnement', icon: '💎' },
  { key: 'calendrier', label: 'Mon Calendrier', icon: '📒' },

  {
  key: 'exercices',
  label: 'Mes Exercices',
  icon: '🏀',
  href: '/mon-compte/exercices',
},
  {
  key: 'playbooks',
  label: 'Mes Playbooks',
  icon: '📁',
},
  { key: 'profilcoach', label: 'Mon Profil Coach', icon: '⚡' },
  { key: 'annonces', label: 'Mes Annonces', icon: '📣' },
  { key: 'papiers', label: 'Mes Papiers', icon: '📃' },
  { key: 'equipes', label: 'Mes Équipes', icon: '👥' },
  { key: 'management', label: 'Management', icon: '📊' },
];

const fmtDate = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};

const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 10);
  return d.replace(/(\d{2})(?=\d)/g, '$1.');
};

export default function MonComptePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const photoInput = useRef<HTMLInputElement | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const toastT = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [uid, setUid] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasClubSubscription, setHasClubSubscription] = useState(false);
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string>('profil');
  const [managementView, setManagementView] = useState<
  | "stats-joueurs"
  | "stats-equipe"
  | "stats-jeu"
  | "live"
  | "historique"
  | "rotation"
  | "gameplan"
  | "gestion-admin"
>("rotation");
  const [form, setForm] = useState<Form>(blank());
  const [toast, setToast] = useState('');

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamForm, setTeamForm] = useState<{ open: boolean; team?: Team }>({ open: false });
  const [playerFor, setPlayerFor] = useState<string | null>(null);
  const [matchFor, setMatchFor] = useState<string | null>(null);
  const [playbookModalOpen, setPlaybookModalOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const requestedModule = searchParams.get("module");
    const allowedTabs = new Set(MENU.map((item) => item.key));
    const allowedManagementViews = new Set([
      "stats-joueurs",
      "stats-equipe",
      "stats-jeu",
      "live",
      "historique",
      "rotation",
      "gameplan",
      "gestion-admin",
    ]);

    if (requestedTab && allowedTabs.has(requestedTab)) {
      setActive(requestedTab);
    }

    if (requestedModule && allowedManagementViews.has(requestedModule)) {
      setManagementView(requestedModule as typeof managementView);
    }
  }, [searchParams]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(''), 2200);
  };

  const reloadTeams = async () => {
    try {
      const data = await getTeams();
      setTeams(data);
    } catch (error) {
      console.error("Erreur chargement équipes:", error);
      setTeams([]);
    }
  };
  const reloadPlaybooks = async () => {
  try {
    const data = await listPlaybooks();
    setPlaybooks(data);
  } catch (error) {
    console.error("Erreur chargement playbooks:", error);
  }
};
  useEffect(() => {
  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/connexion?next=/mon-compte");
      return;
    }

    setUid(user.id);
    setEmail(user.email ?? "");

    let local = blank();

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) local = { ...local, ...JSON.parse(raw) };
    } catch {}

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, club, avatar_url, platform_role")
      .eq("id", user.id)
      .single();

    const userIsAdmin =
      profile?.platform_role === "ceo" ||
      profile?.platform_role === "superadmin" ||
      profile?.platform_role === "admin";

    setIsAdmin(userIsAdmin);

    let subscriptionLabel = userIsAdmin ? "Accès total CEO" : "Aucun";
    let userHasClubSubscription = userIsAdmin;

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (subscription?.plan_id) {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name, slug, target")
        .eq("id", subscription.plan_id)
        .maybeSingle();

      if (!userIsAdmin) subscriptionLabel = plan?.name || "Aucun";

      userHasClubSubscription =
        plan?.target === "club" ||
        plan?.slug === "club-bronze" ||
        plan?.slug === "club-silver" ||
        plan?.slug === "club-gold" ||
        plan?.name?.toLowerCase().includes("club") === true;
    }

    setHasClubSubscription(userIsAdmin || userHasClubSubscription);

    const accessRes = await fetch("/api/access");
    const accessData = await accessRes.json();

    setAccessMap(accessData);

    const dn = (profile?.display_name || "").trim();

    setForm({
      ...local,
      firstName: local.firstName || (dn ? dn.split(" ")[0] : ""),
      lastName: local.lastName || (dn ? dn.split(" ").slice(1).join(" ") : ""),
      club: local.club || profile?.club || "",
      photo: local.photo || profile?.avatar_url || "",
      subscription: subscriptionLabel,
    });

    await reloadTeams();
    await reloadPlaybooks();

    setLoading(false);
  };

  load();
}, [router, supabase]);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const photo = await readFile(file);
    setForm((prev) => ({ ...prev, photo }));
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const logo = await readFile(file);
    setForm((prev) => ({ ...prev, logo }));
  };

  const setField = (key: keyof Form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {}

    const display = `${form.firstName} ${form.lastName}`.trim();

    if (uid) {
      await supabase
        .from('profiles')
        .update({
          display_name: display,
          club: form.club,
        })
        .eq('id', uid);
    }

    showToast('Modifications enregistrées');
  };

  const handleTeamSave = async (team: Team) => {
    try {
      await saveTeam(team);
      setTeamForm({ open: false });
      await reloadTeams();
      showToast("Équipe enregistrée");
    } catch (error) {
      console.error("Erreur enregistrement équipe:", error);
      alert("Erreur pendant l'enregistrement de l'équipe.");
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    if (!confirm(`Supprimer définitivement l'équipe « ${team.name} » ?`)) return;

    try {
      await deleteTeam(team.id);
      await reloadTeams();
      showToast("Équipe supprimée");
    } catch (error) {
      console.error("Erreur suppression équipe:", error);
      alert("Erreur pendant la suppression de l'équipe.");
    }
  };

  const handlePlayerSave = async (teamId: string, player: Player) => {
    try {
      await upsertPlayer(teamId, player);
      setPlayerFor(null);
      await reloadTeams();
      showToast("Joueur ajouté");
    } catch (error) {
      console.error("Erreur enregistrement joueur:", error);
      alert("Erreur pendant l'enregistrement du joueur.");
    }
  };

  const handleMatchSave = async (teamId: string, match: TeamMatch) => {
    try {
      await addMatch(teamId, match);
      setMatchFor(null);
      await reloadTeams();
      showToast("Match ajouté");
    } catch (error) {
      console.error("Erreur ajout match:", error);
      alert("Erreur pendant l'ajout du match.");
    }
  };

  const handleMatchDelete = async (teamId: string, matchId: string) => {
    try {
      await deleteMatch(teamId, matchId);
      await reloadTeams();
      showToast("Match supprimé");
    } catch (error) {
      console.error("Erreur suppression match:", error);
      alert("Erreur pendant la suppression du match.");
    }
  };
const createPlaybook = async () => {
  const title = window.prompt("Nom du playbook ?");

  if (!title || !title.trim()) return;

  try {
    const created = await createPlaybookDb({
      title: title.trim(),
      description: "",
    });

    setPlaybooks((prev) => [created, ...prev]);
    router.push(`/mon-compte/playbooks/${created.id}`);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Erreur pendant la création du playbook";
    console.error("Erreur pendant la création du playbook:", error);
    alert(message);
  }
};

const deletePlaybook = async (id: string) => {
  const ok = window.confirm("Supprimer ce playbook ?");
  if (!ok) return;

  try {
    await deletePlaybookDb(id);
    setPlaybooks((prev) => prev.filter((playbook) => playbook.id !== id));
    showToast("Playbook supprimé");
  } catch (error) {
    console.error(error);
    alert("Erreur pendant la suppression du playbook");
  }
};

const renamePlaybook = async (id: string) => {
  const current = playbooks.find((playbook) => playbook.id === id);
  if (!current) return;

  const title = window.prompt("Nouveau nom du playbook ?", current.title);

  if (!title || !title.trim()) return;

  try {
    const updated = await updatePlaybook(id, {
      title: title.trim(),
    });

    setPlaybooks((prev) =>
      prev.map((playbook) =>
        playbook.id === id ? updated : playbook
      )
    );

    showToast("Playbook modifié");
  } catch (error) {
    console.error(error);
    alert("Erreur pendant la modification du playbook");
  }
};

const openPlaybook = (id: string) => {
  window.location.href = `/mon-compte/playbooks/${id}`;
};

const fullName =
  `${form.firstName || ""} ${form.lastName || ""}`.trim().toUpperCase() ||
  "MON PROFIL";

const initials =
  (
    (form.firstName?.[0] || "") +
      (form.lastName?.[0] || "") ||
    (email?.[0] || "?")
  ).toUpperCase();

const MENU_ACCESS: Record<string, string> = {
  messagerie: "messagerie",
  calendrier: "calendrier",

  exercices: "exercices",

  playbooks: "playbooks",

  annonces: "annonces",

  papiers: "documents",

  equipes: "equipes",

  management: "management",

  profilcoach: "profil_coach",


  club: "club_space",
};

const visibleMenu = MENU;

return (

    <div className="mc">
      <style>{CSS}</style>

      <div className="mc-profilehead">
        <button className="mc-retour" onClick={() => router.push('/')}>
          ← Retour
        </button>

        <div className="mc-avatar-round">
          {form.photo ? <img src={form.photo} alt="" /> : <span>{initials}</span>}
        </div>

        <div className="mc-profilehead-info">
          <h1>{fullName}</h1>

          <div className="mc-club-line">
            {form.logo && <img src={form.logo} alt="" />}
            <span>{form.club || '—'}</span>
          </div>

          <div className="mc-line strong">{form.birthdate || '—'}</div>

          <a className="mc-mail" href={`mailto:${email}`}>
            {email}
          </a>

          <div className="mc-line strong">{form.phone || '—'}</div>
        </div>

        <button
          className="mc-modifier"
          onClick={() =>
            formRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
        >
          ✎ Modifier les informations
        </button>
      </div>

      <div className="mc-hr" />

      <div className="mc-body">
        <aside className="mc-side">
          {visibleMenu.map((item) =>
            item.href ? (
              <Link key={item.key} href={item.href} className="mc-side-item">
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                className={'mc-side-item' + (active === item.key ? ' on' : '')}
                onClick={() => setActive(item.key)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            )
          )}

          {isAdmin && (
            <Link href="/admin" className="mc-side-item admin">
              <span>⚡</span>
              Administration
            </Link>
          )}
        </aside>

        <section className="mc-content" ref={formRef}>
          {active === 'profil' && (
            <div className="mc-form">
              <div className="mc-row top">
                <label className="k">Photo de Profil</label>
                <div className="f">
                  <div className="mc-photo" onClick={() => photoInput.current?.click()}>
                    {form.photo ? <img src={form.photo} alt="" /> : <span className="ph">＋</span>}
                    <span className="mc-plus">＋</span>
                  </div>
                  <input ref={photoInput} type="file" accept="image/*" hidden onChange={onPhoto} />
                </div>
              </div>

              <div className="mc-row">
                <label className="k">Nom</label>
                <div className="f">
                  <input className="pill" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
                </div>
              </div>

              <div className="mc-row">
                <label className="k">Prénom</label>
                <div className="f">
                  <input className="pill" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} />
                </div>
              </div>

              <div className="mc-row">
                <label className="k">Date de naissance</label>
                <div className="f">
                  <input className="pill" inputMode="numeric" placeholder="JJ/MM/AAAA" value={form.birthdate} onChange={(e) => setField('birthdate', fmtDate(e.target.value))} />
                </div>
              </div>

              <div className="mc-row">
                <label className="k">Mail</label>
                <div className="f">
                  <input className="pill" value={email} disabled />
                </div>
              </div>

              <div className="mc-row">
                <label className="k">N° de téléphone</label>
                <div className="f">
                  <input className="pill" inputMode="numeric" placeholder="00.00.00.00.00" value={form.phone} onChange={(e) => setField('phone', fmtPhone(e.target.value))} />
                </div>
              </div>

              <div className="mc-row">
                <label className="k">Club</label>
                <div className="f">
                  <input className="pill" value={form.club} onChange={(e) => setField('club', e.target.value)} />
                </div>
              </div>

              <div className="mc-row top">
                <label className="k">Logo du club</label>
                <div className="f">
                  <div className="mc-logo" onClick={() => logoInput.current?.click()}>
                    {form.logo ? <img src={form.logo} alt="" /> : <span className="ph">＋</span>}
                    <span className="mc-plus">＋</span>
                  </div>
                  <input ref={logoInput} type="file" accept="image/*" hidden onChange={onLogo} />
                </div>
              </div>

              <div className="mc-row top">
                <label className="k">Catégorie</label>
                <div className="f">
                  <div className="mc-cats">
                    {CATS.map((cat) => (
                      <label key={cat} className="mc-cat">
                        <input type="radio" name="cat" checked={form.category === cat} onChange={() => setField('category', cat)} /> {cat}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mc-row">
                <label className="k">Mon abonnement</label>
                <div className="f">
                  <input className="pill" value={form.subscription} disabled />
                </div>
              </div>

              <div className="mc-save-row">
                <button className="mc-save" onClick={save}>
                  Sauvegarder
                </button>
              </div>
            </div>
          )}

          {active === 'messagerie' && <Messagerie />}
          {active === 'calendrier' && <MonCalendrier />}
          {active === 'papiers' && <MesPapiers />}

          {active === 'abonnement' && uid && (
            <AbonnementSection userId={uid} />
          )}

          {active === 'profilcoach' && uid && (
  <CoachProfileSection userId={uid} />
)}

          {active === 'annonces' && uid && (
            <AnnoncesSection userId={uid} />
          )}

          {active === 'equipes' && (
            <div className="mc-equipes">
              <div className="mc-equipes-head">
                <div>
                  <h2>Mes Équipes</h2>
                  <p>Crée tes équipes, gère leurs effectifs et leurs matchs.</p>
                </div>
                <button className="mc-new-team" onClick={() => setTeamForm({ open: true })}>
                  + Nouvelle équipe
                </button>
              </div>

              <div className="mc-teamgrid">
                {teams.map((team) => (
                  <article key={team.id} className="mc-teamcard">
                    <div className="mc-team-banner">
                      {team.banniere ? <img src={team.banniere} alt="" /> : <span>🏀</span>}
                    </div>

                    <div className="mc-team-body">
                      <div className="mc-team-title">
                        <div className="mc-team-logo">
                          {team.logo ? <img src={team.logo} alt="" /> : <span>🏀</span>}
                        </div>

                        <div>
                          <h3>{team.name}</h3>
                          <p>{team.cat} · {team.players.length} joueur(s)</p>
                        </div>
                      </div>

                      {team.players.length > 0 && (
                        <div className="mc-playerchips">
                          {team.players.slice(0, 9).map((player) => (
                            <button
                              key={player.id}
                              type="button"
                              onClick={() => router.push(`/equipes/${team.id}/${player.id}`)}
                            >
                              <span>
                                {player.photo ? <img src={player.photo} alt="" /> : player.firstName?.[0] || '?'}
                              </span>
                              {player.firstName} {player.lastName?.[0]}.
                            </button>
                          ))}
                        </div>
                      )}

                      {team.matchs?.length > 0 && (
                        <div className="mc-matches">
                          <div className="mc-matches-title">
                            Matchs / Entraînements ({team.matchs.length})
                          </div>

                          {team.matchs.map((match) => (
                            <div key={match.id} className="mc-match">
                              <span>{match.kind === 'Match' ? '🏀' : '🏋️'}</span>
                              <strong>{match.date} {match.heure}</strong>
                              <em>
                                {match.kind === 'Match'
                                  ? `vs ${match.adversaire || '—'}`
                                  : 'Entraînement'}
                              </em>
                              <button type="button" onClick={() => handleMatchDelete(team.id, match.id)}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mc-team-actions">
                        <button className="main" onClick={() => router.push(`/equipes/${team.id}`)}>
                          Voir la page de l'équipe
                        </button>
                        <button type="button" onClick={() => setPlayerFor(team.id)}>+ Joueur</button>
                        <button type="button" onClick={() => setMatchFor(team.id)}>+ Match / Entraînement</button>
                        <button type="button" onClick={() => setTeamForm({ open: true, team })}>Éditer</button>
                        <button type="button" className="danger" onClick={() => handleDeleteTeam(team)}>🗑️</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
{active === "playbooks" && (
  <div className="mc-equipes">
    <div className="mc-equipes-head">
      <div>
        <h2>Mes Playbooks</h2>
        <p>
          Crée tes playbooks, organise tes systèmes et construis ton identité de jeu.
        </p>
      </div>

      <button
  type="button"
  className="mc-new-team"
  onClick={() => setPlaybookModalOpen(true)}
>
  + Nouveau playbook
</button>
    </div>

    {playbooks.length === 0 ? (
      <div className="mc-soft">
        <h2>Aucun playbook</h2>
        <p>Crée ton premier playbook pour ranger tes systèmes.</p>

        <button
          type="button"
          className="mc-new-team"
          onClick={() => setPlaybookModalOpen(true)}
        >
          + Créer un playbook
        </button>
      </div>
    ) : (
      <div className="mc-teamgrid">
        {playbooks.map((playbook) => (
          <article key={playbook.id} className="mc-teamcard">
            <button
              type="button"
              className="mc-team-banner"
              onClick={() => openPlaybook(playbook.id)}
              style={{
                cursor: "pointer",
                border: 0,
                width: "100%",
              }}
            >
              📁
            </button>

            <div className="mc-team-body">
              <div className="mc-team-title">
                <div className="mc-team-logo">📋</div>

                <div>
                  <h3>{playbook.title}</h3>
                  <p>
                    {playbook.category || "Playbook"} ·{" "}
                    {playbook.season || "Saison non définie"}
                  </p>
                </div>
              </div>

              <div className="mc-team-actions">
                <button
                  type="button"
                  className="main"
                  onClick={() => openPlaybook(playbook.id)}
                >
                  Ouvrir le playbook
                </button>

                <button
                  type="button"
                  onClick={() => renamePlaybook(playbook.id)}
                >
                  Modifier
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={() => deletePlaybook(playbook.id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </div>
)}
          {active === "management" && (
  <div className="mc-management">
    <div className="mc-management-header">
      <h2>Management</h2>
      <p>
        Gère les statistiques, les rotations, le game plan et la prise de stats live.
      </p>
    </div>

    <div className="mc-management-tabs">
      <button
        className={managementView === "stats-joueurs" ? "on" : ""}
        onClick={() => setManagementView("stats-joueurs")}
      >
        📈 Stats joueurs
      </button>

      <button
        className={managementView === "stats-equipe" ? "on" : ""}
        onClick={() => setManagementView("stats-equipe")}
      >
        🏀 Stats équipe
      </button>

      <button
        className={managementView === "stats-jeu" ? "on" : ""}
        onClick={() => setManagementView("stats-jeu")}
      >
        🎯 Stats jeu
      </button>

      <button
        className={managementView === "live" ? "on" : ""}
        onClick={() => setManagementView("live")}
      >
        🔴 Stats Live
      </button>

      <button
        className={managementView === "historique" ? "on" : ""}
        onClick={() => setManagementView("historique")}
      >
        📚 Historique
      </button>

      <button
        className={managementView === "rotation" ? "on" : ""}
        onClick={() => setManagementView("rotation")}
      >
        🔄 Rotation
      </button>

      <button
        className={managementView === "gameplan" ? "on" : ""}
        onClick={() => setManagementView("gameplan")}
      >
        🧠 Game Plan
      </button>

      {isAdmin && (
  <button
    type="button"
    className={managementView === "gestion-admin" ? "on" : ""}
    onClick={() => setManagementView("gestion-admin")}
  >
    ⚙️ Gestion Admin
  </button>
)}
    </div>

    <div className="mc-management-content">
      {managementView === "stats-joueurs" && <StatsJoueursModule />}

      {managementView === "stats-equipe" && <StatsEquipeModule />}

      {managementView === "stats-jeu" && <StatsTempsFortsModule />}

      {managementView === "live" && (
  <div className="mc-live-launch">
    <div className="mc-live-icon">🔴</div>

    <h3>Prise de Stats Live</h3>

    <p>
      Lance l'outil de prise de statistiques en plein écran pour bénéficier
      d'un maximum d'espace pendant le match.
    </p>

    <button
  className="mc-live-btn"
  onClick={() =>
    window.open(
      "/prise-stats-live",
      "_blank",
      "noopener,noreferrer"
    )
  }
>
  🔴 Ouvrir la prise de stats
</button>
  </div>
)}
{managementView === "historique" && <HistoriqueMatchsModule />}

      {managementView === "rotation" && <RotationModule />}

{managementView === "gameplan" && (
  <GamePlanModule />
)}

{managementView === "gestion-admin" && isAdmin && (
  <GestionAdminModule />
)}
    </div>
  </div>
)}

{active !== "profil" &&
  active !== "messagerie" &&
  active !== "calendrier" &&
  active !== "equipes" &&
  active !== "playbooks" &&
  active !== "papiers" &&
  active !== "abonnement" &&
  active !== "profilcoach" &&
  active !== "annonces" &&
  active !== "management" && (
    <div className="mc-soft">
      <h2>{MENU.find((item) => item.key === active)?.label}</h2>
      <p>🚧 Section bientôt disponible.</p>
    </div>
  )}
        </section>
      </div>

      {teamForm.open && (
        <TeamForm
          team={teamForm.team}
          onSave={handleTeamSave}
          onClose={() => setTeamForm({ open: false })}
        />
      )}

      {playerFor && (
        <PlayerForm
          onSave={(player) => handlePlayerSave(playerFor, player)}
          onClose={() => setPlayerFor(null)}
        />
      )}

      {matchFor && (
        <MatchForm
          onSave={(match) => handleMatchSave(matchFor, match)}
          onClose={() => setMatchFor(null)}
        />
      )}
{playbookModalOpen && (
  <PlaybookCreateModal
    onClose={() => setPlaybookModalOpen(false)}
    onCreated={(playbookId) => {
      setPlaybookModalOpen(false);
      reloadPlaybooks();

      router.push(`/mon-compte/playbooks/${playbookId}`);
    }}
  />
)}
      {toast && <div className="mc-toast">{toast}</div>}
    </div>
  );
}

const TABLES = {
  // Abonnement en cours de l'utilisateur (liaison user ↔ plan)
  // colonnes utilisées : user_id, plan_id, billing_period ("monthly"|"yearly"),
  //                      status, current_period_end
  subscriptions: "subscriptions",
  plans: "subscription_plans",
  // Profil coach individuel : user_id (unique), display_name, city, bio,
  //   hourly_rate_cents, phone, specialties (text[]/jsonb), levels (text[]/jsonb),
  //   is_published
  coachProfiles: "coach_profiles",
  // Annonces : id, user_id, category, title, city, description, price_cents,
  //   date_start, date_end, status, created_at
  annonces: "annonces",
  // Revenus du coach : id, user_id, label, amount_cents, status, created_at
  revenus: "coach_revenues",
};

const ANNONCE_CAMP_CATEGORY = "camp"; // "tout lié aux camps"

const LEVELS = ["U9", "U11", "U13", "U15", "U18", "U21", "Senior"];

type SectionKey = "abonnement" | "coach" | "annonces";

/* ----------------------------- Helpers ---------------------------------- */

function formatEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "0 €";

  return (
    (cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function centsToEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return String(cents / 100);
}

function eurosToCents(str: string): number | null {
  const t = str.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      /* pas du JSON */
    }
    return s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return [];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ===================== 💎 MON ABONNEMENT =============================== */

type Plan = {
  id: string;
  name: string;
  target: string | null;
  price_monthly_cents: number | null;
  price_yearly_cents: number | null;
  storage_gb: number | null;
  coach_limit_label: string | null;
  description: string | null;
  features: unknown;
};

type Subscription = {
  plan_id: string;
  billing_period: "monthly" | "yearly" | null;
  status: string | null;
  current_period_end: string | null;
};

function AbonnementSection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<(Plan & { image_url?: string | null; slug?: string | null }) | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isCeo, setIsCeo] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSubscription() {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();

      const admin = ["ceo", "superadmin", "admin"].includes(profile?.platform_role || "");
      if (mounted) setIsCeo(admin);

      if (admin) {
        if (mounted) setLoading(false);
        return;
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id,billing_period,status,current_period_end")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sub?.plan_id) {
        const { data: currentPlan } = await supabase
          .from("subscription_plans")
          .select("*")
          .eq("id", sub.plan_id)
          .maybeSingle();
        if (mounted) setPlan(currentPlan as (Plan & { image_url?: string | null; slug?: string | null }) | null);
      }

      if (mounted) {
        setSubscription((sub as Subscription | null) ?? null);
        setLoading(false);
      }
    }

    loadSubscription();
    return () => { mounted = false; };
  }, [userId]);

  const formatEndDate = (value: string | null | undefined) => {
    if (!value) return null;
    return new Date(value).toLocaleDateString("fr-FR");
  };

  if (loading) {
    return <section className="account-card"><p>Chargement de l’abonnement…</p></section>;
  }

  return (
    <section className="account-card subscription-card">
      <div className="subscription-head">
        <div>
          <p className="eyebrow">Abonnement</p>
          <h2>{isCeo ? "Accès CEO" : plan?.name || "Aucun abonnement actif"}</h2>
          <p className="muted">
            {isCeo
              ? "Accès total à MyBasket, indépendant de tout abonnement."
              : plan?.description || "Choisissez une formule pour débloquer vos accès."}
          </p>
        </div>
        <a className="primary-btn" href="/abonnements">Voir les abonnements</a>
      </div>

      <div className="subscription-content">
        <div className="subscription-visual">
          {plan?.image_url ? (
            <img src={plan.image_url} alt={plan.name} />
          ) : (
            <div className="subscription-placeholder" aria-label="Visuel abonnement">
              <span>MYBASKET</span>
              <strong>{isCeo ? "CEO" : plan?.name || "LIBRE"}</strong>
            </div>
          )}
        </div>

        <div className="subscription-details">
          <p><span>Statut</span><strong>{isCeo ? "Accès total" : subscription?.status === "active" ? "Actif" : "Inactif"}</strong></p>
          {!isCeo && subscription?.billing_period && (
            <p><span>Période</span><strong>{subscription.billing_period === "yearly" ? "Annuelle" : "Mensuelle"}</strong></p>
          )}
          {!isCeo && formatEndDate(subscription?.current_period_end) && (
            <p><span>Prochaine échéance</span><strong>{formatEndDate(subscription?.current_period_end)}</strong></p>
          )}
        </div>
      </div>
    </section>
  );
}
/* ============== ⚡ PROFIL COACH INDIVIDUEL (+ REVENUS) ================== */

type Draft = {
  display_name: string;
  city: string;
  bio: string;
  hourly_rate: string; // euros
  phone: string;
  specialtiesText: string; // une par ligne
  levels: string[];
  is_published: boolean;
};

type Revenu = {
  id: string;
  label: string | null;
  amount_cents: number | null;
  status: string | null;
  created_at: string | null;
};

const EMPTY_DRAFT: Draft = {
  display_name: "",
  city: "",
  bio: "",
  hourly_rate: "",
  phone: "",
  specialtiesText: "",
  levels: [],
  is_published: false,
};

function CoachProfileSection({ userId }: { userId: string }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [revenus, setRevenus] = useState<Revenu[]>([]);
  const [revLoading, setRevLoading] = useState(true);

  useEffect(() => {
  let active = true;

  async function loadCoachProfile() {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from(TABLES.coachProfiles)
        .select(
          "display_name, city, bio, hourly_rate_cents, phone, specialties, levels, is_published"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Erreur Supabase profil coach :", error);
        throw error;
      }

      if (!active) return;

      if (!data) {
        setDraft(EMPTY_DRAFT);
        return;
      }

      setDraft({
        display_name: String(data.display_name ?? ""),
        city: String(data.city ?? ""),
        bio: String(data.bio ?? ""),
        hourly_rate: centsToEuros(
          typeof data.hourly_rate_cents === "number"
            ? data.hourly_rate_cents
            : null
        ),
        phone: String(data.phone ?? ""),
        specialtiesText: toList(data.specialties).join("\n"),
        levels: toList(data.levels),
        is_published: Boolean(data.is_published),
      });
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null
            ? JSON.stringify(e)
            : String(e);

      console.error("Erreur chargement profil coach :", message, e);

      if (active) {
        setDraft(EMPTY_DRAFT);
      }
    } finally {
      if (active) {
        setLoading(false);
      }
    }
  }

  loadCoachProfile();

  return () => {
    active = false;
  };
}, [userId]);

  useEffect(() => {
  let active = true;

  async function loadCoachRevenus() {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from(TABLES.revenus)
        .select("id, label, amount_cents, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erreur Supabase revenus coach :", error);
        throw error;
      }

      if (!active) return;

      setRevenus((data as Revenu[]) ?? []);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null
            ? JSON.stringify(e)
            : String(e);

      console.error("Erreur chargement revenus coach :", message, e);

      if (active) {
        setRevenus([]);
      }
    } finally {
      if (active) {
        setRevLoading(false);
      }
    }
  }

  loadCoachRevenus();

  return () => {
    active = false;
  };
}, [userId]);

  const setField = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const toggleLevel = (lvl: string) =>
    setDraft((d) => ({
      ...d,
      levels: d.levels.includes(lvl)
        ? d.levels.filter((l) => l !== lvl)
        : [...d.levels, lvl],
    }));

  const save = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const supabase = createClient();

      const payload = {
        user_id: userId,
        display_name: draft.display_name.trim() || null,
        city: draft.city.trim() || null,
        bio: draft.bio.trim() || null,
        hourly_rate_cents: eurosToCents(draft.hourly_rate),
        phone: draft.phone.trim() || null,
        specialties: draft.specialtiesText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
        levels: draft.levels,
        is_published: draft.is_published,
      };

      const { error } = await supabase
        .from(TABLES.coachProfiles)
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      window.alert(
        "Erreur d'enregistrement : " +
          (e instanceof Error ? e.message : "inconnue")
      );
    } finally {
      setSaving(false);
    }
  };

  const totalCents = useMemo(
    () => revenus.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    [revenus]
  );

  const monthCents = useMemo(() => {
    const now = new Date();

    return revenus.reduce((s, r) => {
      if (!r.created_at) return s;

      const d = new Date(r.created_at);

      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      ) {
        return s + (r.amount_cents ?? 0);
      }

      return s;
    }, 0);
  }, [revenus]);

  return (
    <section>
      <h2 className="acc-h2">⚡ Mon Profil Coach Individuel</h2>

      {loading && <p className="muted">Chargement…</p>}

      {!loading && (
        <form className="acc-form" onSubmit={(e) => e.preventDefault()}>
          <div className="row">
            <label>Nom affiché</label>
            <input
              type="text"
              value={draft.display_name}
              onChange={(e) => setField({ display_name: e.target.value })}
            />
          </div>

          <div className="row">
            <label>Ville</label>
            <input
              type="text"
              value={draft.city}
              onChange={(e) => setField({ city: e.target.value })}
            />
          </div>

          <div className="row">
            <label>Téléphone</label>
            <input
              type="tel"
              value={draft.phone}
              placeholder="00.00.00.00.00"
              onChange={(e) => setField({ phone: e.target.value })}
            />
          </div>

          <div className="row">
            <label>Tarif horaire (€)</label>
            <input
              type="text"
              inputMode="decimal"
              value={draft.hourly_rate}
              onChange={(e) => setField({ hourly_rate: e.target.value })}
            />
          </div>

          <div className="row row--top">
            <label>Présentation</label>
            <textarea
              rows={4}
              value={draft.bio}
              onChange={(e) => setField({ bio: e.target.value })}
            />
          </div>

          <div className="row row--top">
            <label>Spécialités (une par ligne)</label>
            <textarea
              rows={4}
              value={draft.specialtiesText}
              placeholder={"Shoot\nDéfense\nPréparation physique"}
              onChange={(e) => setField({ specialtiesText: e.target.value })}
            />
          </div>

          <div className="row row--top">
            <label>Catégories encadrées</label>

            <div className="cat-grid">
              {LEVELS.map((lvl) => (
                <label key={lvl} className="cat">
                  <input
                    type="checkbox"
                    checked={draft.levels.includes(lvl)}
                    onChange={() => toggleLevel(lvl)}
                  />
                  {lvl}
                </label>
              ))}
            </div>
          </div>

          <div className="row">
            <label>Profil visible</label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.is_published}
                onChange={(e) => setField({ is_published: e.target.checked })}
              />
              Publier mon profil coach
            </label>
          </div>

          <div className="save">
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={save}
            >
              {saving ? "Enregistrement…" : "Sauvegarder"}
            </button>

            {saved && <span className="ok">✓ Enregistré</span>}
          </div>
        </form>
      )}

      <div className="revenus">
        <h3 className="revenus__title">💰 Mes Revenus</h3>

        <div className="revenus__summary">
          <div className="kpi">
            <span className="kpi__label">Total encaissé</span>
            <span className="kpi__value">{formatEuros(totalCents)}</span>
          </div>

          <div className="kpi">
            <span className="kpi__label">Ce mois-ci</span>
            <span className="kpi__value">{formatEuros(monthCents)}</span>
          </div>
        </div>

        {revLoading && <p className="muted">Chargement des revenus…</p>}

        {!revLoading && revenus.length === 0 && (
          <p className="muted">Aucun revenu pour le moment.</p>
        )}

        {!revLoading && revenus.length > 0 && (
          <div className="table-wrap">
            <table className="rev-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Statut</th>
                  <th className="r">Montant</th>
                </tr>
              </thead>

              <tbody>
                {revenus.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.label ?? "—"}</td>
                    <td>
                      <span
                        className={`badge${
                          r.status === "paid" ? " ok" : ""
                        }`}
                      >
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td className="r strong">{formatEuros(r.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .acc-h2 {
          font-family: "Alfa Slab One", Georgia, serif;
          font-weight: 400;
          letter-spacing: 0.05em;
          font-size: 22px;
          margin: 0 0 18px;
        }

        .muted {
          color: #6f6f6f;
        }

        .acc-form {
          max-width: 620px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .row {
          display: grid;
          grid-template-columns: 180px 1fr;
          align-items: center;
          gap: 14px;
        }

        .row--top {
          align-items: start;
        }

        .row > label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #333;
          text-transform: uppercase;
        }

        input[type="text"],
        input[type="tel"],
        textarea {
          width: 100%;
          border: 1px solid #e6e6e6;
          border-radius: 8px;
          padding: 9px 11px;
          font-size: 14px;
          font-family: inherit;
          color: #0f0f12;
          background: #fff;
          box-sizing: border-box;
        }

        textarea {
          resize: vertical;
          line-height: 1.4;
        }

        input:focus,
        textarea:focus {
          outline: none;
          border-color: #6b1a2c;
          box-shadow: 0 0 0 3px rgba(107, 26, 44, 0.1);
        }

        .cat-grid {
          display: grid;
          grid-template-columns: repeat(4, auto);
          gap: 8px 16px;
          justify-content: start;
        }

        .cat,
        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 14px;
          cursor: pointer;
          user-select: none;
        }

        .cat input,
        .toggle input {
          width: 16px;
          height: 16px;
          accent-color: #6b1a2c;
          cursor: pointer;
        }

        .save {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 4px;
        }

        .btn {
          background: #6b1a2c;
          color: #fff;
          border: none;
          border-radius: 9px;
          padding: 11px 18px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
        }

        .btn:hover {
          background: #551522;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .ok {
          font-size: 13px;
          font-weight: 700;
          color: #1f8a4c;
        }

        .revenus {
          margin-top: 36px;
          padding-top: 26px;
          border-top: 2px solid #f0e6e8;
        }

        .revenus__title {
          font-family: "Alfa Slab One", Georgia, serif;
          font-weight: 400;
          letter-spacing: 0.05em;
          font-size: 18px;
          margin: 0 0 16px;
        }

        .revenus__summary {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .kpi {
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 16px 22px;
          min-width: 180px;
        }

        .kpi__label {
          display: block;
          font-size: 12px;
          color: #6f6f6f;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .kpi__value {
          display: block;
          margin-top: 6px;
          font-family: "Alfa Slab One", Georgia, serif;
          font-size: 26px;
          color: #6b1a2c;
        }

        .table-wrap {
          overflow-x: auto;
        }

        .rev-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 460px;
        }

        .rev-table th,
        .rev-table td {
          border-bottom: 1px solid #eee;
          padding: 10px 12px;
          text-align: left;
          font-size: 14px;
        }

        .rev-table th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #6f6f6f;
        }

        .rev-table .r {
          text-align: right;
        }

        .rev-table .strong {
          font-weight: 700;
        }

        .badge {
          font-size: 12px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 999px;
          background: #eee;
          color: #555;
          text-transform: capitalize;
        }

        .badge.ok {
          background: #e3f4ea;
          color: #1f8a4c;
        }

        @media (max-width: 620px) {
          .row {
            grid-template-columns: 1fr;
            gap: 6px;
          }

          .cat-grid {
            grid-template-columns: repeat(3, auto);
          }
        }
      `}</style>
    </section>
  );
}

/* ===================== 📢 MES ANNONCES (camps) ========================= */

type Annonce = {
  id: string;
  title: string | null;
  city: string | null;
  description: string | null;
  price_cents: number | null;
  date_start: string | null;
  date_end: string | null;
  status: string | null;
  created_at: string | null;

  registrations_count?: number | null;
  inscrits_count?: number | null;
};

function AnnoncesSection({ userId }: { userId: string }) {
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const supabase = createClient();

        const res = await supabase
          .from(TABLES.annonces)
          .select(
            "id, title, city, description, price_cents, date_start, date_end, status, created_at, registrations_count, inscrits_count"
          )
          .eq("user_id", userId)
          .eq("category", ANNONCE_CAMP_CATEGORY)
          .order("created_at", { ascending: false });

        if (res.error) throw res.error;

        if (active) setAnnonces((res.data as Annonce[]) ?? []);
      } catch (e) {
        console.error("Erreur chargement annonces:", e);

        if (active) setAnnonces([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const remove = async (id: string) => {
    if (!window.confirm("Supprimer définitivement cette annonce ?")) return;

    setDeletingId(id);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from(TABLES.annonces)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;

      setAnnonces((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      window.alert(
        "Erreur de suppression : " +
          (e instanceof Error ? e.message : "inconnue")
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <div className="head">
        <h2 className="acc-h2">📢 Mes Annonces</h2>

        <Link href="/annonces?action=create" className="btn">
          + Créer une annonce
        </Link>
      </div>

      {loading && <p className="muted">Chargement…</p>}

      {!loading && annonces.length === 0 && (
        <p className="muted">
          Tu n'as pas encore d'annonce. Clique sur « + Créer une annonce »
          pour en créer une.
        </p>
      )}

      {!loading && annonces.length > 0 && (
        <div className="grid">
          {annonces.map((a) => (
            <article key={a.id} className="card">
              <div className="card__top">
                <h3>{a.title ?? "Sans titre"}</h3>

                {a.status && (
                  <span
                    className={`badge${
                      a.status === "published" ? " ok" : ""
                    }`}
                  >
                    {a.status}
                  </span>
                )}
              </div>

              <p className="card__meta">
                🏕 Camp
                {a.city ? ` · ${a.city}` : ""}
                {a.date_start
                  ? ` · ${formatDate(a.date_start)}${
                      a.date_end ? " → " + formatDate(a.date_end) : ""
                    }`
                  : ""}
              </p>

              {a.description && <p className="card__desc">{a.description}</p>}

              <div className="annonce-registrations">
                👥 {(a.registrations_count ?? a.inscrits_count ?? 0)} inscrit(s)
              </div>

              <div className="card__foot">
                <span className="price">{formatEuros(a.price_cents)}</span>

                <div className="card__actions">
                  <Link href={`/annonces/${a.id}/modifier`} className="link">
                    Éditer
                  </Link>

                  <button
                    type="button"
                    className="link link--danger"
                    disabled={deletingId === a.id}
                    onClick={() => remove(a.id)}
                  >
                    {deletingId === a.id ? "…" : "Supprimer"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .acc-h2 {
          font-family: "Alfa Slab One", Georgia, serif;
          font-weight: 400;
          letter-spacing: 0.05em;
          font-size: 22px;
          margin: 0;
        }

        .muted {
          color: #6f6f6f;
        }

        .btn {
          display: inline-block;
          text-decoration: none;
          background: #6b1a2c;
          color: #fff;
          border: none;
          border-radius: 9px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn:hover {
          background: #551522;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .card {
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 18px;
          display: flex;
          flex-direction: column;
        }

        .card__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .card__top h3 {
          font-family: "Alfa Slab One", Georgia, serif;
          font-weight: 400;
          font-size: 18px;
          margin: 0;
        }

        .card__meta {
          color: #6b1a2c;
          font-weight: 600;
          font-size: 13px;
          margin: 8px 0 0;
        }

        .card__desc {
          color: #444;
          font-size: 14px;
          margin: 10px 0 0;
          flex: 1;
        }

        .annonce-registrations {
          margin-top: 0.8rem;
          display: inline-flex;
          align-items: center;
          width: max-content;
          gap: 0.35rem;
          background: #fff8ef;
          border: 1px solid #eadccc;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 0.45rem 0.75rem;
          font-weight: 900;
          font-size: 0.85rem;
        }

        .card__foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #eee;
        }

        .price {
          font-family: "Alfa Slab One", Georgia, serif;
          font-size: 18px;
          color: #0f0f12;
        }

        .card__actions {
          display: flex;
          gap: 14px;
        }

        .link {
          background: none;
          border: none;
          padding: 0;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          color: #6b1a2c;
          text-decoration: none;
          cursor: pointer;
        }

        .link:hover {
          text-decoration: underline;
        }

        .link--danger {
          color: #b3261e;
        }

        .badge {
          font-size: 12px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 999px;
          background: #eee;
          color: #555;
          text-transform: capitalize;
        }

        .badge.ok {
          background: #e3f4ea;
          color: #1f8a4c;
        }

        .subscription-card{display:grid;gap:22px}.subscription-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.subscription-content{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:24px;align-items:stretch}.subscription-visual img,.subscription-placeholder{width:100%;min-height:190px;border-radius:20px;object-fit:cover}.subscription-placeholder{display:flex;flex-direction:column;justify-content:flex-end;padding:24px;background:linear-gradient(135deg,#111,#6B1A2C);color:#fff;box-shadow:inset 0 0 0 1px rgba(212,162,76,.45)}.subscription-placeholder span{font-size:.78rem;letter-spacing:.22em;color:#D4A24C}.subscription-placeholder strong{font-family:"Alfa Slab One",serif;font-size:2rem}.subscription-details{display:grid;align-content:center;gap:12px}.subscription-details p{display:flex;justify-content:space-between;gap:18px;margin:0;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.1)}.subscription-details span{opacity:.7}@media(max-width:760px){.subscription-head{display:grid}.subscription-content{grid-template-columns:1fr}}
      `}
</style>
    </section>
  );
}

function MatchForm({
  onSave,
  onClose,
}: {
  onSave: (match: TeamMatch) => void;
  onClose: () => void;
}) {
  const [match, setMatch] = useState<TeamMatch>({
    id: '',
    kind: 'Match',
    date: '',
    heure: '',
    adversaire: '',
    domicile: true,
  });

  return (
    <div className="tl-modal-bg" onClick={onClose}>
      <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Match / Entraînement</h3>

        <div className="tl-fields">
          <label>
            Type
            <select value={match.kind} onChange={(e) => setMatch({ ...match, kind: e.target.value as TeamMatch['kind'] })}>
              <option>Match</option>
              <option>Entraînement</option>
            </select>
          </label>

          <label>
            Date
            <input value={match.date} onChange={(e) => setMatch({ ...match, date: e.target.value })} placeholder="30/05/2026" />
          </label>

          <label>
            Heure
            <input value={match.heure} onChange={(e) => setMatch({ ...match, heure: e.target.value })} placeholder="15:30" />
          </label>

          {match.kind === 'Match' && (
            <label>
              Adversaire
              <input value={match.adversaire} onChange={(e) => setMatch({ ...match, adversaire: e.target.value })} placeholder="Massy" />
            </label>
          )}
        </div>

        <div className="tl-modal-actions">
          <button type="button" onClick={onClose}>Annuler</button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!match.date.trim()) {
                alert('La date est obligatoire.');
                return;
              }
              onSave(match);
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
function PlaybookCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("U18");
  const [season, setSeason] = useState("2026-2027");
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!title.trim()) {
      alert("Nom obligatoire");
      return;
    }

    try {
      setLoading(true);

      const created = await createPlaybookDb({
        title: title.trim(),
        description: "",
        category,
        season,
      });

      onCreated(created.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur création playbook";
      console.error("Erreur création playbook:", e);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tl-modal-bg" onClick={onClose}>
      <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Créer un playbook</h3>

        <div className="tl-fields">
          <label>
            Nom du playbook
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Paris Basketball"
            />
          </label>

          <label>
            Catégorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>U13</option>
              <option>U15</option>
              <option>U18</option>
              <option>U21</option>
              <option>Seniors</option>
            </select>
          </label>

          <label>
            Saison
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option>2025-2026</option>
              <option>2026-2027</option>
              <option>2027-2028</option>
              <option>2028-2029</option>
            </select>
          </label>
        </div>

        <div className="tl-modal-actions">
          <button onClick={onClose}>
            Annuler
          </button>

          <button
            className="primary"
            onClick={create}
            disabled={loading}
          >
            {loading ? "Création..." : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700;800;900&family=Roboto:wght@400;500;700;800;900&display=swap');

.mc{font-family:'Roboto',system-ui,sans-serif;background:#fff;min-height:100vh;color:#0F0F12}
.mc *{box-sizing:border-box}
.mc a{text-decoration:none;color:inherit}
.mc button{font-family:inherit;cursor:pointer}
.mc img{display:block;max-width:100%}
.mc-loading{padding:4rem;text-align:center;color:#888}

.mc-profilehead{display:flex;align-items:center;gap:1.6rem;padding:1.6rem 1.6rem .4rem;flex-wrap:wrap}
.mc-retour{border:2px solid #6B1A2C;color:#6B1A2C;background:#fff;border-radius:999px;padding:.5rem 1.1rem;font-weight:800;font-size:.95rem}
.mc-retour:hover{background:#6B1A2C;color:#fff}
.mc-avatar-round{width:135px;height:135px;border-radius:50%;overflow:hidden;background:#6B1A2C;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:2.4rem;flex:0 0 auto;border:1px solid #ddd}
.mc-avatar-round img{width:100%;height:100%;object-fit:cover}
.mc-profilehead-info{flex:1;min-width:240px}
.mc-profilehead-info h1{font-family:'Oswald',sans-serif;font-size:2rem;font-weight:900;margin:0}
.mc-club-line{display:flex;align-items:center;gap:.5rem;color:#6B1A2C;font-weight:800;margin:.3rem 0}
.mc-club-line img{width:28px;height:28px;border-radius:6px;object-fit:cover;flex:0 0 auto}
.mc-line.strong{font-weight:800;margin:.15rem 0}
.mc-mail{color:#1a5fd0;font-weight:700;text-decoration:underline;display:block;margin:.15rem 0}
.mc-modifier{align-self:flex-start;border:2px solid #6B1A2C;background:#fff;color:#6B1A2C;border-radius:999px;padding:.55rem 1.1rem;font-weight:800;font-size:.9rem}
.mc-modifier:hover{background:#6B1A2C;color:#fff}
.mc-hr{height:3px;background:#0F0F12;margin:1rem 1.6rem 0}

.mc-body{
  display:grid;
  grid-template-columns:280px minmax(0,1fr);
  gap:2rem;
  max-width:1500px;
  margin:0 auto;
  padding:1.6rem;
}

.mc-side{display:flex;flex-direction:column;gap:.3rem}
.mc-side-item{display:flex;align-items:center;gap:.7rem;width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:10px;padding:.6rem .8rem;font-size:1.05rem;font-weight:600;color:#0F0F12}
.mc-side-item span{width:24px;text-align:center}
.mc-side-item:hover{background:#FAF6F2}
.mc-side-item.on{border-color:#0F0F12;font-weight:800}
.mc-side-item.admin{color:#D4A24C;font-weight:900}

.mc-content{
  min-height:50vh;
  min-width:0;
  width:100%;
  overflow:hidden;
}

.mc-form{display:flex;flex-direction:column}
.mc-row{display:grid;grid-template-columns:210px minmax(0,1fr);gap:1.6rem;align-items:center;margin-bottom:1.1rem}
.mc-row.top{align-items:flex-start}
.mc-row .k{font-weight:900;text-transform:uppercase;font-size:1rem;letter-spacing:.02em}
.mc-row .f{min-width:0}
.pill{width:100%;max-width:1050px;background:#d6d6d6;border:none;border-radius:26px;padding:.85rem 1.3rem;font-size:1rem;font-family:inherit;color:#222}
.pill:focus{outline:2px solid #6B1A2C}
.pill:disabled{color:#555}
.mc-photo,.mc-logo{position:relative;width:160px;height:160px;border-radius:14px;overflow:hidden;background:#cfcfcf;display:flex;align-items:center;justify-content:center;cursor:pointer}
.mc-photo .ph,.mc-logo .ph{font-size:2rem;color:#888}
.mc-photo img,.mc-logo img{width:100%;height:100%;object-fit:cover}
.mc-plus{position:absolute;bottom:8px;right:8px;width:30px;height:30px;border-radius:50%;background:#0F0F12;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.mc-cats{display:grid;grid-template-columns:1fr 1fr;gap:.7rem 3rem;max-width:560px}
.mc-cat{display:flex;align-items:center;gap:.6rem;font-size:1.1rem;font-weight:500}
.mc-cat input{width:18px;height:18px;accent-color:#6B1A2C}
.mc-save-row{display:flex;justify-content:flex-end;max-width:1280px;margin-top:.6rem}
.mc-save{background:#0F0F12;color:#fff;border:none;border-radius:999px;padding:.7rem 1.8rem;font-weight:800;font-size:1rem}
.mc-save:hover{background:#000}
.mc-soft{color:#555}
.mc-soft h2{color:#6B1A2C;font-weight:900;margin-bottom:.5rem}
.mc-toast{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%);background:#0F0F12;color:#fff;padding:.6rem 1.1rem;border-radius:10px;font-weight:600;font-size:.9rem;z-index:5000;box-shadow:0 8px 24px rgba(0,0,0,.3)}

.mc-management{
  width:100%;
  min-width:0;
}

.mc-management-header h2{
  color:#6B1A2C;
  font-size:2rem;
  font-weight:900;
  margin:0 0 .4rem;
}

.mc-management-header p{
  color:#7c7470;
  margin:0 0 1rem;
}

.mc-management-tabs{
  display:flex;
  align-items:center;
  gap:.55rem;
  flex-wrap:wrap;
  margin:1rem 0 1.2rem;
}

.mc-management-tabs button{
  border:1px solid #efe6db;
  background:#fff;
  color:#6B1A2C;
  border-radius:10px;
  padding:.75rem 1rem;
  font-weight:900;
  box-shadow:0 8px 20px rgba(60,30,20,.06);
}

.mc-management-tabs button:hover{
  border-color:#D4A24C;
  background:#fff8ef;
}

.mc-management-tabs button.on{
  background:#6B1A2C;
  color:#fff;
  border-color:#6B1A2C;
}

.mc-management-content{
  width:100%;
  min-width:0;
  overflow-x:auto;
  overflow-y:visible;
  padding-bottom:1rem;
}

.mc-management-content .rot-root{
  min-width:980px;
}

.mc-management-content .rot-layout{
  grid-template-columns:minmax(720px,1fr) 220px;
}

.mc-module-empty{
  background:#fff8ef;
  border:1px dashed #D4A24C;
  border-radius:14px;
  padding:1.5rem;
  color:#6B1A2C;
  font-weight:900;
}

.mc-management-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem;margin-top:1rem;max-width:860px}
.mc-management-grid button{border:1px solid #efe6db;background:#fff;border-radius:14px;padding:1rem;text-align:left;font-weight:900;color:#6B1A2C;box-shadow:0 6px 18px rgba(60,30,20,.06)}
.mc-management-grid button:hover{background:#fff8ed;border-color:#D4A24C}

.mc-equipes-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.2rem}
.mc-equipes-head h2{font-family:'Oswald',sans-serif;font-size:2rem;text-transform:uppercase;margin:0;color:#0F0F12}
.mc-equipes-head p{margin:.25rem 0 0;color:#8a7b73;font-weight:500}
.mc-new-team{background:#FBE9D0;color:#9a5a1a;border:none;border-radius:10px;padding:.65rem 1rem;font-weight:900}
.mc-teamgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:1.4rem}
.mc-teamcard{background:#fff;border:1px solid #efe6db;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(60,30,20,.07)}
.mc-team-banner{height:180px;background:linear-gradient(135deg,#2a1418,#6B1A2C);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2.4rem}
.mc-team-banner img{width:100%;height:100%;object-fit:cover}
.mc-team-body{padding:1rem}
.mc-team-title{display:flex;align-items:center;gap:.75rem;margin-bottom:.9rem}
.mc-team-logo{width:44px;height:44px;border-radius:11px;background:#6B1A2C;color:#D4A24C;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto}
.mc-team-logo img{width:100%;height:100%;object-fit:cover}
.mc-team-title h3{font-family:'Oswald',sans-serif;text-transform:uppercase;margin:0;font-size:1.25rem;color:#0F0F12}
.mc-team-title p{margin:.15rem 0 0;color:#8a7b73;font-size:.86rem;font-weight:700}
.mc-playerchips{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:1rem}
.mc-playerchips button{border:none;background:#fff;text-align:left;display:flex;align-items:center;gap:.35rem;font-size:.8rem;font-weight:700;min-width:0}
.mc-playerchips button span{width:25px;height:25px;border-radius:50%;background:#191919;color:#D4A24C;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto;font-size:.7rem}
.mc-playerchips img{width:100%;height:100%;object-fit:cover}
.mc-matches{background:#fff8ed;border:1px solid #f0e2cf;border-radius:13px;padding:.7rem;margin-bottom:1rem}
.mc-matches-title{text-transform:uppercase;color:#9a5a1a;font-size:.72rem;font-weight:900;letter-spacing:.04em;margin-bottom:.4rem}
.mc-match{display:flex;align-items:center;gap:.35rem;font-size:.82rem;padding:.2rem 0}
.mc-match strong{font-weight:900}
.mc-match em{font-style:normal;color:#8a7b73}
.mc-match button{margin-left:auto;border:none;background:none}
.mc-team-actions{display:flex;flex-wrap:wrap;gap:.45rem}
.mc-team-actions button{border:1px solid #efe6db;background:#fff;border-radius:9px;padding:.48rem .75rem;font-weight:900;font-size:.8rem}
.mc-team-actions button.main{background:#6B1A2C;color:#fff;border-color:#6B1A2C}
.mc-team-actions button.danger{background:#c5283d;color:#fff;border-color:#c5283d;margin-left:auto}

.tl-modal-bg,.mbk-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:5000;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow:auto}
.tl-modal,.mbk-modal{background:#fff;color:#111;border-radius:18px;width:100%;max-width:640px;padding:1.5rem;box-shadow:0 20px 70px rgba(0,0,0,.3)}
.tl-modal h3,.mbk-modal h3{font-family:'Oswald',sans-serif;text-transform:uppercase;margin:0 0 1rem;color:#6B1A2C}
.tl-fields,.mbk-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.tl-fields label,.mbk-field{display:flex;flex-direction:column;gap:.25rem;font-size:.75rem;text-transform:uppercase;font-weight:900;color:#6b625d}
.tl-fields input,.tl-fields select,.mbk-field input,.mbk-field select,.mbk-field textarea{border:1px solid #ddd;border-radius:9px;padding:.6rem;background:#fff;color:#111}
.tl-modal-actions,.mbk-modal-actions{display:flex;justify-content:flex-end;gap:.7rem;margin-top:1rem}
.tl-modal-actions button,.mbk-modal-actions button{border:1px solid #ddd;background:#fff;border-radius:10px;padding:.6rem 1rem;font-weight:900}
.tl-modal-actions .primary,.mbk-btn-orange{background:#6B1A2C!important;color:#fff!important;border-color:#6B1A2C!important}
.mbk-btn-ghost{background:#fff!important;color:#6B1A2C!important;border:1px solid #6B1A2C!important}

@media (max-width:1200px){
  .mc-management-content .rot-root{
    min-width:900px;
  }
}

@media (max-width:900px){
  .mc-body{grid-template-columns:1fr}
  .mc-row{grid-template-columns:1fr;gap:.4rem}
  .mc-profilehead-info h1{font-size:1.5rem}
  .mc-teamgrid{grid-template-columns:1fr}
  .mc-management-content{
    overflow-x:auto;
  }
  .mc-management-content .rot-root{
    min-width:900px;
  }
}
  .mc-live-launch{
  background:#fff;
  border:1px solid #efe6db;
  border-radius:20px;
  padding:2rem;
  text-align:center;
  box-shadow:0 10px 30px rgba(60,30,20,.08);
  max-width:700px;
  margin:2rem auto;
}

.mc-live-icon{
  font-size:4rem;
  margin-bottom:1rem;
}

.mc-live-launch h3{
  margin:0 0 .75rem;
  color:#6B1A2C;
  font-size:2rem;
  font-weight:900;
  font-family:'Oswald',sans-serif;
}

.mc-live-launch p{
  color:#7c7470;
  font-size:1rem;
  line-height:1.6;
  margin:0 auto 1.5rem;
  max-width:520px;
}

.mc-live-btn{
  background:#6B1A2C;
  color:#fff;
  border:none;
  border-radius:12px;
  padding:1rem 2rem;
  font-size:1rem;
  font-weight:900;
  transition:.2s;
}

.mc-live-btn:hover{
  background:#4f1020;
  transform:translateY(-2px);
  box-shadow:0 10px 24px rgba(107,26,44,.25);
}
  

/* Bouton abonnement - style global pour surpasser .mc a */
.mc .sub-card__actions {
  margin-top: 24px;
}

.mc .sub-card .change-plan-btn,
.mc .empty .change-plan-btn {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  margin-top: 6px;
  background: #6b1a2c !important;
  color: #ffffff !important;
  border: none;
  border-radius: 12px;
  padding: 14px 18px;
  text-decoration: none !important;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mc .sub-card .change-plan-btn:hover,
.mc .empty .change-plan-btn:hover {
  background: #551522 !important;
  color: #ffffff !important;
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(107, 26, 44, 0.25);
}

`;
