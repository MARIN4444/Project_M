import * as Crypto from 'expo-crypto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setRandomBytesSource } from '@/core/ids';
import { runMigrations } from '@/db/client';
import { Body, Caption, Loading, Screen } from '@/ui/components';
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
