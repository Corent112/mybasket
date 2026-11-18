'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initializeDefaultSlides } from './actions';
import type { SaveSlideState } from '@/lib/home/slider';
import styles from './page.module.css';

export default function SliderInitializer() {
  const router = useRouter();
  const [result, setResult] = useState<SaveSlideState | null>(null);
  useEffect(() => {
    let alive = true;
    void initializeDefaultSlides().then(value => {
      if (!alive) return;
      setResult(value);
      if (value.ok) router.refresh();
    }).catch(() => { if (alive) setResult({ ok: false, message: 'Préparation impossible. Recharge la page pour réessayer.' }); });
    return () => { alive = false; };
  }, [router]);
  return <p role={result && !result.ok ? 'alert' : 'status'} className={result && !result.ok ? styles.alert : styles.help}>
    {result?.message || 'Enregistrement des slides par défaut dans ton administration…'}
    {result && !result.ok && <button type="button" onClick={() => window.location.reload()}>Réessayer</button>}
  </p>;
}
