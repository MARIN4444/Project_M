export type MatchStatus = 'setup' | 'live' | 'finished';

export interface Match {
  readonly id: string;
  readonly templateId: string;
  /** Denormalised so a match still reads correctly if the game is removed. */
  readonly gameName: string;
  readonly bggId?: number;
  /** Short code other devices use to join this match. */
  readonly joinCode: string;
  readonly status: MatchStatus;
  /** Current round for round-based templates; 0 for a single final tally. */
  readonly round: number;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly notes?: string;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly createdAt: number;
}

export interface Seat {
  readonly id: string;
  readonly matchId: string;
  readonly playerId: string;
  /** Denormalised for the same reason as `Match.gameName`. */
  readonly playerName: string;
  /** Turn order, 0-based. Also the stable display order. */
  readonly order: number;
  readonly color?: string;
  /**
   * Device currently driving this seat. Undefined means nobody has claimed it,
   * which is exactly the everyone-on-one-phone case: the host fills in for all.
   */
  readonly claimedBy?: string;
}
