"use client";

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function DirectoryRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      // Do not interrupt an administrator editing an invitation or subscription.
      if (document.activeElement?.matches('input, select, textarea')) return;
      startTransition(() => router.refresh());
    };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
    {pending ? 'Actualisation…' : 'Actualiser'}
  </button>;
}
