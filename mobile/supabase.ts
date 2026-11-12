import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';

import production from './public-config.json';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || production.url;
const overrideKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.EXPO_PUBLIC_SUPABASE_URL ? overrideKey : production.publishableKey;

export const supabase = url && key ? createClient(url, key, {
  auth: {
    storage: {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
}) : null;
