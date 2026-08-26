import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, useTheme } from './theme';

/* -------------------------------------------------------------------------- */

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }, style]}>{children}</View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

type TypographyProps = {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Lets an error message be copied off the phone and pasted somewhere useful. */
  selectable?: boolean;
};

export function Title({ children, style }: TypographyProps) {
  const theme = useTheme();
  return <Text style={[styles.title, { color: theme.text }, style]}>{children}</Text>;
}

export function Heading({ children, style, numberOfLines }: TypographyProps) {
  const theme = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.heading, { color: theme.text }, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style, numberOfLines, selectable }: TypographyProps) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[styles.body, { color: theme.text }, style]}
    >
      {children}
    </Text>
  );
}

export function Caption({ children, style, numberOfLines, selectable }: TypographyProps) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[styles.caption, { color: theme.textMuted }, style]}
    >
      {children}
    </Text>
  );
}

/* -------------------------------------------------------------------------- */

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  const theme = useTheme();

  const palette = {
    primary: { background: theme.accent, text: theme.accentText, border: 'transparent' },
    secondary: { background: theme.surface, text: theme.text, border: theme.border },
    ghost: { background: 'transparent', text: theme.textMuted, border: 'transparent' },
    danger: { background: 'transparent', text: theme.danger, border: theme.border },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: disabled === true ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

export interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly placeholder?: string;
  readonly keyboardType?: 'default' | 'number-pad' | 'numbers-and-punctuation';
  readonly autoFocus?: boolean;
  readonly onSubmitEditing?: () => void;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoFocus,
  onSubmitEditing,
}: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Caption style={styles.fieldLabel}>{label}</Caption>
      <TextInput
        accessibilityLabel={label}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        returnKeyType="done"
        style={[
          styles.input,
          { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
        ]}
        value={value}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

export function Loading({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.accent} />
      {label !== undefined && <Caption style={styles.loadingLabel}>{label}</Caption>}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Heading style={styles.emptyTitle}>{title}</Heading>
      {hint !== undefined && <Caption style={styles.emptyHint}>{hint}</Caption>}
    </View>
  );
}

/** Small coloured dot identifying a player at a glance. */
export function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
    />
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
  },
  caption: {
    fontSize: 13,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontWeight: '600',
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  loadingLabel: {
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyHint: {
    textAlign: 'center',
  },
});
