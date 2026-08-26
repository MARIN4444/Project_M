import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * The Supabase client, created lazily and only if the app was built with
 * credentials.
 *
 * Sync is optional by design. Without these variables the app is exactly what
 * it was before: a scorer with a local database. Nothing above this module may
 * assume a server exists -- that is the same rule the outbox enforces, applied
 * one layer up.
 *
 * The key that ships here is the publishable one and is meant to be public.
 * What keeps one group's matches away from another is row level security in
 * the database, not the secrecy of this string.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function isSyncConfigured(): boolean {
  return (
    typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0
  );
}

let client: SupabaseClient | undefined;
let refreshWired = false;

export function getSupabase(): SupabaseClient {
  if (!isSyncConfigured()) {
    throw new Error('Sync is not configured: EXPO_PUBLIC_SUPABASE_* are missing.');
  }

  if (client === undefined) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        // The session has to outlive the process, or every launch would create
        // a new anonymous user and the phone would lose its group.
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Only meaningful on the web, where Supabase reads the callback out of
        // the address bar. There is no address bar here.
        detectSessionInUrl: false,
      },
    });

    wireTokenRefresh(client);
  }

  return client;
}

/**
 * Refreshing a token in the background wakes the radio and drains battery for
 * nothing, so the timer only runs while the app is actually on screen.
 */
function wireTokenRefresh(instance: SupabaseClient): void {
  if (refreshWired) return;
  refreshWired = true;

  const apply = (state: string) => {
    if (state === 'active') {
      void instance.auth.startAutoRefresh();
    } else {
      void instance.auth.stopAutoRefresh();
    }
  };

  apply(AppState.currentState);
  AppState.addEventListener('change', apply);
}
