import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type Setting = {
  id: string;
  key: string;
  value: string | null;
  value_json: any | null;
  category: string | null;
  description: string | null;
  updated_at: string | null;
};

const DEFAULT_SETTINGS = [
  {
    key: "platform_name",
    value: "MyBasket",
    category: "Identité",
    description: "Nom affiché de la plateforme.",
  },
  {
    key: "maintenance_mode",
    value: "false",
    category: "Sécurité",
    description: "Active ou désactive le mode maintenance.",
  },
  {
    key: "contact_email",
    value: "contact@mybasket.fr",
    category: "Contact",
    description: "Email principal de contact.",
  },
  {
    key: "support_email",
    value: "support@mybasket.fr",
    category: "Contact",
    description: "Email support utilisateur.",
  },
  {
    key: "primary_color",
    value: "#6B1A2C",
    category: "Design",
    description: "Couleur principale.",
  },
  {
    key: "accent_color",
    value: "#D4A24C",
    category: "Design",
    description: "Couleur accent or.",
  },
];

async function upsertSettingAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const key = String(formData.get("key") || "").trim();
  const value = String(formData.get("value") || "");
  const category = String(formData.get("category") || "Général");
  const description = String(formData.get("description") || "");

  if (!key) return;

  await supabase.from("admin_settings").upsert(
    {
      key,
      value,
      category,
      description,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "key",
    }
  );

  revalidatePath("/admin/settings");
  revalidatePath("/");
}

async function deleteSettingAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("admin_settings").delete().eq("id", id);

  revalidatePath("/admin/settings");
}

export default async function AdminSettingsPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("admin_settings")
    .select("*")
    .order("category", { ascending: true })
    .order("key", { ascending: true });

  const settings = (data || []) as Setting[];

  const maintenance = settings.find((s) => s.key === "maintenance_mode");
  const platformName = settings.find((s) => s.key === "platform_name");
  const contactEmail = settings.find((s) => s.key === "contact_email");

  return (
    <main className={styles.adminSettings}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Paramètres CEO</h1>
            <span>
              Configure les réglages globaux de la plateforme : identité,
              maintenance, contacts, design et options internes.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{settings.length}</strong>
            <span>Réglages</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{platformName?.value || "MyBasket"}</strong>
            <span>Nom plateforme</span>
          </div>

          <div
            className={`${styles.statCard} ${
              maintenance?.value === "true" ? styles.red : styles.green
            }`}
          >
            <strong>{maintenance?.value === "true" ? "ON" : "OFF"}</strong>
            <span>Maintenance</span>
          </div>

          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{contactEmail?.value || "—"}</strong>
            <span>Email contact</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer / modifier un réglage</h2>
            <span>
              Utilise une clé stable. Exemple : maintenance_mode, contact_email,
              primary_color.
            </span>
          </div>

          <form action={upsertSettingAction} className={styles.form}>
            <input name="key" placeholder="Clé ex. maintenance_mode" required />
            <input name="value" placeholder="Valeur ex. true / false" />
            <input name="category" placeholder="Catégorie" />
            <input name="description" placeholder="Description" />
            <button type="submit">Enregistrer</button>
          </form>
        </section>

        {settings.length === 0 && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Réglages conseillés</h2>
              <span>
                Ta table est vide. Tu peux créer ces réglages de base.
              </span>
            </div>

            <div className={styles.defaultGrid}>
              {DEFAULT_SETTINGS.map((setting) => (
                <form
                  key={setting.key}
                  action={upsertSettingAction}
                  className={styles.defaultCard}
                >
                  <input type="hidden" name="key" value={setting.key} />
                  <input type="hidden" name="value" value={setting.value} />
                  <input
                    type="hidden"
                    name="category"
                    value={setting.category}
                  />
                  <input
                    type="hidden"
                    name="description"
                    value={setting.description}
                  />

                  <strong>{setting.key}</strong>
                  <span>{setting.value}</span>
                  <p>{setting.description}</p>

                  <button type="submit">Créer</button>
                </form>
              ))}
            </div>
          </section>
        )}

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Réglages existants</h2>
            <span>{settings.length} réglages</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Clé</th>
                  <th>Valeur</th>
                  <th>Catégorie</th>
                  <th>Description</th>
                  <th>Mis à jour</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {settings.map((setting) => (
                  <tr key={setting.id}>
                    <td>
                      <strong>{setting.key}</strong>
                    </td>
                    <td>{setting.value || "—"}</td>
                    <td>{setting.category || "Général"}</td>
                    <td>{setting.description || "—"}</td>
                    <td>
                      {setting.updated_at
                        ? new Date(setting.updated_at).toLocaleDateString(
                            "fr-FR"
                          )
                        : "—"}
                    </td>
                    <td>
                      <form action={deleteSettingAction}>
                        <input type="hidden" name="id" value={setting.id} />
                        <button type="submit" className={styles.dangerBtn}>
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}

                {settings.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        Aucun réglage créé.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}