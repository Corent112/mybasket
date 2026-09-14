"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MesSystemesShortcut() {
  const pathname = usePathname();

  if (pathname !== "/mon-compte") return null;

  return (
    <Link href="/mon-compte/systemes" className="mes-systemes-shortcut">
      <span aria-hidden="true">📚</span>
      <span>Mes Systèmes</span>

      <style jsx>{`
        .mes-systemes-shortcut {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 80;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border-radius: 999px;
          padding: 12px 16px;
          background: #7a0d24;
          color: white;
          text-decoration: none;
          font-size: 13px;
          font-weight: 900;
          box-shadow: 0 12px 28px rgba(62, 6, 19, 0.22);
        }

        .mes-systemes-shortcut:hover {
          transform: translateY(-1px);
        }

        @media (max-width: 720px) {
          .mes-systemes-shortcut {
            right: 14px;
            bottom: 14px;
          }
        }
      `}</style>
    </Link>
  );
}
