import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { liveQueries, toMatch } from '@/db/repository';
import type { MatchRow } from '@/db/schema';
import { Body, Button, Caption, EmptyState, Heading, Screen } from '@/ui/components';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data } = useLiveQuery(liveQueries.recentMatches());

  const matches = (data as MatchRow[]).map(toMatch);
  const live = matches.filter((match) => match.status !== 'finished');
  const finished = matches.filter((match) => match.status === 'finished');

  return (
    <Screen>
      <FlatList
        ListEmptyComponent={
          <EmptyState
            title="Todavía no hay partidas"
            hint="Empieza una y ve marcando los puntos según jugáis."
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="Nueva partida" onPress={() => router.push('/match/new')} />
            {live.length > 0 && (
              <View style={styles.section}>
                <Caption style={styles.sectionTitle}>EN CURSO</Caption>
                {live.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </View>
            )}
            {finished.length > 0 && (
              <Caption style={[styles.sectionTitle, styles.historyTitle]}>HISTORIAL</Caption>
            )}
          </View>
        }
        contentContainerStyle={styles.list}
        data={finished}
        keyExtractor={(match) => match.id}
        renderItem={({ item }) => <MatchCard match={item} />}
      />
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Caption>
          Todo se guarda en este dispositivo. La sincronización entre móviles llega después.
        </Caption>
      </View>
    </Screen>
  );
}

function MatchCard({ match }: { match: ReturnType<typeof toMatch> }) {
  const theme = useTheme();
  const started = new Date(match.startedAt);

  return (
    <Link asChild href={{ pathname: '/match/[id]', params: { id: match.id } }}>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.cardBody}>
          <Heading numberOfLines={1}>{match.gameName}</Heading>
          <Caption>
            {started.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {match.status !== 'finished' ? ' · en curso' : ''}
          </Caption>
        </View>
        {match.status !== 'finished' && (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <Body style={[styles.badgeLabel, { color: theme.accentText }]}>Seguir</Body>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  historyTitle: {
    marginTop: spacing.sm,
  },
  card: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
});
