import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ScoreTemplate } from '@/core/template';
import { createMatch, listPlayers } from '@/db/repository';
import { catalog, GENERIC_TEMPLATE_ID } from '@/templates/catalog';
import {
  Body,
  Button,
  Caption,
  Card,
  ColorDot,
  Field,
  Heading,
  Screen,
} from '@/ui/components';
import { playerColorAt, radius, spacing, useTheme } from '@/ui/theme';

interface SeatDraft {
  readonly name: string;
  readonly color: string;
}

export default function NewMatchScreen() {
  const router = useRouter();
  const theme = useTheme();

  const templates = useMemo(() => catalog.list(), []);
  const [templateId, setTemplateId] = useState(GENERIC_TEMPLATE_ID);
  const [gameName, setGameName] = useState('');
  const [seatDrafts, setSeatDrafts] = useState<readonly SeatDraft[]>([]);
  const [pendingName, setPendingName] = useState('');
  const [knownPlayers, setKnownPlayers] = useState<readonly string[]>([]);
  const [starting, setStarting] = useState(false);

  const template = catalog.resolve(templateId);

  useEffect(() => {
    listPlayers()
      .then((players) => setKnownPlayers(players.map((player) => player.name)))
      .catch(() => setKnownPlayers([]));
  }, []);

  const chooseTemplate = (next: ScoreTemplate) => {
    setTemplateId(next.id);
    // A dedicated scoresheet names the game; the generic ones do not, so we
    // leave whatever the player typed alone in that case.
    if (next.bggId !== undefined && (gameName.trim() === '' || gameName === template.name)) {
      setGameName(next.name);
    }
  };

  const addSeat = (name: string) => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const alreadySeated = seatDrafts.some(
      (seat) => seat.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (alreadySeated) return;

    setSeatDrafts((current) => [
      ...current,
      { name: trimmed, color: playerColorAt(current.length) },
    ]);
    setPendingName('');
  };

  const removeSeat = (name: string) => {
    setSeatDrafts((current) => current.filter((seat) => seat.name !== name));
  };

  const start = () => {
    if (seatDrafts.length === 0 || starting) return;
    setStarting(true);

    createMatch({
      template,
      gameName: gameName.trim() === '' ? template.name : gameName,
      players: seatDrafts.map((seat) => ({ name: seat.name, color: seat.color })),
    })
      .then((match) => {
        router.replace({ pathname: '/match/[id]', params: { id: match.id } });
      })
      .catch((error: unknown) => {
        setStarting(false);
        Alert.alert(
          'No se pudo crear la partida',
          error instanceof Error ? error.message : String(error),
        );
      });
  };

  const availableSuggestions = knownPlayers.filter(
    (name) => !seatDrafts.some((seat) => seat.name.toLowerCase() === name.toLowerCase()),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.block}>
          <Heading>¿A qué jugáis?</Heading>
          <Field
            label="Juego"
            onChangeText={setGameName}
            placeholder={template.name}
            value={gameName}
          />
          <Caption>Hoja de puntuación</Caption>
          <View style={styles.templateGrid}>
            {templates.map((option) => {
              const active = option.id === templateId;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  key={option.id}
                  onPress={() => chooseTemplate(option)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active ? theme.accent : theme.surfaceRaised,
                      borderColor: active ? theme.accent : theme.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Body
                    style={[
                      styles.chipLabel,
                      { color: active ? theme.accentText : theme.text },
                    ]}
                  >
                    {option.name}
                  </Body>
                </Pressable>
              );
            })}
          </View>
          <Caption>
            {template.categories.length === 1
              ? 'Un solo campo de puntos: sirve para cualquier juego.'
              : `${template.categories.length} apartados de puntuación.`}
          </Caption>
        </Card>

        <Card style={styles.block}>
          <Heading>¿Quién juega?</Heading>

          {seatDrafts.length === 0 ? (
            <Caption>Añade al menos a una persona. El orden es el orden de turno.</Caption>
          ) : (
            <View style={styles.seatList}>
              {seatDrafts.map((seat, index) => (
                <View
                  key={seat.name}
                  style={[styles.seatRow, { borderColor: theme.border }]}
                >
                  <ColorDot color={seat.color} />
                  <Body style={styles.seatName}>{seat.name}</Body>
                  <Caption>{index + 1}º</Caption>
                  <Pressable
                    accessibilityLabel={`Quitar a ${seat.name}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => removeSeat(seat.name)}
                  >
                    <Body style={{ color: theme.danger }}>Quitar</Body>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.addRow}>
            <View style={styles.addField}>
              <Field
                label="Añadir jugador"
                onChangeText={setPendingName}
                onSubmitEditing={() => addSeat(pendingName)}
                placeholder="Nombre"
                value={pendingName}
              />
            </View>
            <Button
              disabled={pendingName.trim() === ''}
              label="Añadir"
              onPress={() => addSeat(pendingName)}
              style={styles.addButton}
              variant="secondary"
            />
          </View>

          {availableSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Caption>Habituales</Caption>
              <View style={styles.templateGrid}>
                {availableSuggestions.map((name) => (
                  <Pressable
                    accessibilityLabel={`Añadir a ${name}`}
                    accessibilityRole="button"
                    key={name}
                    onPress={() => addSeat(name)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: theme.surfaceRaised,
                        borderColor: theme.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Body style={styles.chipLabel}>{name}</Body>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </Card>

        <Button
          disabled={seatDrafts.length === 0 || starting}
          label={starting ? 'Empezando…' : 'Empezar partida'}
          onPress={start}
        />
      </ScrollView>
    </Screen>
  );
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
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  seatList: {
    gap: spacing.xs,
  },
  seatRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  seatName: {
    flex: 1,
    fontWeight: '500',
  },
  addRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addField: {
    flex: 1,
  },
  addButton: {
    minWidth: 96,
  },
  suggestions: {
    gap: spacing.sm,
  },
});
