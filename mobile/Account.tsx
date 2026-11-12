import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const wine = '#6B1A2C';
const accountUrl = 'https://mybasket.vercel.app/connexion';

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      setLoading(false);
    });
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => { subscription.unsubscribe(); appState.remove(); client.auth.stopAutoRefresh(); };
  }, []);
  return { session, loading };
}

export function SignIn({ loading }: { loading: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const client = supabase;
    if (!client || busy || loading) return;
    if (!email.trim() || !password) { setError('Renseigne ton adresse email et ton mot de passe.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (result.error) {
        setError(result.error.status === 0 ? 'Connexion indisponible. Vérifie ton réseau.' :
          result.error.code === 'email_not_confirmed' ? 'Confirme ton adresse email avant de te connecter.' :
          'Connexion impossible. Vérifie tes identifiants ou réessaie.');
      }
    } catch {
      setError('Connexion indisponible. Vérifie ton réseau.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ margin: 18 }} color={wine} />;
  return <View style={styles.panel}>
    <Text style={styles.heading}>Connecte-toi avec ton compte MyBasket</Text>
    {!supabase ? <Text>La connexion n’est pas configurée dans cette version.</Text> : <>
      <TextInput style={styles.input} accessibilityLabel="Adresse email" placeholder="Adresse email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} accessibilityLabel="Mot de passe" placeholder="Mot de passe" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} onSubmitEditing={() => void submit()} />
      {error ? <Text accessibilityRole="alert" style={{ color: wine }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={styles.button} onPress={() => void submit()}>
        <Text style={styles.buttonText}>{busy ? 'Connexion…' : 'Se connecter'}</Text>
      </Pressable>
    </>}
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(accountUrl).catch(() => setError('Impossible d’ouvrir le site.'))}>
      <Text style={styles.siteLink}>Créer un compte ou retrouver mon mot de passe sur le site ↗</Text>
    </Pressable>
  </View>;
}

type Match = { id: string; opponent: string | null; match_date: string | null; us_score: number | null; them_score: number | null };
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });

export function RecentMatches({ session }: { session: Session }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [updated, setUpdated] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const userId = session.user.id;

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let stopped = false, connected = true, reading = false, repeat = false;
    async function refresh() {
      if (!client || stopped || !connected) return;
      if (reading) { repeat = true; return; }
      reading = true;
      try {
        const result = await client.from('match_stats').select('id,opponent,match_date,us_score,them_score')
          .eq('user_id', userId).order('match_date', { ascending: false, nullsFirst: false }).limit(6);
        if (stopped) return;
        setError(Boolean(result.error));
        if (!result.error) { setMatches(result.data); setUpdated(true); }
      } catch {
        if (!stopped) setError(true);
      } finally {
        reading = false;
        if (repeat) { repeat = false; void refresh(); }
      }
    }
    void refresh();
    const unsubscribe = NetInfo.addEventListener((state) => {
      connected = state.isConnected !== false && state.isInternetReachable !== false;
      setOffline(!connected);
      if (connected) void refresh();
    });
    const channel = client.channel('mobile-matches-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_stats', filter: 'user_id=eq.' + userId }, () => {
        if (!stopped) { setLive(true); void refresh(); }
      }).subscribe((status) => {
        if (stopped) return;
        if (status !== 'SUBSCRIBED') setLive(false);
        else void refresh();
      });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 10000);
    return () => { stopped = true; clearInterval(timer); appState.remove(); unsubscribe(); void client.removeChannel(channel); };
  }, [userId]);

  async function signOut() {
    setSignOutError(false);
    try {
      const result = await supabase?.auth.signOut({ scope: 'local' });
      if (result?.error) setSignOutError(true);
    } catch {
      setSignOutError(true);
    }
  }

  return <View style={styles.panel}>
    <Text style={styles.heading}>Mes derniers matchs</Text>
    <Text>{session.user.email}</Text>
    <Text accessibilityLiveRegion="polite">{offline ? 'Hors ligne' : error ? 'Actualisation indisponible' : live ? 'Actualisation en direct' : updated ? 'Actualisation automatique' : 'Chargement…'}</Text>
    {matches.map((match) => {
      const date = match.match_date ? new Date(match.match_date) : null;
      return <View key={match.id} style={styles.match}><Text style={styles.heading}>{match.opponent || 'Adversaire non renseigné'}</Text>
        <Text>{date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : 'Date non renseignée'}
          {match.us_score != null && match.them_score != null ? ` · ${match.us_score}–${match.them_score}` : ''}</Text></View>;
    })}
    {updated && !matches.length && !offline && !error ? <Text>Aucun match personnel enregistré.</Text> : null}
    {signOutError ? <Text accessibilityRole="alert">Impossible de se déconnecter. Réessaie.</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => void signOut()}><Text style={styles.siteLink}>Se déconnecter</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFDFC', borderColor: '#EBDAD6', borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 14, gap: 9 },
  heading: { color: '#311520', fontSize: 16, fontWeight: '750' },
  input: { color: '#311520', borderColor: '#EBDAD6', borderWidth: 1, borderRadius: 9, minHeight: 48, paddingHorizontal: 12, fontSize: 16 },
  button: { backgroundColor: wine, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700' },
  siteLink: { color: wine, fontWeight: '700', minHeight: 44, paddingVertical: 10 },
  match: { borderTopColor: '#EBDAD6', borderTopWidth: 1, paddingVertical: 8, gap: 3 },
});
