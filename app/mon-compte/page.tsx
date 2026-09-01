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
import ScoutTeamsManager from '@/components/equipes/ScoutTeamsManager';
import type { Player, Team } from '@/types/player';
import GamePlanModule from "@/components/management/GamePlanModule";
import GestionAdminModule from "@/components/management/GestionAdminModule";
import VideoMatchFolderModule from "@/components/management/VideoMatchFolderModule";


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
  { key: 'institutionnel', label: 'Institutionnel', icon: '🏛️', href: '/institutionnel' },
  { key: 'management', label: 'Management', icon: '📊' },
];

const fmtDate = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};

const displayBirthdate = (v: string | null | undefined) => {
  const value = String(v ?? "").trim();
  if (!value) return "";

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  return fmtDate(value);
};

const birthdateForSupabase = (v: string) => {
  const value = v.trim();
  if (!value) return null;

  const fr = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;

  return value;
};

const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 10);
  return d.replace(/(\d{2})(?=\d)/g, '$1.');
};

export default function MonComptePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

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
  const [teamsView, setTeamsView] = useState<"coached" | "scout">("coached");
  const [teamForm, setTeamForm] = useState<{ open: boolean; team?: Team }>({ open: false });
  const [playerFor, setPlayerFor] = useState<string | null>(null);
  const [teamCalendarMatchCounts, setTeamCalendarMatchCounts] = useState<Record<string, number>>({});
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

  useEffect(() => {
    if (searchParams.get("teamType") === "scout" || searchParams.get("createScout") === "1") {
      setTeamsView("scout");
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

      // La carte "Mes équipes" compte uniquement les matchs encore présents
      // dans match_stats. Un ancien calendar_event peut rester après suppression
      // et ne doit jamais gonfler le compteur.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || data.length === 0) {
        setTeamCalendarMatchCounts({});
        return;
      }

      const teamIds = Array.from(
        new Set(
          data
            .flatMap((team) => [
              String(team.id || ""),
              String((team as any).supabaseTeamId || ""),
              String((team as any).supabase_team_id || ""),
            ])
            .filter(Boolean),
        ),
      );

      const { data: matchRows, error: matchError } = await supabase
        .from("match_stats")
        .select("team_id,id")
        .in("team_id", teamIds);

      if (matchError) {
        console.error("Erreur chargement matchs Supabase:", matchError);
        setTeamCalendarMatchCounts({});
        return;
      }

      const counts: Record<string, number> = (matchRows ?? []).reduce(
        (
          acc: Record<string, number>,
          row: { team_id?: string | null; id?: string | null },
        ) => {
          const rowTeamId = String(row.team_id || "");
          if (rowTeamId) acc[rowTeamId] = (acc[rowTeamId] || 0) + 1;
          return acc;
        },
        {},
      );

      const normalizedCounts: Record<string, number> = {};
      data.forEach((team) => {
        const aliases = [
          String(team.id || ""),
          String((team as any).supabaseTeamId || ""),
          String((team as any).supabase_team_id || ""),
        ].filter(Boolean);

        const count = aliases.reduce(
          (max, alias) => Math.max(max, counts[alias] || 0),
          0,
        );

        aliases.forEach((alias) => {
          normalizedCounts[alias] = count;
        });
      });

      setTeamCalendarMatchCounts(normalizedCounts);
    } catch (error) {
      console.error("Erreur chargement équipes:", error);
      setTeams([]);
      setTeamCalendarMatchCounts({});
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

    const local = blank();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "display_name, first_name, last_name, club, avatar_url, club_logo_url, phone, birthdate, category, platform_role"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Erreur chargement profil :", profileError);
    }

    const userIsAdmin =
      profile?.platform_role === "ceo" ||
      profile?.platform_role === "superadmin" ||
      profile?.platform_role === "admin";

    setIsAdmin(userIsAdmin);

    let subscriptionLabel = userIsAdmin ? "Accès total CEO" : "Aucun";
    let userHasClubSubscription = userIsAdmin;

    // Abonnement et droits sont indépendants : chargement en parallèle pour
    // éviter deux attentes réseau successives à chaque ouverture de Mon Compte.
    const [effectiveSubscriptionResult, accessResult] = await Promise.allSettled([
      fetch("/api/account/subscription", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/access", { cache: "no-store" }).then((res) => res.json()),
    ]);

    if (effectiveSubscriptionResult.status === "fulfilled") {
      const effectiveSubscription = effectiveSubscriptionResult.value;

      if (!userIsAdmin && effectiveSubscription?.active === true) {
        subscriptionLabel =
          effectiveSubscription?.plan?.name ||
          effectiveSubscription?.plan?.slug ||
          "Abonnement actif";
      }

      const effectivePlan = effectiveSubscription?.plan;
      const planSlug = String(effectivePlan?.slug || "")
        .toLowerCase()
        .replace(/_/g, "-");

      userHasClubSubscription =
        effectivePlan?.target === "club" ||
        ["club-bronze", "club-silver", "club-gold"].includes(planSlug) ||
        String(effectivePlan?.name || "").toLowerCase().includes("club");
    } else {
      console.error("Erreur chargement abonnement effectif :", effectiveSubscriptionResult.reason);
    }

    setHasClubSubscription(userIsAdmin || userHasClubSubscription);

    if (accessResult.status === "fulfilled") {
      setAccessMap(accessResult.value || {});
    } else {
      console.error("Erreur chargement droits :", accessResult.reason);
      setAccessMap({});
    }

    const dn = (profile?.display_name || "").trim();
    const displayParts = dn.split(" ").filter(Boolean);

    setForm({
      ...local,
      firstName:
        profile?.first_name ||
        displayParts[0] ||
        "",
      lastName:
        profile?.last_name ||
        displayParts.slice(1).join(" ") ||
        "",
      birthdate: displayBirthdate(profile?.birthdate),
      phone: profile?.phone || "",
      club: profile?.club || "",
      category: profile?.category || "",
      photo: profile?.avatar_url || "",
      logo: profile?.club_logo_url || "",
      subscription: subscriptionLabel,
    });

    await Promise.all([reloadTeams(), reloadPlaybooks()]);

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
    if (!uid) return;

    const display = `${form.firstName} ${form.lastName}`.trim();

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: display || null,
          first_name: form.firstName.trim() || null,
          last_name: form.lastName.trim() || null,
          birthdate: birthdateForSupabase(form.birthdate),
          phone: form.phone.trim() || null,
          club: form.club.trim() || null,
          category: form.category.trim() || null,
          avatar_url: form.photo || null,
          club_logo_url: form.logo || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", uid);

      if (error) {
        console.error("Erreur sauvegarde profil Supabase :", error);
        throw error;
      }

      showToast("Modifications enregistrées ✓");
    } catch (error) {
      console.error("Erreur sauvegarde profil :", error);
      alert(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer les modifications du profil."
      );
    }
  };

  const handleTeamSave = async (team: Team) => {
    try {
      const savedTeam = await saveTeam(team);
      setTeamForm({ open: false });

      // Affichage immédiat : l'utilisateur voit son équipe dès le retour de
      // l'INSERT Supabase, sans dépendre d'une seconde requête de rechargement.
      setTeams((current) => {
        const withoutSaved = current.filter((item) => String(item.id) !== String(savedTeam.id));
        return [savedTeam, ...withoutSaved];
      });

      // Puis synchronisation complète (joueurs, matchs, stats, collaborations).
      void reloadTeams();
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
      showToast("Joueur ajouté ✓");
    } catch (error) {
      console.error("Erreur enregistrement joueur:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Erreur pendant l'enregistrement du joueur.";

      alert(message);
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

const visibleMenu = MENU.filter((item) => {
  if (item.key === "institutionnel") {
    return isAdmin || accessMap.institutionnel === true;
  }
  return true;
});

const hasSharedTeams = teams.some((team) => team.isShared === true);
const hasSharedSessions = teams.some(
  (team) =>
    team.isShared === true &&
    team.collaborationPermissions?.sessions === true,
);
const hasSharedLiveStats = teams.some(
  (team) =>
    team.isShared === true &&
    team.collaborationPermissions?.livestats === true,
);

const collaborationRoleInfo = (roleValue: unknown) => {
  const role = String(roleValue || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    [
      "head coach",
      "coach principal",
      "entraineur principal",
      "entraîneur principal",
    ].includes(role)
  ) {
    return { initials: "CP", label: "Coach principal", priority: 0 };
  }

  if (
    [
      "manager",
      "responsable",
      "responsable equipe",
      "responsable de l equipe",
    ].includes(role)
  ) {
    return { initials: "RE", label: "Responsable", priority: 1 };
  }

  if (
    [
      "assistant",
      "assistant coach",
      "coach assistant",
      "entraineur assistant",
    ].includes(role)
  ) {
    return { initials: "AC", label: "Assistant Coach", priority: 2 };
  }

  if (
    [
      "physical coach",
      "physical_coach",
      "preparateur physique",
      "prepa physique",
    ].includes(role)
  ) {
    return { initials: "PP", label: "Préparateur physique", priority: 3 };
  }

  if (
    [
      "analyst",
      "analyste",
      "analyste video",
      "video analyst",
    ].includes(role)
  ) {
    return { initials: "AV", label: "Analyste vidéo", priority: 4 };
  }

  if (["kine", "kinesitherapeute"].includes(role)) {
    return { initials: "K", label: "Kiné", priority: 5 };
  }

  if (["viewer", "observateur", "lecture seule"].includes(role)) {
    return { initials: "OB", label: "Observateur", priority: 7 };
  }

  return {
    initials: "CO",
    label: String(roleValue || "Collaborateur"),
    priority: 6,
  };
};

const isScoutTeam = (team: Team) => {
  const type = String((team as any).teamType ?? (team as any).team_type ?? "").toLowerCase();
  return (team as any).isScoutTeam === true || (team as any).scout === true || type === "scout" || type === "scouting" || type === "scouted";
};

const getTeamCoachName = (team: Team) => {
  const direct = [
    team.entraineurPrincipal,
    team.coach,
    (team as any).coach_name,
    (team as any).headCoach,
    (team as any).head_coach,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (direct) return direct;

  const staff = Array.isArray(team.staff) ? team.staff : [];
  const normalizeRole = (value: unknown) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const head =
    staff.find((member) => {
      const role = normalizeRole(member.role);
      return (
        role.includes("entraineur principal") ||
        role.includes("head coach") ||
        role.includes("coach principal")
      );
    }) ||
    staff.find((member) => {
      const role = normalizeRole(member.role);
      return role.includes("entraineur") || role.includes("coach");
    }) ||
    staff.find((member) => normalizeRole(member.role).includes("responsable"));

  if (!head) return "Non renseigné";
  return `${head.prenom || ""} ${head.nom || ""}`.trim() || "Non renseigné";
};
const coachedTeams = teams.filter((team) => !isScoutTeam(team));

const sortedTeams = [...coachedTeams].sort((a, b) => {
  // Priorité absolue aux équipes dont l'utilisateur est propriétaire / coach principal.
  if (a.isShared !== b.isShared) return a.isShared ? 1 : -1;

  // Pour les collaborations : ordre de responsabilité.
  if (a.isShared && b.isShared) {
    const aRole = getCollaborationRoleInfo(a.collaborationRole);
    const bRole = getCollaborationRoleInfo(b.collaborationRole);

    if (aRole.priority !== bRole.priority) {
      return aRole.priority - bRole.priority;
    }
  }

  return String(a.cat || a.categorieLabel || a.name || "").localeCompare(
    String(b.cat || b.categorieLabel || b.name || ""),
    "fr",
  );
});

const menuAccessKey: Record<string, string | null> = {
  profil: null,
  abonnement: null,
  messagerie: "messagerie",
  calendrier: "calendrier",
  exercices: "exercices",
  playbooks: "playbooks",
  profilcoach: "coach_space",
  annonces: "annonces",
  papiers: "documents",
  equipes: "equipes",
  management: "management",
  institutionnel: "institutionnel",
  club: "club_space",
};

function canOpenMenuItem(item: MenuItem) {
  // Le calendrier personnel appartient au compte : il ne doit jamais renvoyer
  // un utilisateur connecté vers /abonnements. Les droits d'équipe restent
  // contrôlés à l'intérieur du calendrier pour les collaborations.
  if (item.key === "profil" || item.key === "abonnement" || item.key === "calendrier") return true;

  if (item.key === "equipes" && hasSharedTeams) return true;
  if (item.key === "calendrier" && hasSharedSessions) return true;
  if (item.key === "management" && hasSharedLiveStats) return true;

  const accessKey = menuAccessKey[item.key];
  if (!accessKey) return true;

  return accessMap[accessKey] === true;
}

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
              <Link
                key={item.key}
                href={canOpenMenuItem(item) ? item.href : "/abonnements"}
                className="mc-side-item"
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                className={'mc-side-item' + (active === item.key ? ' on' : '')}
                onClick={() => {
                  if (!canOpenMenuItem(item)) {
                    router.push("/abonnements");
                    return;
                  }
                  setActive(item.key);
                }}
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
                  <p>{teamsView === "coached" ? "Tes équipes coachées et tes collaborations." : "Tes adversaires observés pour préparer les prochains matchs."}</p>
                </div>
                {teamsView === "coached" && (
                  <button className="mc-new-team" onClick={() => {
                    if (!accessMap.equipes) { router.push("/abonnements"); return; }
                    setTeamForm({ open: true });
                  }}>+ Nouvelle équipe</button>
                )}
              </div>

              <div className="mc-equipes-tabs">
                <button type="button" className={teamsView === "coached" ? "active" : ""} onClick={() => setTeamsView("coached")}>🏀 Mes équipes</button>
                <button type="button" className={teamsView === "scout" ? "active" : ""} onClick={() => setTeamsView("scout")}>👁 Équipes scoutées</button>
              </div>

              {teamsView === "scout" ? (
                <ScoutTeamsManager teams={teams} onReload={reloadTeams} />
              ) : (
              <div className="mc-teamgrid">
                {sortedTeams.map((team, teamIndex) => {
                  const bandColor = team.couleurs?.[0] || '#6B1A2C';
                  const category = team.cat || team.categorieLabel || 'Équipe';
                  const level = team.niveau || 'Niveau non renseigné';
                  const coach = getTeamCoachName(team);
                  const matchCount = teamCalendarMatchCounts[String(team.id)] || 0;
                  const wins = team.teamStats?.wins ?? team.kpi?.victoires ?? 0;
                  const losses = team.teamStats?.losses ?? team.kpi?.defaites ?? 0;
                  const roleInfo = getCollaborationRoleInfo(team.collaborationRole);

                  const showPrincipalTitle =
                    !team.isShared &&
                    (teamIndex === 0 || sortedTeams[teamIndex - 1]?.isShared === true);

                  const showCollaborationTitle =
                    team.isShared &&
                    (teamIndex === 0 || sortedTeams[teamIndex - 1]?.isShared !== true);

                  return (
                    <div key={team.id} className="mc-team-group-item">
                      {showPrincipalTitle && (
                        <div className="mc-team-section-title">
                          <strong>👑 COACH PRINCIPAL</strong>
                          <span>Équipes dont tu es le coach principal.</span>
                        </div>
                      )}

                      {showCollaborationTitle && (
                        <div className="mc-team-section-title collaboration">
                          <strong>👥 COLLABORATEUR</strong>
                          <span>Équipes sur lesquelles tu collabores.</span>
                        </div>
                      )}

                    <article className="mc-teamcard mc-teamcard-horizontal">
                      {team.isShared && (
                        <div
                          className="mc-collaboration-role-badge"
                          title={roleInfo.label}
                          aria-label={`Rôle : ${roleInfo.label}`}
                        >
                          {roleInfo.initials}
                        </div>
                      )}
                      <div className="mc-team-banner mc-team-banner-horizontal" style={{ backgroundColor: bandColor }}>
                        <div className="mc-team-banner-lines" aria-hidden="true" />
                        <div className="mc-team-banner-logo">
                          {team.logo ? <img src={team.logo} alt="" /> : <span>🏀</span>}
                        </div>
                        <div className="mc-team-banner-copy">
                          <strong>{category}</strong>
                          <span>{level}</span>
                          {team.isShared && (
                            <em className="mc-team-shared">
                              {roleInfo.label}
                            </em>
                          )}
                        </div>
                      </div>

                      <div className="mc-team-body mc-team-body-horizontal">
                        <div className="mc-team-kpis">
                          <div className="mc-team-kpi">
                            <span className="mc-team-kpi-icon">▣</span>
                            <div>
                              <strong>{matchCount}</strong>
                              <span>Matchs</span>
                              <small>Saison {team.season || '2025-2026'}</small>
                            </div>
                          </div>

                          <div className="mc-team-kpi">
                            <span className="mc-team-kpi-icon">♙</span>
                            <div>
                              <strong>{team.players.length}/15</strong>
                              <span>Joueurs</span>
                              <small>Effectif</small>
                            </div>
                          </div>

                          <div className="mc-team-kpi">
                            <span className="mc-team-kpi-icon">▥</span>
                            <div>
                              <strong>{wins}V - {losses}D</strong>
                              <span>Bilan</span>
                              <small>Victoires - Défaites</small>
                            </div>
                          </div>

                          <div className="mc-team-kpi mc-team-kpi-coach">
                            <span className="mc-team-kpi-icon">♙</span>
                            <div>
                              <strong>{coach}</strong>
                              <span>Coach</span>
                              <small>Entraîneur principal</small>
                            </div>
                          </div>
                        </div>

                        <div className="mc-team-actions mc-team-actions-horizontal">
                          <button className="main" onClick={() => router.push(`/equipes/${team.id}`)}>
                            Voir la page de l'équipe →
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const canEditPlayers =
                                !team.isShared ||
                                team.collaborationPermissions?.players === true;

                              if (team.isShared && !canEditPlayers) {
                                alert("Le propriétaire ne t’a pas donné accès à la gestion des joueurs.");
                                return;
                              }

                              if (!team.isShared && !accessMap.equipes) {
                                router.push("/abonnements");
                                return;
                              }

                              if (team.players.length >= 15) {
                                alert("Effectif complet : une équipe MyBasket est limitée à 15 joueurs actifs.");
                                return;
                              }

                              setPlayerFor(team.id);
                            }}
                          >
                            + Joueur
                          </button>

                          {!team.isShared && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!accessMap.equipes) {
                                    router.push("/abonnements");
                                    return;
                                  }
                                  router.push(`/equipes/${team.id}?addStaff=1#staff`);
                                }}
                              >
                                + Staff
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!accessMap.equipes) {
                                    router.push("/abonnements");
                                    return;
                                  }
                                  setTeamForm({ open: true, team });
                                }}
                              >
                                Éditer
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => handleDeleteTeam(team)}
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                    </div>
                  );
                })}
              </div>
              )}
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
{managementView === "live" && <VideoMatchFolderModule />}
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


function getCollaborationRoleInfo(roleValue: unknown) {
  const role = String(roleValue || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    [
      "head coach",
      "coach principal",
      "entraineur principal",
      "entraîneur principal",
    ].includes(role)
  ) {
    return { initials: "CP", label: "Coach principal", priority: 0 };
  }

  if (
    [
      "manager",
      "responsable",
      "responsable equipe",
      "responsable de l equipe",
    ].includes(role)
  ) {
    return { initials: "RE", label: "Responsable", priority: 1 };
  }

  if (
    [
      "assistant",
      "assistant coach",
      "coach assistant",
      "entraineur assistant",
    ].includes(role)
  ) {
    return { initials: "AC", label: "Assistant Coach", priority: 2 };
  }

  if (
    [
      "physical coach",
      "physical_coach",
      "preparateur physique",
      "prepa physique",
    ].includes(role)
  ) {
    return { initials: "PP", label: "Préparateur physique", priority: 3 };
  }

  if (
    ["analyst", "analyste", "analyste video", "video analyst"].includes(role)
  ) {
    return { initials: "AV", label: "Analyste vidéo", priority: 4 };
  }

  if (["viewer", "observateur", "lecture seule"].includes(role)) {
    return { initials: "OB", label: "Observateur", priority: 6 };
  }

  return {
    initials: "CO",
    label: String(roleValue || "Collaborateur"),
    priority: 5,
  };
}

function AbonnementSection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<
    (Plan & { image_url?: string | null; slug?: string | null }) | null
  >(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isCeo, setIsCeo] = useState(false);
  const [collaborations, setCollaborations] = useState<Team[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadSubscription() {
      const supabase = createClient();

      const { data: profile } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();

      const admin = ["ceo", "superadmin", "admin"].includes(
        profile?.platform_role || "",
      );

      if (mounted) setIsCeo(admin);

      try {
        const loadedTeams = await getTeams();
        if (mounted) {
          setCollaborations(
            (loadedTeams ?? []).filter((team) => team.isShared === true),
          );
        }
      } catch (error) {
        console.error("Erreur chargement collaborations abonnement:", error);
        if (mounted) setCollaborations([]);
      }

      if (admin) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/account/subscription", {
          cache: "no-store",
        });

        const effective = await response.json();

        if (mounted) {
          setPlan(
            effective?.active
              ? ((effective?.plan ?? null) as
                  | (Plan & { image_url?: string | null; slug?: string | null })
                  | null)
              : null,
          );

          setSubscription(
            effective?.active
              ? ({
                  plan_id: String(effective?.plan?.id || ""),
                  billing_period:
                    effective?.subscription?.billing_period ?? null,
                  status: "active",
                  current_period_end:
                    effective?.subscription?.current_period_end ?? null,
                } as Subscription)
              : null,
          );

          setLoading(false);
        }
      } catch (error) {
        console.error("Erreur chargement abonnement effectif :", error);

        if (mounted) {
          setPlan(null);
          setSubscription(null);
          setLoading(false);
        }
      }
    }

    loadSubscription();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const formatEndDate = (value: string | null | undefined) => {
    if (!value) return null;
    return new Date(value).toLocaleDateString("fr-FR");
  };

  if (loading) {
    return (
      <section className="account-card">
        <p>Chargement de l’abonnement…</p>
      </section>
    );
  }

  const planName = isCeo ? "CEO" : plan?.name || "LIBRE";
  const statusLabel = isCeo
    ? "Accès total"
    : subscription?.status === "active"
      ? "Actif"
      : "Aucun abonnement actif";

  const permissionLabels: Array<
    ["players" | "sessions" | "livestats" | "media", string]
  > = [
    ["players", "Joueurs"],
    ["sessions", "Séances & calendrier"],
    ["livestats", "LiveStats"],
    ["media", "Médias & Drive"],
  ];

  const collaborationSummary = collaborations.map((team) => {
    const roleInfo = getCollaborationRoleInfo(team.collaborationRole);
    const permissions =
      team.collaborationPermissions &&
      typeof team.collaborationPermissions === "object"
        ? team.collaborationPermissions
        : {};

    return {
      team,
      roleInfo,
      enabledPermissions: permissionLabels.filter(
        ([key]) => permissions?.[key] === true,
      ),
    };
  });

  return (
    <section className="account-card subscription-card">
      <div className="subscription-layout">
        <div className="subscription-left">
          <div className="subscription-head">
            <div>
              <p className="eyebrow">Abonnement</p>
              <h2>
                {isCeo ? "Accès CEO" : plan?.name || "Aucun abonnement actif"}
              </h2>
              <p className="muted">
                {isCeo
                  ? "Accès total à MyBasket, indépendant de tout abonnement."
                  : plan?.description ||
                    "Choisissez une formule pour débloquer vos accès."}
              </p>
            </div>

            <a className="primary-btn" href="/abonnements">
              Voir les abonnements
            </a>
          </div>

          <div className="subscription-details">
            <p>
              <span>Statut</span>
              <strong>{statusLabel}</strong>
            </p>

            {!isCeo && subscription?.billing_period && (
              <p>
                <span>Période</span>
                <strong>
                  {subscription.billing_period === "yearly"
                    ? "Annuelle"
                    : "Mensuelle"}
                </strong>
              </p>
            )}

            {!isCeo && formatEndDate(subscription?.current_period_end) && (
              <p>
                <span>Valable jusqu’au</span>
                <strong>
                  {formatEndDate(subscription?.current_period_end)}
                </strong>
              </p>
            )}
          </div>
        </div>

        <div className="subscription-visual-column">
          {plan?.image_url ? (
            <img
              className="subscription-plan-image"
              src={plan.image_url}
              alt={`Carte abonnement ${plan.name}`}
            />
          ) : (
            <div
              className="membership-card"
              aria-label={`Carte abonnement ${planName}`}
            >
              <div className="membership-glow glow-one" />
              <div className="membership-glow glow-two" />

              <div className="membership-topline">
                <span>MYBASKET</span>
                <span className="membership-chip" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>

              <div className="membership-center">
                <div className="membership-ball" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="membership-bottom">
                <div>
                  <small>ACCÈS</small>
                  <strong>{planName}</strong>
                </div>

                <div className="membership-status">
                  <small>STATUT</small>
                  <strong>{statusLabel}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="collaboration-access-section">
        <div className="collaboration-access-head">
          <div>
            <p className="eyebrow">Accès reçus</p>
            <h3>Mes collaborations</h3>
            <p className="muted">
              Ces accès sont indépendants de ton abonnement personnel. Ils sont
              définis équipe par équipe par le coach principal.
            </p>
          </div>
          <span className="collaboration-count">{collaborationSummary.length}</span>
        </div>

        {collaborationSummary.length === 0 ? (
          <div className="collaboration-empty">
            <strong>Aucune collaboration active</strong>
            <span>
              Si un coach t’invite sur une équipe, elle apparaîtra ici après acceptation.
            </span>
          </div>
        ) : (
          <div className="collaboration-list">
            {collaborationSummary.map(({ team, roleInfo, enabledPermissions }) => (
              <article className="collaboration-row" key={team.id}>
                <div className="collaboration-role-square">{roleInfo.initials}</div>

                <div className="collaboration-main">
                  <div className="collaboration-title-line">
                    <div>
                      <strong>
                        {team.cat || team.categorieLabel || team.name || "Équipe"}
                      </strong>
                      <span>{roleInfo.label}</span>
                    </div>

                    <a href={`/equipes/${team.id}`} className="collaboration-open">
                      Voir l’équipe
                    </a>
                  </div>

                  <div className="collaboration-permissions">
                    <span className="collaboration-pill base">✓ Voir l’équipe</span>

                    {enabledPermissions.map(([key, label]) => (
                      <span className="collaboration-pill" key={key}>
                        ✓ {label}
                      </span>
                    ))}

                    {enabledPermissions.length === 0 && (
                      <span className="collaboration-only-view">
                        Consultation de l’équipe uniquement
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="access-separation-note">
          <strong>Abonnement personnel ≠ collaboration</strong>
          <span>
            Ton abonnement personnel ne donne jamais automatiquement des droits
            sur l’équipe d’un autre coach. Sur une équipe partagée, seules les
            autorisations données par son coach principal s’appliquent.
          </span>
        </div>
      </div>

      <style jsx>{`
        .subscription-card {
          overflow: hidden;
          padding: 0;
        }

        .subscription-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(360px, 48%);
          min-height: 390px;
        }

        .subscription-left {
          padding: 36px 38px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 34px;
          min-width: 0;
        }

        .subscription-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }

        .subscription-head h2 {
          margin: 5px 0 10px;
          font-family: "Alfa Slab One", Georgia, serif;
          font-size: clamp(28px, 3vw, 44px);
          font-weight: 400;
          line-height: 1;
          color: #111114;
        }

        .eyebrow {
          margin: 0;
          color: #6b1a2c;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .muted {
          max-width: 560px;
          margin: 0;
          color: #777178;
          font-size: 14px;
          line-height: 1.6;
        }

        .primary-btn {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 11px 18px;
          border-radius: 10px;
          background: #6b1a2c;
          color: #fff;
          font-size: 13px;
          font-weight: 900;
          white-space: nowrap;
          transition:
            transform 0.2s ease,
            background 0.2s ease;
        }

        .primary-btn:hover {
          background: #551522;
          transform: translateY(-2px);
        }

        .subscription-details {
          display: grid;
          gap: 0;
          border-top: 1px solid #eee8ea;
        }

        .subscription-details p {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin: 0;
          padding: 17px 0;
          border-bottom: 1px solid #eee8ea;
        }

        .subscription-details span {
          color: #8a8589;
          font-size: 13px;
          font-weight: 700;
        }

        .subscription-details strong {
          color: #161318;
          font-size: 14px;
          font-weight: 900;
          text-align: right;
        }

        .subscription-visual-column {
          min-width: 0;
          padding: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(
              circle at 85% 10%,
              rgba(212, 162, 76, 0.18),
              transparent 32%
            ),
            linear-gradient(145deg, #faf8f6 0%, #f2ece7 100%);
          border-left: 1px solid #eee5df;
        }

        .subscription-plan-image {
          display: block;
          width: 100%;
          max-width: 620px;
          aspect-ratio: 1.62 / 1;
          object-fit: cover;
          border-radius: 26px;
          box-shadow: 0 28px 60px rgba(22, 15, 18, 0.22);
        }

        .membership-card {
          position: relative;
          isolation: isolate;
          width: min(100%, 620px);
          aspect-ratio: 1.62 / 1;
          overflow: hidden;
          border-radius: 28px;
          padding: 30px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          color: #fff;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.05), transparent 35%),
            linear-gradient(145deg, #070709 0%, #171116 54%, #09090b 100%);
          border: 1px solid rgba(212, 162, 76, 0.64);
          box-shadow:
            0 30px 65px rgba(18, 12, 15, 0.28),
            inset 0 0 0 1px rgba(255, 255, 255, 0.03);
          transition:
            transform 0.35s ease,
            box-shadow 0.35s ease;
        }

        .membership-card:hover {
          transform: translateY(-7px) rotateX(1deg) rotateY(-1deg);
          box-shadow:
            0 38px 76px rgba(18, 12, 15, 0.34),
            inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }

        .membership-card::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background: repeating-linear-gradient(
            115deg,
            transparent 0,
            transparent 16px,
            rgba(255, 255, 255, 0.018) 17px,
            transparent 18px
          );
          pointer-events: none;
        }

        .membership-glow {
          position: absolute;
          z-index: -1;
          border-radius: 999px;
          filter: blur(18px);
          pointer-events: none;
        }

        .glow-one {
          width: 250px;
          height: 250px;
          top: -130px;
          right: -70px;
          background: rgba(212, 162, 76, 0.28);
        }

        .glow-two {
          width: 230px;
          height: 230px;
          bottom: -150px;
          left: -90px;
          background: rgba(107, 26, 44, 0.55);
        }

        .membership-topline,
        .membership-bottom {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .membership-topline > span:first-child {
          color: #d4a24c;
          font-size: 14px;
          font-weight: 1000;
          letter-spacing: 0.24em;
        }

        .membership-chip {
          width: 45px;
          height: 34px;
          padding: 6px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3px;
          border-radius: 8px;
          background: linear-gradient(135deg, #f0cc78, #a87423);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
        }

        .membership-chip i {
          display: block;
          border-left: 1px solid rgba(50, 32, 8, 0.48);
          border-right: 1px solid rgba(255, 255, 255, 0.24);
        }

        .membership-center {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }

        .membership-ball {
          position: relative;
          width: 118px;
          height: 118px;
          opacity: 0.8;
          border: 3px solid #d4a24c;
          border-radius: 50%;
          transform: rotate(-12deg);
          box-shadow: 0 0 35px rgba(212, 162, 76, 0.14);
        }

        .membership-ball span {
          position: absolute;
          display: block;
          background: #d4a24c;
        }

        .membership-ball span:nth-child(1) {
          width: 3px;
          height: 100%;
          left: 50%;
          top: 0;
        }

        .membership-ball span:nth-child(2) {
          width: 100%;
          height: 3px;
          left: 0;
          top: 50%;
        }

        .membership-ball span:nth-child(3) {
          width: 80%;
          height: 80%;
          left: 10%;
          top: 10%;
          border: 3px solid #d4a24c;
          border-top-color: transparent;
          border-bottom-color: transparent;
          border-radius: 50%;
          background: transparent;
        }

        .membership-bottom {
          align-items: flex-end;
        }

        .membership-bottom small {
          display: block;
          margin-bottom: 5px;
          color: rgba(255, 255, 255, 0.54);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }

        .membership-bottom strong {
          display: block;
          max-width: 260px;
          color: #fff;
          font-family: "Alfa Slab One", Georgia, serif;
          font-size: clamp(24px, 3vw, 38px);
          font-weight: 400;
          line-height: 1;
          text-transform: uppercase;
        }

        .membership-status {
          text-align: right;
        }

        .membership-status strong {
          color: #d4a24c;
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }


        .collaboration-access-section {
          margin: 0 38px 34px;
          padding-top: 26px;
          border-top: 1px solid #eadfd6;
        }

        .collaboration-access-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .collaboration-access-head h3 {
          margin: 4px 0 5px;
          color: #241d1a;
          font-size: 1.25rem;
        }

        .collaboration-count {
          min-width: 36px;
          height: 36px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #6B1A2C;
          color: #fff;
          font-weight: 1000;
        }

        .collaboration-list {
          display: grid;
          gap: 11px;
        }

        .collaboration-row {
          display: flex;
          gap: 13px;
          align-items: flex-start;
          padding: 15px;
          border: 1px solid #eadfd6;
          border-radius: 16px;
          background: #fffdfb;
        }

        .collaboration-role-square {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #D4A24C;
          color: #3a2504;
          font-size: .72rem;
          font-weight: 1000;
          letter-spacing: .04em;
        }

        .collaboration-main {
          flex: 1;
          min-width: 0;
        }

        .collaboration-title-line {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
        }

        .collaboration-title-line strong {
          display: block;
          color: #261d1a;
          font-size: .98rem;
        }

        .collaboration-title-line span {
          display: block;
          margin-top: 2px;
          color: #86776f;
          font-size: .77rem;
          font-weight: 700;
        }

        .collaboration-open {
          flex: 0 0 auto;
          border: 1px solid #dac9be;
          border-radius: 999px;
          padding: 7px 11px;
          color: #6B1A2C !important;
          text-decoration: none !important;
          font-size: .72rem;
          font-weight: 900;
          background: #fff;
        }

        .collaboration-permissions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .collaboration-pill {
          display: inline-flex;
          align-items: center;
          min-height: 27px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #f6eee8;
          color: #6B1A2C;
          font-size: .68rem;
          font-weight: 850;
        }

        .collaboration-pill.base {
          background: #6B1A2C;
          color: #fff;
        }

        .collaboration-only-view {
          display: inline-flex;
          align-items: center;
          color: #8c7d75;
          font-size: .7rem;
          font-weight: 700;
        }

        .collaboration-empty {
          display: grid;
          gap: 3px;
          padding: 17px;
          border: 1px dashed #d9c8bd;
          border-radius: 15px;
          background: #fbf8f5;
        }

        .collaboration-empty strong {
          color: #3d302a;
        }

        .collaboration-empty span {
          color: #887970;
          font-size: .8rem;
          line-height: 1.45;
        }

        .access-separation-note {
          display: grid;
          gap: 3px;
          margin-top: 14px;
          padding: 13px 15px;
          border-left: 4px solid #D4A24C;
          border-radius: 0 12px 12px 0;
          background: #fbf7ee;
        }

        .access-separation-note strong {
          color: #6B1A2C;
          font-size: .78rem;
        }

        .access-separation-note span {
          color: #776a63;
          font-size: .74rem;
          line-height: 1.45;
        }

        @media (max-width: 1050px) {
          .subscription-layout {
            grid-template-columns: 1fr;
          }

          .subscription-visual-column {
            border-top: 1px solid #eee5df;
            border-left: 0;
          }
        }

        @media (max-width: 650px) {
          .subscription-left,
          .subscription-visual-column {
            padding: 24px 20px;
          }

          .subscription-head {
            display: grid;
          }

          .collaboration-access-section {
            margin-left: 20px;
            margin-right: 20px;
          }

          .collaboration-title-line {
            display: grid;
          }

          .collaboration-open {
            justify-self: start;
          }

          .primary-btn {
            width: 100%;
          }

          .membership-card {
            padding: 22px;
            border-radius: 22px;
          }

          .membership-ball {
            width: 84px;
            height: 84px;
          }

          .membership-bottom strong {
            font-size: 22px;
          }
        }
      `}</style>
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
.mc-club-line img{width:28px;height:28px;border-radius:6px;object-fit:contain;background:#fff;padding:2px;flex:0 0 auto}
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
.mc-photo img{width:100%;height:100%;object-fit:cover}.mc-logo{background:#fff}.mc-logo img{width:100%;height:100%;object-fit:contain;background:#fff;padding:10px;box-sizing:border-box}
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
.mc-teamgrid{display:flex;flex-direction:column;gap:1.15rem}
.mc-team-group-item{display:flex;flex-direction:column;gap:1.15rem;min-width:0}
.mc-team-section-title{display:flex;flex-direction:column;gap:.2rem;margin:.2rem 0 -.25rem}
.mc-team-section-title.collaboration{margin-top:1.15rem}
.mc-team-section-title strong{color:#6B1A2C;font-size:.88rem;font-weight:1000;letter-spacing:.025em}
.mc-team-section-title span{color:#81736c;font-size:.76rem;font-weight:600}
.mc-teamcard{background:#fff;border:1px solid #efe6db;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(60,30,20,.07)}
.mc-teamcard-horizontal{position:relative}
.mc-collaboration-role-badge{position:absolute;top:10px;left:10px;z-index:8;width:36px;height:36px;display:grid;place-items:center;border-radius:9px;background:#D4A24C;color:#382304;border:1px solid rgba(255,255,255,.78);box-shadow:0 6px 16px rgba(0,0,0,.17);font-size:.68rem;font-weight:1000;letter-spacing:.04em}
.mc-teamcard-horizontal{display:grid;grid-template-columns:minmax(280px,31%) minmax(0,1fr);min-height:178px}
.mc-team-banner{height:180px;background:linear-gradient(135deg,#2a1418,#6B1A2C);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2.4rem}
.mc-team-banner img{width:100%;height:100%;object-fit:cover}
.mc-team-banner-horizontal{height:auto;min-height:178px;position:relative;justify-content:flex-start;gap:22px;padding:24px 28px;overflow:hidden;isolation:isolate}
.mc-team-banner-horizontal::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,rgba(0,0,0,.2),rgba(0,0,0,.02));z-index:-1}
.mc-team-banner-lines{position:absolute;inset:-35px;opacity:.13;background:radial-gradient(circle at 100% 50%,transparent 0 93px,#fff 94px 96px,transparent 97px),linear-gradient(90deg,transparent 49.5%,#fff 50%,transparent 50.5%);z-index:-1;pointer-events:none}
.mc-team-banner-logo{width:82px;height:82px;border-radius:50%;background:#fff;border:4px solid rgba(255,255,255,.92);box-shadow:0 7px 22px rgba(0,0,0,.18);display:grid;place-items:center;overflow:hidden;flex:0 0 auto;color:#6B1A2C;font-size:1.65rem}
.mc-team-banner-logo img{width:100%;height:100%;object-fit:contain;background:#fff}
.mc-team-banner-copy{min-width:0;display:flex;flex-direction:column;align-items:flex-start}
.mc-team-banner-copy strong{font-family:'Oswald',sans-serif;font-size:clamp(2rem,3vw,3.3rem);font-weight:900;line-height:.95;text-transform:uppercase;letter-spacing:-.02em}
.mc-team-banner-copy span{margin-top:10px;font-size:.92rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;opacity:.95}

.mc-equipes-tabs{display:inline-flex;gap:4px;margin:2px 0 18px;padding:4px;background:#f7f1eb;border:1px solid #eadfd5;border-radius:12px}.mc-equipes-tabs button{border:0;background:transparent;color:#786c65;border-radius:9px;padding:9px 14px;font-weight:900;cursor:pointer}.mc-equipes-tabs button.active{background:#6B1A2C;color:#fff;box-shadow:0 5px 14px rgba(107,26,44,.16)}
.mc-team-shared{display:inline-flex;margin-top:9px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);color:#fff;font-style:normal;font-size:.62rem;font-weight:900;letter-spacing:.03em;white-space:nowrap}
.mc-team-body{padding:1rem}
.mc-team-body-horizontal{min-width:0;padding:22px 24px 18px;display:flex;flex-direction:column;justify-content:center}
.mc-team-kpis{display:grid;grid-template-columns:.85fr .85fr 1fr 1.3fr;align-items:stretch;margin-bottom:22px}
.mc-team-kpi{min-width:0;display:flex;align-items:center;gap:10px;padding:4px 20px;border-right:1px solid #eee4dc}
.mc-team-kpi:first-child{padding-left:0}
.mc-team-kpi:last-child{border-right:0;padding-right:0}
.mc-team-kpi-icon{width:30px;height:30px;display:grid;place-items:center;color:#81736b;font-size:1.05rem;flex:0 0 auto}
.mc-team-kpi div{min-width:0}
.mc-team-kpi strong{display:block;color:#0F0F12;font-size:.94rem;font-weight:950;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-team-kpi span:not(.mc-team-kpi-icon){display:block;margin-top:2px;color:#0F0F12;font-size:.66rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mc-team-kpi small{display:block;margin-top:3px;color:#8a7b73;font-size:.64rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-team-actions{display:flex;flex-wrap:wrap;gap:.45rem}
.mc-team-actions button{border:1px solid #efe6db;background:#fff;border-radius:9px;padding:.48rem .75rem;font-weight:900;font-size:.8rem}
.mc-team-actions button.main{background:#6B1A2C;color:#fff;border-color:#6B1A2C}
.mc-team-actions button.danger{background:#c5283d;color:#fff;border-color:#c5283d;margin-left:auto}
.mc-team-actions-horizontal{align-items:center;gap:.55rem}
.mc-team-actions-horizontal button{min-height:38px;padding:.52rem .9rem}
.mc-team-actions-horizontal button.danger{margin-left:auto;width:42px;padding:.52rem 0}
@media (max-width:1200px){.mc-teamcard-horizontal{grid-template-columns:250px minmax(0,1fr)}.mc-team-banner-horizontal{padding:20px;gap:14px}.mc-team-banner-logo{width:64px;height:64px}.mc-team-kpis{grid-template-columns:repeat(2,1fr);gap:14px 0}.mc-team-kpi:nth-child(2){border-right:0}.mc-team-kpi:nth-child(3){padding-left:0}}
@media (max-width:760px){.mc-teamcard-horizontal{display:block}.mc-team-banner-horizontal{min-height:145px}.mc-team-body-horizontal{padding:18px}.mc-team-kpis{grid-template-columns:1fr 1fr}.mc-team-kpi{padding:4px 12px}.mc-team-actions-horizontal button{flex:1 1 140px}.mc-team-actions-horizontal button.danger{flex:0 0 42px;margin-left:0}}

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
  .mc-profilehead{padding:1rem 1rem .35rem;gap:1rem}
  .mc-avatar-round{width:96px;height:96px;font-size:1.8rem}
  .mc-profilehead-info{min-width:0}
  .mc-modifier{width:100%;text-align:center}
  .mc-hr{margin:1rem 1rem 0}
  .mc-body{grid-template-columns:1fr;padding:1rem;gap:1rem}
  .mc-side{display:flex;flex-direction:row;overflow-x:auto;gap:.4rem;padding-bottom:.4rem;scrollbar-width:none}
  .mc-side::-webkit-scrollbar{display:none}
  .mc-side-item{flex:0 0 auto;width:auto;white-space:nowrap;font-size:.92rem;padding:.55rem .7rem}
  .mc-content{overflow:visible}
  .mc-equipes-head{align-items:stretch;flex-direction:column}
  .mc-new-team{width:100%;min-height:44px}
  .mc-playerchips{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mc-team-actions button{flex:1 1 140px}
  .mc-team-actions button.danger{margin-left:0}
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
@media (max-width:600px){
  .mc-profilehead{display:grid;grid-template-columns:76px minmax(0,1fr);align-items:center}
  .mc-retour{grid-column:1 / -1;justify-self:start}
  .mc-avatar-round{width:76px;height:76px}
  .mc-profilehead-info h1{font-size:1.3rem}
  .mc-modifier{grid-column:1 / -1}
  .mc-row{margin-bottom:.85rem}
  .mc-cats{grid-template-columns:1fr;gap:.55rem}
  .mc-photo,.mc-logo{width:130px;height:130px}
  .mc-save-row{justify-content:stretch}
  .mc-save{width:100%;min-height:46px}
  .mc-teamgrid{gap:1rem}
  .mc-team-banner{height:140px}
  .mc-playerchips{grid-template-columns:1fr 1fr}
  .tl-modal,.mbk-modal{padding:1rem}
  .tl-fields,.mbk-form-grid{grid-template-columns:1fr}
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
