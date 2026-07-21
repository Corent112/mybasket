"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentRole, ADMIN_ROLES } from "@/lib/admin/queries";
import "./admin.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok">("checking");

  useEffect(() => {
    let alive = true;

    async function checkAccess() {
      try {
        const { authed, role } = await getCurrentRole();

        if (!alive) return;

        if (!authed) {
          router.replace("/connexion");
          return;
        }

        if (!role || !ADMIN_ROLES.includes(role)) {
          router.replace("/mon-compte");
          return;
        }

        setState("ok");
      } catch {
        if (alive) router.replace("/connexion");
      }
    }

    checkAccess();

    return () => {
      alive = false;
    };
  }, [router]);

  if (state === "checking") {
    return (
      <div className="adm-gate">
        <div className="adm-gate-card">
          <div className="adm-spinner" />
          <p>Vérification des accès…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}