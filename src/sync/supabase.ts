import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * The Supabase client, created lazily and only if everything it needs is
 * actually present.
 *
 * Sync is optional, and that has to be true at load time and not just in
 * spirit. Session storage is a native module, so importing it at the top of
 * this file would put it on the boot path: an app running against a build that
 * predates it would die before drawing a single pixel, which is exactly the
 * blank screen that led to this shape. Everything native is therefore reached
 * through a guarded lazy require, and a failure disables sync instead of
 * taking the app with it.
 *
 * The key that ships here is the publishable one and is meant to be public.
 * What keeps one group's matches away from another is row level security in
 * the database, not the secrecy of this string.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

interface NativeDeps {
  readonly storage: unknown;
}

type DepsState = { loaded: true; deps: NativeDeps } | { loaded: false };

let depsState: DepsState | undefined;

/**
 * Pulls in the pieces that only exist in a build compiled with them. Anything
 * missing is reported, never thrown: a phone running an older build should
 * lose sync, not the app.
 */
function loadNativeDeps(): DepsState {
  if (depsState !== undefined) return depsState;

  try {
    // React Native's URL is incomplete; supabase-js needs the full one.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-url-polyfill/auto');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-async-storage/async-storage') as {
      default?: unknown;
    };
    const storage = module.default;
    depsState = storage === undefined ? { loaded: false } : { loaded: true, deps: { storage } };
  } catch {
    depsState = { loaded: false };
  }

  return depsState;
}

function hasCredentials(): boolean {
  return (
    typeof url === 'string' && url.length > 0 && typeof anonKey === 'string' && anonKey.length > 0
  );
}

/**
 * Whether this build can sync at all: it needs both credentials and the native
 * modules the client depends on.
 */
export function isSyncConfigured(): boolean {
  return hasCredentials() && loadNativeDeps().loaded;
}

/** Why sync is unavailable, for a screen that wants to say something useful. */
export function syncUnavailableReason(): string | undefined {
  if (!hasCredentials()) {
    return 'Esta versión se compiló sin credenciales de servidor.';
  }
  if (!loadNativeDeps().loaded) {
    return 'Esta app está instalada desde una versión anterior a la sincronización. Vuelve a instalar la última.';
  }
  return undefined;
}

let client: SupabaseClient | undefined;
let refreshWired = false;

/** The client, or undefined when this build cannot sync. Never throws. */
export function getSupabase(): SupabaseClient | undefined {
  if (!isSyncConfigured()) return undefined;

  if (client === undefined) {
    const state = loadNativeDeps();
    if (!state.loaded) return undefined;

    client = createClient(url as string, anonKey as string, {
      auth: {
        // The session has to outlive the process, or every launch would create
        // a new anonymous user and the phone would lose its group.
        storage: state.deps.storage as never,
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
