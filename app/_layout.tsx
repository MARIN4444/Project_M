import * as Crypto from 'expo-crypto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setRandomBytesSource } from '@/core/ids';
import { runMigrations } from '@/db/client';
import { Body, Button, Caption, Loading, Screen } from '@/ui/components';
import { spacing, useTheme } from '@/ui/theme';

// Ids are the tiebreaker when two devices write the same slot in the same
// millisecond, so they need real randomness rather than Math.random.
setRandomBytesSource((size) => Crypto.getRandomBytes(size));

type Startup =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly message: string };

export default function RootLayout() {
  const theme = useTheme();
  const [startup, setStartup] = useState<Startup>({ kind: 'loading' });

  // The database has to be at the right schema version before any screen runs
  // a query, so nothing renders until migrations finish.
  useEffect(() => {
    let cancelled = false;

    runMigrations()
      .then(() => {
        if (!cancelled) setStartup({ kind: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStartup({
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync when the app opens and every time it comes back to the foreground.
  // Both are cheap when there is nothing queued, and neither blocks the UI:
  // a failure just leaves the outbox where it was.
  useEffect(() => {
    if (startup.kind !== 'ready') return;

    // Imported here rather than at the top of the file on purpose. Everything
    // sync touches -- the Supabase client, its polyfills, session storage --
    // would otherwise be evaluated while the module graph loads, which puts an
    // optional feature on the boot path. When one of those pieces is missing
    // the app dies before drawing anything, and a blank screen is the least
    // debuggable failure there is. Loading it from inside an effect means a
    // problem in sync can only ever break sync.
    const attempt = () => {
      void (async () => {
        try {
          const [{ syncNow }, { ensureSession }] = await Promise.all([
            import('@/sync/engine'),
            import('@/sync/session'),
          ]);
          await ensureSession();
          await syncNow();
        } catch {
          // Sync is optional. The scorer works without it.
        }
      })();
    };

    attempt();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });

    return () => {
      subscription.remove();
    };
  }, [startup.kind]);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {startup.kind === 'loading' && (
        <Screen>
          <Loading label="Preparando la mesa…" />
        </Screen>
      )}
      {startup.kind === 'failed' && (
        <Screen>
          <View style={styles.failure}>
            <Body>No se pudo abrir la base de datos local.</Body>
            <Caption>{startup.message}</Caption>
          </View>
        </Screen>
      )}
      {startup.kind === 'ready' && (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Project_M' }} />
          <Stack.Screen name="match/new" options={{ title: 'Nueva partida' }} />
          <Stack.Screen name="match/[id]" options={{ title: 'Partida' }} />
          <Stack.Screen name="group" options={{ title: 'Tu grupo' }} />
        </Stack>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  failure: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
});

/**
 * Expo Router renders this instead of the screen when something throws while
 * rendering. Without it the app shows a blank white screen and the reason
 * lives only in a terminal the person holding the phone cannot see.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <SafeAreaProvider>
      <Screen>
        <View style={styles.failure}>
          <Body>Algo se rompió al abrir esta pantalla.</Body>
          <Caption selectable>{error.message}</Caption>
          <Caption selectable>{error.stack?.split('\n').slice(0, 6).join('\n')}</Caption>
          <Button label="Reintentar" onPress={() => void retry()} />
        </View>
      </Screen>
    </SafeAreaProvider>
  );
}
