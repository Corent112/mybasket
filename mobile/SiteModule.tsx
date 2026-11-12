import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';

export const site = 'https://mybasket.vercel.app';
export const needsBrowser = (route: string) => /^\/(?:plaquette|montages|management\/montage|prise-stats-(?:live|pro)|auth)(?:[/?#]|$)/.test(route);

const purchasePaths = ['/abonnements', '/boutique', '/panier', '/checkout', '/api/checkout'];
const paymentHosts = ['stripe.com', 'paypal.com'];

function isPurchaseDestination(url: URL) {
  const path = decodeURIComponent(url.pathname).replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
  return paymentHosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host)) ||
    purchasePaths.some((prefix) => path === prefix || path.startsWith(prefix + '/')) ||
    (path === '/mon-compte' && url.searchParams.get('tab')?.toLowerCase() === 'abonnement');
}

const hidePurchaseLinks = `
  (() => {
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify([
      ...purchasePaths.map((path) => `a[href^="${path}"], a[href^="${site}${path}"]`),
      'a[href*="tab=abonnement"], a[href*="checkout.stripe.com"], a[href*="paypal.com"]',
    ].join(', ') + ' { display: none !important; }')};
    (document.head || document.documentElement).appendChild(style);
  })();
  true;
`;

function openExternal(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Page indisponible', 'Impossible d’ouvrir cette adresse.'));
}

export function SiteModule({ title, route, close }: { title: string; route: string; close: () => void }) {
  const ref = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restricted, setRestricted] = useState(false);
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
    </View>
    {restricted && <Pressable style={styles.notice} onPress={() => setRestricted(false)} accessibilityRole="button">
      <Text>Ce parcours n’est pas disponible dans l’application. Fermer</Text>
    </Pressable>}
    {offline ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Hors ligne · ce module du site nécessite Internet.</Text> : null}
    {failed && !offline ? <Pressable style={styles.notice} accessibilityRole="button" onPress={() => { setFailed(false); ref.current?.reload(); }}>
      <Text>Page indisponible. Réessayer</Text>
    </Pressable> : null}
    <WebView
      ref={ref}
      source={{ uri: source }}
      originWhitelist={['https://*']}
      injectedJavaScript={hidePurchaseLinks}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank') return true;
        try {
          const url = new URL(request.url);
          if (isPurchaseDestination(url)) { setRestricted(true); return false; }
          if (request.isTopFrame === false || (url.origin === site && !needsBrowser(url.pathname))) return true;
          if (url.protocol === 'https:') openExternal(url.href);
        } catch { /* Adresse ignorée. */ }
        return false;
      }}
      onNavigationStateChange={(state) => {
        canGoBack.current = state.canGoBack;
      }}
      onOpenWindow={({ nativeEvent }) => {
        try {
          const url = new URL(nativeEvent.targetUrl);
          if (isPurchaseDestination(url)) { setRestricted(true); return; }
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
