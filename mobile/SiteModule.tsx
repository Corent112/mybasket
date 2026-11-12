import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';

export const site = 'https://mybasket.vercel.app';
export const needsBrowser = (route: string) => /^\/(?:plaquette|montages|management\/montage|prise-stats-(?:live|pro)|boutique|abonnements|panier|auth)(?:[/?#]|$)/.test(route);

function openExternal(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Page indisponible', 'Impossible d’ouvrir cette adresse.'));
}

export function SiteModule({ title, route, close }: { title: string; route: string; close: () => void }) {
  const ref = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(site + route);
  const source = site + route;
  useEffect(() => NetInfo.addEventListener((state) => {
    setOffline(state.isConnected === false || state.isInternetReachable === false);
  }), []);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) ref.current?.goBack();
      else close();
      return true;
    });
    return () => handler.remove();
  }, [close]);

  return <View style={styles.body}>
    <View style={styles.toolbar}>
      <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel="Retour au menu" onPress={close}><Feather name="arrow-left" size={20} color="#6B1A2C" /></Pressable>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel="Ouvrir dans le navigateur" onPress={() => openExternal(page)}><Feather name="external-link" size={19} color="#6B1A2C" /></Pressable>
    </View>
    {offline ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Hors ligne · ce module du site nécessite Internet.</Text> : null}
    {failed && !offline ? <Pressable style={styles.notice} accessibilityRole="button" onPress={() => { setFailed(false); ref.current?.reload(); }}>
      <Text>Page indisponible. Réessayer</Text>
    </Pressable> : null}
    <WebView
      ref={ref}
      source={{ uri: source }}
      originWhitelist={['https://*']}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' || request.isTopFrame === false) return true;
        try {
          const url = new URL(request.url);
          if (url.origin === site && !needsBrowser(url.pathname)) return true;
          if (url.protocol === 'https:') openExternal(url.href);
        } catch { /* Adresse ignorée. */ }
        return false;
      }}
      onNavigationStateChange={(state) => {
        canGoBack.current = state.canGoBack;
        if (state.url.startsWith(site + '/')) setPage(state.url);
      }}
      onOpenWindow={({ nativeEvent }) => {
        try {
          const url = new URL(nativeEvent.targetUrl);
          if (url.protocol === 'https:') openExternal(url.href);
        } catch { /* Adresse ignorée. */ }
      }}
      onError={() => setFailed(true)}
      onLoad={() => setFailed(false)}
      startInLoadingState
      renderLoading={() => <ActivityIndicator style={styles.spinner} color="#6B1A2C" />}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
    />
  </View>;
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: '#FFF8EF' },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, gap: 8 },
  title: { flex: 1, fontWeight: '700', fontSize: 16, color: '#311520' },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { padding: 12, backgroundColor: '#FFE4AD', color: '#311520' },
  spinner: { position: 'absolute', top: 16, alignSelf: 'center' },
});
