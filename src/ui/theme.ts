import { useColorScheme } from 'react-native';

/**
 * Tokens, not raw colours in components.
 *
 * The app is used at a table, often in poor light, and a scoreboard has to be
 * readable at arm's length across the table. That drives the choices here:
 * generous type sizes, high contrast, and a palette that holds up in both
 * schemes rather than a dark theme bolted on later.
 */
export interface Theme {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly accentText: string;
  readonly gold: string;
  readonly danger: string;
  readonly isDark: boolean;
}

const light: Theme = {
  background: '#F6F6F3',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E3E3DD',
  text: '#1A1A17',
  textMuted: '#6C6C64',
  accent: '#2F6F4F',
  accentText: '#FFFFFF',
  gold: '#A9791B',
  danger: '#A33A2E',
  isDark: false,
};

const dark: Theme = {
  background: '#121310',
  surface: '#1B1D19',
  surfaceRaised: '#232620',
  border: '#2F332B',
  text: '#F1F1EC',
  textMuted: '#9B9B92',
  accent: '#5CA97D',
  accentText: '#0E1A13',
  gold: '#D6A94A',
  danger: '#E0776A',
  isDark: true,
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Colours cycled through as players are seated. */
export const PLAYER_COLORS = [
  '#C4553B',
  '#3B7DC4',
  '#4E9E5A',
  '#C49B3B',
  '#8A5BC4',
  '#3BB6C4',
  '#C43B8A',
  '#7A7A6E',
] as const;

export function playerColorAt(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
}
