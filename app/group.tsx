import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';

import { liveQueries, setActiveGroupId } from '@/db/repository';
import type { GroupRow, MetaRow, OutboxRow } from '@/db/schema';
import { syncNow } from '@/sync/engine';
import { createGroup, joinGroup } from '@/sync/groups';
import { isSyncConfigured } from '@/sync/supabase';
import { Button, Caption, Card, Field, Heading, Screen, Title } from '@/ui/components';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function GroupScreen() {
  const theme = useTheme();
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>(undefined);

  // Everything shown here already lives in SQLite, so it is read the same way
  // the rest of the app reads: a live query. The screen then redraws by itself
  // when a sync finishes or the group changes, with nothing to refresh by hand.
  const groups = (useLiveQuery(liveQueries.groups()).data as GroupRow[]) ?? [];
  const activeId = ((useLiveQuery(liveQueries.activeGroup()).data as MetaRow[]) ?? [])[0]?.value;
  const pending = ((useLiveQuery(liveQueries.pending()).data as OutboxRow[]) ?? []).length;

  const active = groups.find((group) => group.id === activeId);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setStatus(undefined);
    try {
      await work();
    } catch (error: unknown) {
      Alert.alert('No se pudo', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = () =>
    run(async () => {
      await createGroup(newName);
      setNewName('');
      const result = await syncNow();
      setStatus(describe(result.pushed, result.pulled, result.error));
    });

  const onJoin = () =>
    run(async () => {
      await joinGroup(code);
      setCode('');
      const result = await syncNow();
      setStatus(describe(result.pushed, result.pulled, result.error));
    });

  const onSync = () =>
    run(async () => {
      const result = await syncNow();
      setStatus(describe(result.pushed, result.pulled, result.error));
    });

  if (!isSyncConfigured()) {
    return (
      <Screen>
        <View style={styles.notice}>
          <Heading>Sin sincronización</Heading>
          <Caption>
            Esta versión se compiló sin credenciales de servidor. La app funciona igual, pero
            las partidas se quedan en este dispositivo.
          </Caption>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {active !== undefined ? (
          <Card style={styles.block}>
            <Caption>TU GRUPO</Caption>
            <Title>{active.name}</Title>

            <View style={[styles.codeBox, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
              <Caption>Código para invitar</Caption>
              <Title style={styles.code}>{active.joinCode}</Title>
            </View>

            <Button
              label="Compartir el código"
              onPress={() => {
                void Share.share({
                  message: `Únete a "${active.name}" en Project_M con el código ${active.joinCode}`,
                });
              }}
              variant="secondary"
            />

            <Caption>
              {pending === 0
                ? 'Todo sincronizado.'
                : `${pending} ${pending === 1 ? 'cambio pendiente' : 'cambios pendientes'} de subir.`}
            </Caption>

            <Button
              disabled={busy}
              label={busy ? 'Sincronizando…' : 'Sincronizar ahora'}
              onPress={onSync}
            />

            {status !== undefined && <Caption>{status}</Caption>}
          </Card>
        ) : (
          <Card style={styles.block}>
            <Heading>Todavía juegas en solitario</Heading>
            <Caption>
              Un grupo hace que las partidas se vean en los móviles de todos. Sin él, esta app
              funciona igual pero solo aquí.
            </Caption>
          </Card>
        )}

        <Card style={styles.block}>
          <Heading>Crear un grupo</Heading>
          <Field
            label="Nombre"
            onChangeText={setNewName}
            placeholder="Los del sábado"
            value={newName}
          />
          <Caption>
            Si es tu primer grupo, las partidas que ya tienes en este móvil se traen contigo.
          </Caption>
          <Button
            disabled={busy || newName.trim() === ''}
            label="Crear"
            onPress={onCreate}
            variant="secondary"
          />
        </Card>

        <Card style={styles.block}>
          <Heading>Unirse con un código</Heading>
          <Field
            label="Código"
            onChangeText={setCode}
            placeholder="ABC123"
            value={code}
          />
          <Caption>
            Al unirte a un grupo ajeno, tu historial de este móvil se queda donde está.
          </Caption>
          <Button
            disabled={busy || code.trim() === ''}
            label="Unirme"
            onPress={onJoin}
            variant="secondary"
          />
        </Card>

        {groups.length > 1 && (
          <Card style={styles.block}>
            <Heading>Cambiar de grupo</Heading>
            {groups.map((group) => (
              <Button
                key={group.id}
                disabled={busy || group.id === activeId}
                label={group.id === activeId ? `${group.name} (activo)` : group.name}
                onPress={() => run(async () => setActiveGroupId(group.id))}
                variant="ghost"
              />
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function describe(pushed: number, pulled: number, error?: string): string {
  if (error !== undefined) return `No se pudo sincronizar: ${error}`;
  if (pushed === 0 && pulled === 0) return 'Nada que sincronizar.';
  return `Subidos ${pushed}, recibidos ${pulled}.`;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  block: {
    gap: spacing.md,
  },
  notice: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  codeBox: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  code: {
    letterSpacing: 6,
  },
});
