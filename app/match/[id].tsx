import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Seat } from '@/core/match';
import {
  foldEntries,
  roundFor,
  standings,
  valueAt,
  winners,
  type ScoreEntry,
  type Standing,
} from '@/core/scoring';
import type { ScoreCategory, ScoreTemplate } from '@/core/template';
import {
  finishMatch,
  liveQueries,
  recordScore,
  reopenMatch,
  setRound,
  toEntry,
  toMatch,
  toSeat,
  undoScore,
} from '@/db/repository';
import type { MatchRow, ScoreEntryRow, SeatRow } from '@/db/schema';
import { catalog } from '@/templates/catalog';
import {
  Body,
  Button,
  Caption,
  Card,
  ColorDot,
  Heading,
  Loading,
  Screen,
  Title,
} from '@/ui/components';
import { CategoryInput } from '@/ui/CategoryInput';
import { playerColorAt, radius, spacing, useTheme } from '@/ui/theme';

export default function MatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const matchId = params.id;

  const matchQuery = useLiveQuery(liveQueries.match(matchId), [matchId]);
  const seatsQuery = useLiveQuery(liveQueries.seats(matchId), [matchId]);
  const entriesQuery = useLiveQuery(liveQueries.entries(matchId), [matchId]);

  const [expandedSeatId, setExpandedSeatId] = useState<string | undefined>(undefined);

  // While this match is open, entries written on someone else's phone land in
  // our SQLite. The live queries above are watching that database, so the
  // table redraws without this screen knowing sync exists.
  //
  // Loaded on demand for the same reason the root layout does it: a scorer
  // that works offline must not depend on the sync client even being loadable.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    void import('@/sync/engine')
      .then(({ watchMatch }) => {
        if (cancelled) return;
        stop = watchMatch(matchId);
      })
      .catch(() => {
        // No sync in this build; scoring locally is unaffected.
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [matchId]);

  const matchRow = (matchQuery.data as MatchRow[])[0];
  const seats = useMemo(
    () => (seatsQuery.data as SeatRow[]).map(toSeat),
    [seatsQuery.data],
  );
  const entries = useMemo(
    () => (entriesQuery.data as ScoreEntryRow[]).map(toEntry),
    [entriesQuery.data],
  );

  const state = useMemo(() => foldEntries(entries), [entries]);
  const match = matchRow === undefined ? undefined : toMatch(matchRow);
  const template = catalog.resolve(match?.templateId);

  const rows = useMemo(
    () => (match === undefined ? [] : standings(template, state, seats)),
    [match, template, state, seats],
  );

  if (match === undefined) {
    return (
      <Screen>
        <Loading label="Abriendo la partida…" />
      </Screen>
    );
  }

  const finished = match.status === 'finished';
  const leaders = winners(rows);
  // Everyone still on zero is not a winner, it is a match that has not started.
  const hasScores = rows.some((row) => row.total !== 0);

  const changeScore = (seat: Seat, category: ScoreCategory, value: number) => {
    void recordScore({
      matchId: match.id,
      seatId: seat.id,
      category,
      value,
      currentRound: match.round,
    });
  };

  const undoFor = (seat: Seat) => {
    const newest = newestEntryForSeat(entries, seat.id);
    if (newest === undefined) return;
    void undoScore(newest.seatId, newest.categoryKey, newest.round);
  };

  const confirmFinish = () => {
    Alert.alert('Terminar la partida', '¿Dais por cerrada la puntuación?', [
      { text: 'Todavía no', style: 'cancel' },
      { text: 'Terminar', onPress: () => void finishMatch(match.id) },
    ]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: match.gameName }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {finished && hasScores && (
          <Card style={styles.winnerCard}>
            <Caption>{leaders.length > 1 ? 'EMPATE' : 'GANA'}</Caption>
            <Title>{leaders.map((row) => row.seat.playerName).join(' y ')}</Title>
            <Body>{leaders[0]?.total ?? 0} puntos</Body>
          </Card>
        )}

        {template.rounds === true && !finished && (
          <RoundControls
            onChange={(next) => void setRound(match.id, next)}
            round={match.round}
          />
        )}

        <View style={styles.standings}>
          {rows.map((row, index) => (
            <SeatCard
              expanded={expandedSeatId === row.seat.id}
              index={index}
              key={row.seat.id}
              locked={finished}
              onChange={(category, value) => changeScore(row.seat, category, value)}
              onToggle={() =>
                setExpandedSeatId((current) =>
                  current === row.seat.id ? undefined : row.seat.id,
                )
              }
              onUndo={() => undoFor(row.seat)}
              round={match.round}
              standing={row}
              state={state}
              template={template}
            />
          ))}
        </View>

        {finished ? (
          <Button
            label="Reabrir para corregir"
            onPress={() => void reopenMatch(match.id)}
            variant="secondary"
          />
        ) : (
          <Button label="Terminar partida" onPress={confirmFinish} variant="secondary" />
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function RoundControls({
  round,
  onChange,
}: {
  round: number;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.roundBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Button
        disabled={round <= 1}
        label="Anterior"
        onPress={() => onChange(round - 1)}
        style={styles.roundButton}
        variant="secondary"
      />
      <View style={styles.roundLabel}>
        <Caption>RONDA</Caption>
        <Title>{round}</Title>
      </View>
      <Button
        label="Siguiente"
        onPress={() => onChange(round + 1)}
        style={styles.roundButton}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */

interface SeatCardProps {
  readonly standing: Standing;
  readonly template: ScoreTemplate;
  readonly state: ReturnType<typeof foldEntries>;
  readonly round: number;
  readonly index: number;
  readonly expanded: boolean;
  readonly locked: boolean;
  readonly onToggle: () => void;
  readonly onChange: (category: ScoreCategory, value: number) => void;
  readonly onUndo: () => void;
}

function SeatCard({
  standing,
  template,
  state,
  round,
  index,
  expanded,
  locked,
  onToggle,
  onChange,
  onUndo,
}: SeatCardProps) {
  const theme = useTheme();
  const color = standing.seat.color ?? playerColorAt(index);
  const leading = standing.rank === 1;

  return (
    <Card style={styles.seatCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.seatHeader}
      >
        <View
          style={[
            styles.rankBadge,
            {
              backgroundColor: leading ? theme.gold : theme.surfaceRaised,
              borderColor: leading ? theme.gold : theme.border,
            },
          ]}
        >
          <Body style={[styles.rankLabel, { color: leading ? '#FFFFFF' : theme.textMuted }]}>
            {standing.rank}
          </Body>
        </View>
        <ColorDot color={color} />
        <Heading numberOfLines={1} style={styles.seatName}>
          {standing.seat.playerName}
        </Heading>
        <Title style={styles.seatTotal}>{standing.total}</Title>
      </Pressable>

      {expanded && (
        <View style={[styles.editor, { borderTopColor: theme.border }]}>
          {template.categories.map((category) => {
            const slotRound = roundFor(category, round);
            const value =
              valueAt(state, standing.seat.id, category.key, slotRound) ??
              category.defaultValue ??
              0;
            const accumulated = standing.units.get(category.key) ?? 0;

            return (
              <View key={category.key}>
                <CategoryInput
                  category={category}
                  disabled={locked}
                  onChange={(next) => onChange(category, next)}
                  points={value * (category.multiplier ?? 1)}
                  value={value}
                />
                {category.perRound === true && accumulated !== value && (
                  <Caption style={styles.accumulated}>
                    Acumulado en todas las rondas: {accumulated}
                  </Caption>
                )}
              </View>
            );
          })}

          {!locked && (
            <Button
              label="Deshacer último cambio"
              onPress={onUndo}
              style={styles.undoButton}
              variant="ghost"
            />
          )}
        </View>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/** Most recently written entry for a seat, by timestamp then id. */
function newestEntryForSeat(
  entries: readonly ScoreEntry[],
  seatId: string,
): ScoreEntry | undefined {
  let newest: ScoreEntry | undefined;
  for (const entry of entries) {
    if (entry.seatId !== seatId) continue;
    if (
      newest === undefined ||
      entry.recordedAt > newest.recordedAt ||
      (entry.recordedAt === newest.recordedAt && entry.id > newest.id)
    ) {
      newest = entry;
    }
  }
  return newest;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  winnerCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  roundBar: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  roundButton: {
    flex: 1,
  },
  roundLabel: {
    alignItems: 'center',
    minWidth: 64,
  },
  standings: {
    gap: spacing.sm,
  },
  seatCard: {
    padding: 0,
  },
  seatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rankBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  rankLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  seatName: {
    flex: 1,
  },
  seatTotal: {
    fontVariant: ['tabular-nums'],
  },
  editor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  accumulated: {
    paddingBottom: spacing.sm,
  },
  undoButton: {
    marginTop: spacing.xs,
  },
});
