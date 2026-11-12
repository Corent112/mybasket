import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountMenu, launchEntries, mainMenu, type Entry, type Icon } from './navigation';

import { RecentMatches, SignIn, useAccount } from './Account';

import { needsBrowser, site, SiteModule } from './SiteModule';
const colors = { wine: '#6B1A2C', gold: '#F5CD7E', cream: '#FFF8EF', tile: '#FFFDFC', ink: '#311520', line: '#EBDAD6' };
const storageKey = 'mybasket.shortcut.v1';
const iconChoices: Icon[] = ['star', 'book-open', 'edit-3', 'activity', 'film', 'target'];
type Shortcut = { target: string; label: string; icon: Icon };
const defaultShortcut: Shortcut = { target: 'live', label: 'LiveStats', icon: 'activity' };

function AppScreen() {
  const { session, loading } = useAccount();
  const [webModule, setWebModule] = useState<{ title: string; route: string } | null>(null);
  const [stack, setStack] = useState<Entry[]>([mainMenu]);
  const [editing, setEditing] = useState(false);
  const [shortcut, setShortcut] = useState<Shortcut>(defaultShortcut);
  const [draft, setDraft] = useState<Shortcut>(defaultShortcut);
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gridWidth = Math.max(0, Math.min(740, width - insets.left - insets.right) - 32);
  const minTileWidth = 88 * Math.max(1, fontScale);
  const columns = Math.max(1, Math.min(gridWidth >= 600 ? 4 : 3, Math.floor((gridWidth + 7) / (minTileWidth + 7))));
  const tileWidth = Math.floor((gridWidth - 7 * (columns - 1)) / columns);
  const compactHeader = width - insets.left - insets.right < 286 * fontScale;
  const current = stack[stack.length - 1];
  const account = stack[0].id === accountMenu.id;
  const target = launchEntries.find((entry) => entry.id === shortcut.target) ?? launchEntries[3];

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (!active || !raw) return;
      const value: Partial<Shortcut> = JSON.parse(raw);
      if (launchEntries.some((entry) => entry.id === value.target) && typeof value.label === 'string' &&
          value.icon && iconChoices.includes(value.icon)) {
        setShortcut(value as Shortcut);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function back() {
    if (editing) { setEditing(false); return true; }
    if (stack.length > 1) { setStack((old) => old.slice(0, -1)); return true; }
    return false;
  }

  useEffect(() => {
    if (webModule) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [editing, stack.length, webModule]);

  function go(entry: Entry) {
    if (entry.sections) { setStack((old) => [...old, entry]); return; }
    if (entry.route) {
      if (!needsBrowser(entry.route)) { setWebModule({ title: entry.label, route: entry.route }); return; }
      void Linking.openURL(site + entry.route).catch(() => {
        Alert.alert('Page indisponible', 'Vérifie ta connexion, puis réessaie.');
      });
    }
  }

  function root(entry: Entry) { setEditing(false); setStack([entry]); }
  async function save() {
    const next = { ...draft, label: draft.label.trim() };
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setShortcut(next);
      setEditing(false);
    } catch {
      Alert.alert('Enregistrement impossible', 'Tes réglages sont encore ouverts. Tu peux réessayer.');
    }
  }

  function tile(entry: Entry, label = entry.label, icon = entry.icon) {
    return <Pressable key={entry.id} accessibilityRole="button"
      accessibilityHint={entry.route ? (needsBrowser(entry.route) ? 'Ouvre le site MyBasket dans le navigateur' : 'Ouvre la page MyBasket') : 'Ouvre le sous-menu'}
      onPress={() => go(entry)}
      style={({ pressed }) => [styles.tile, { width: tileWidth, minHeight: Math.max(tileWidth, 90 * fontScale) }, pressed && styles.pressed]}>
      <View style={styles.icon}><Feather name={icon} size={22} color={colors.gold} /></View>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>;
  }

  if (webModule) return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <SiteModule title={webModule.title} route={webModule.route} close={() => setWebModule(null)} />
  </SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={[styles.header, compactHeader && styles.headerCompact]}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !account }} onPress={() => root(mainMenu)} style={[styles.headerButton, !account && styles.headerActive]}>
        <Text style={!account ? styles.activeText : styles.headerText}>Menu</Text>
      </Pressable>
      <Image source={require('./assets/logo.png')} accessibilityLabel="MyBasket" style={styles.logo} />
      <Pressable accessibilityRole="button" accessibilityState={{ selected: account }} onPress={() => root(accountMenu)} style={[styles.headerButton, account && styles.headerActive]}>
        <Text style={account ? styles.activeText : styles.headerText}>Mon compte</Text>
      </Pressable>
    </View>
    <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView key={editing ? 'edit' : current.id} keyboardShouldPersistTaps="handled" style={styles.body} contentContainerStyle={styles.scroll}>
      {(stack.length > 1 || editing) && <Pressable accessibilityRole="button" onPress={back} style={styles.back}>
        <Feather name="arrow-left" size={16} color={colors.wine} /><Text style={styles.backText}>{editing ? 'Annuler' : stack[stack.length - 2].label}</Text>
      </Pressable>}
      <View style={styles.hero}>
        <Text style={styles.kicker}>{account ? 'ESPACE PERSONNEL' : 'MYBASKET'}</Text>
        <Text accessibilityRole="header" style={styles.title}>{editing ? 'Mon raccourci' : current.label}</Text>
      </View>
      {account && current.id === accountMenu.id && !editing && (
        session ? <RecentMatches key={session.user.id} session={session} /> : <SignIn loading={loading} />
      )}
      {editing ? <View style={styles.editor}>
        <Text style={styles.sectionTitle}>Nom du bouton</Text>
        <TextInput accessibilityLabel="Nom du bouton" style={styles.input} placeholder="Ex. Jour de match" maxLength={26} value={draft.label} onChangeText={(label) => setDraft((old) => ({ ...old, label }))} />
        <Text style={styles.sectionTitle}>Fonction</Text>
        <View style={styles.grid}>{launchEntries.map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ selected: draft.target === entry.id }} style={[styles.choice, draft.target === entry.id && styles.selected]} onPress={() => setDraft((old) => ({ ...old, target: entry.id }))}><Text style={styles.backText}>{entry.label}</Text></Pressable>)}</View>
        <Text style={styles.sectionTitle}>Pictogramme</Text>
        <View style={styles.grid}>{iconChoices.map((icon, index) => <Pressable key={icon} accessibilityRole="button" accessibilityLabel={['Étoile', 'Livre', 'Crayon', 'Activité', 'Vidéo', 'Cible'][index]} accessibilityState={{ selected: draft.icon === icon }} style={[styles.choice, draft.icon === icon && styles.selected]} onPress={() => setDraft((old) => ({ ...old, icon }))}><Feather name={icon} size={20} color={colors.wine} /></Pressable>)}</View>
        <Pressable accessibilityRole="button" style={styles.save} onPress={() => void save()}><Text style={styles.headerText}>Enregistrer</Text></Pressable>
      </View> : <>
        {current.sections?.map((section) => <View key={section.title}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.grid}>{section.entries.map((entry) => tile(entry))}</View>
        </View>)}
        {current.id === mainMenu.id && <View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Mon raccourci</Text>
          <View style={styles.grid}>
            {tile(target, shortcut.label || target.label, shortcut.icon)}
            <Pressable accessibilityRole="button" style={[styles.tile, { width: tileWidth, minHeight: Math.max(tileWidth, 90 * fontScale) }]} onPress={() => { setDraft(shortcut); setEditing(true); }}>
              <View style={styles.icon}><Feather name="sliders" size={22} color={colors.gold} /></View><Text style={styles.tileLabel}>Personnaliser</Text>
            </Pressable>
          </View>
        </View>}
      </>}
    </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><AppScreen /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.wine },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, gap: 6, width: '100%', maxWidth: 740, alignSelf: 'center' },
  headerCompact: { flexWrap: 'wrap', justifyContent: 'center' },
  headerButton: { maxWidth: '100%', minHeight: 44, justifyContent: 'center', alignItems: 'center', minWidth: 92, paddingHorizontal: 8, borderRadius: 10 },
  headerActive: { backgroundColor: colors.gold },
  headerText: { fontWeight: '700', color: '#FFF' },
  activeText: { fontWeight: '800', color: colors.ink },
  logo: { width: 49, height: 49, borderRadius: 12, backgroundColor: colors.cream, resizeMode: 'contain' },
  body: { flex: 1, backgroundColor: colors.cream },
  scroll: { width: '100%', maxWidth: 740, alignSelf: 'center', padding: 16, paddingBottom: 30 },
  back: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { color: colors.wine, fontWeight: '700' },
  hero: { backgroundColor: colors.wine, borderRadius: 18, borderBottomWidth: 3, borderBottomColor: colors.gold, padding: 18 },
  kicker: { color: colors.gold, fontWeight: '800', letterSpacing: 1.6, fontSize: 11 },
  title: { color: '#FFF', fontSize: 33, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  sectionTitle: { color: colors.wine, fontSize: 13, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tile: { minHeight: 90, backgroundColor: colors.tile, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 5, alignItems: 'center', justifyContent: 'center', gap: 6 },
  pressed: { backgroundColor: '#FFF0D7', borderColor: colors.gold },
  icon: { width: 41, height: 41, borderRadius: 11, backgroundColor: colors.wine, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: colors.ink, textAlign: 'center', fontSize: 13, fontWeight: '700', maxWidth: '100%' },
  editor: { paddingBottom: 10 },
  input: { backgroundColor: colors.tile, borderColor: colors.line, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, minHeight: 48, fontSize: 16, color: colors.ink },
  choice: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.tile, padding: 9 },
  selected: { backgroundColor: '#FFE4AD', borderColor: colors.wine },
  save: { marginTop: 20, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 17, backgroundColor: colors.wine, borderRadius: 10 },
});
