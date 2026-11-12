import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from './supabase';

type Playbook = {
  id: string;
  title: string;
  season: string | null;
  playbook_systems: { id: string; title: string }[];
};

export function Playbooks({ userId, openWeb }: { userId: string; openWeb: (id: string) => void }) {
  const [rows, setRows] = useState<Playbook[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const current = rows?.find((row) => row.id === selected);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const cacheKey = 'mybasket.playbooks.v1.' + userId;
    let active = true;
    let connected = false;
    let refreshed = false;
    let pending = false;

    void AsyncStorage.getItem(cacheKey).then((raw) => {
      if (!active || refreshed || !raw) return;
      const cached = JSON.parse(raw);
      if (Array.isArray(cached)) setRows(cached);
    }).catch(() => {});

    async function refresh() {
      if (!client || !active || !connected || pending) return;
      pending = true;
      try {
        const { data, error } = await client.from('playbooks')
          .select('id,title,season,playbook_systems(id,title)')
          .eq('owner_id', userId).order('updated_at', { ascending: false });
        if (error) throw error;
        if (!active) return;
        refreshed = true;
        setError(false);
        setRows(data);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
      }
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      connected = state.isConnected !== false && state.isInternetReachable !== false;
      setOffline(!connected);
      if (connected) void refresh();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 10000);
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
      clearInterval(timer);
    };
  }, [userId]);

  return <View style={styles.list}>
    {offline && <Text>{rows ? 'Hors ligne · dernière version chargée' : 'Hors ligne · aucun playbook chargé sur cet appareil'}</Text>}
    {!offline && error && <Text accessibilityRole="alert">Actualisation indisponible.</Text>}
    {!offline && !error && !rows && <Text>Chargement…</Text>}
    {rows?.length === 0 && <Text>Aucun playbook personnel.</Text>}
    {current ? <>
      <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.row}><Text style={styles.label}>Tous mes playbooks</Text></Pressable>
      <Text accessibilityRole="header" style={styles.label}>{current.title}</Text>
      {current.playbook_systems.map((system) => <Text key={system.id} style={styles.row}>{system.title}</Text>)}
      {!current.playbook_systems.length && <Text>Aucun système dans ce playbook.</Text>}
      {!offline && <Pressable accessibilityRole="button" onPress={() => openWeb(current.id)} style={styles.row}><Text style={styles.label}>Ouvrir sur MyBasket</Text></Pressable>}
    </> : rows?.map((row) => (
      <Pressable key={row.id} accessibilityRole="button" onPress={() => setSelected(row.id)} style={styles.row}>
        <Text style={styles.label}>{row.title}</Text>
        {row.season && <Text>{row.season}</Text>}
      </Pressable>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 10, marginVertical: 14 },
  row: { minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: '#FFFDFC', justifyContent: 'center' },
  label: { color: '#6B1A2C', fontWeight: '700', fontSize: 16 },
});
