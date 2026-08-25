import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { clampToCategory, type ScoreCategory } from '@/core/template';

import { Caption } from './components';
import { radius, spacing, useTheme } from './theme';

export interface CategoryInputProps {
  readonly category: ScoreCategory;
  readonly value: number;
  readonly onChange: (next: number) => void;
  /** Points this contributes once the multiplier is applied. */
  readonly points: number;
  /** Read-only, e.g. once the match is closed. */
  readonly disabled?: boolean;
}

/**
 * One row of a scoresheet.
 *
 * The control is chosen by the category's declared input type, which is what
 * keeps the templates purely declarative: adding a game never means adding a
 * component.
 */
export function CategoryInput({
  category,
  value,
  onChange,
  points,
  disabled = false,
}: CategoryInputProps) {
  const theme = useTheme();
  const multiplier = category.multiplier ?? 1;
  const showsConversion = multiplier !== 1 && value !== 0;

  return (
    <View style={styles.row}>
      <View style={styles.labelColumn}>
        <Text style={[styles.label, { color: theme.text }]}>{category.label}</Text>
        {category.help !== undefined && <Caption>{category.help}</Caption>}
        {showsConversion && (
          <Caption style={{ color: theme.accent }}>
            {value} × {multiplier} = {points} pts
          </Caption>
        )}
      </View>

      <View style={styles.controlColumn}>
        {category.input === 'toggle' ? (
          <Toggle disabled={disabled} value={value} onChange={onChange} />
        ) : category.input === 'select' ? (
          <Select category={category} disabled={disabled} value={value} onChange={onChange} />
        ) : (
          <Stepper category={category} disabled={disabled} value={value} onChange={onChange} />
        )}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

function Stepper({
  category,
  value,
  onChange,
  disabled,
}: {
  category: ScoreCategory;
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const step = category.step ?? 1;
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  // Keep in step with values arriving from elsewhere (an undo, or another
  // device), but never yank the field out from under someone mid-edit.
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  const nudge = (delta: number) => {
    const next = clampToCategory(category, value + delta);
    setText(String(next));
    onChange(next);
  };

  const commit = (raw: string) => {
    const normalised = raw.trim().replace(',', '.');
    const parsed = Number.parseFloat(normalised);
    const next = clampToCategory(category, Number.isNaN(parsed) ? 0 : Math.round(parsed));
    setText(String(next));
    onChange(next);
  };

  return (
    <View style={styles.stepper}>
      <StepButton
        accessibilityLabel={`Restar a ${category.label}`}
        disabled={disabled}
        label="−"
        onPress={() => nudge(-step)}
      />
      <TextInput
        accessibilityLabel={category.label}
        editable={!disabled}
        keyboardType="numbers-and-punctuation"
        onBlur={() => {
          focused.current = false;
          commit(text);
        }}
        onChangeText={setText}
        onFocus={() => {
          focused.current = true;
        }}
        onSubmitEditing={() => commit(text)}
        returnKeyType="done"
        selectTextOnFocus
        style={[
          styles.stepperValue,
          { backgroundColor: theme.surfaceRaised, borderColor: theme.border, color: theme.text },
        ]}
        value={text}
      />
      <StepButton
        accessibilityLabel={`Sumar a ${category.label}`}
        disabled={disabled}
        label="+"
        onPress={() => nudge(step)}
      />
    </View>
  );
}

function StepButton({
  label,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        {
          backgroundColor: theme.surfaceRaised,
          borderColor: theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.stepButtonLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const on = value > 0;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={() => onChange(on ? 0 : 1)}
      style={({ pressed }) => [
        styles.toggle,
        {
          backgroundColor: on ? theme.accent : theme.surfaceRaised,
          borderColor: on ? theme.accent : theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.toggleLabel, { color: on ? theme.accentText : theme.textMuted }]}>
        {on ? 'Sí' : 'No'}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

function Select({
  category,
  value,
  onChange,
  disabled,
}: {
  category: ScoreCategory;
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.select}>
      {(category.options ?? []).map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.selectOption,
              {
                backgroundColor: active ? theme.accent : theme.surfaceRaised,
                borderColor: active ? theme.accent : theme.border,
                opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.selectLabel,
                { color: active ? theme.accentText : theme.text },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  labelColumn: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  controlColumn: {
    alignItems: 'flex-end',
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  stepButtonLabel: {
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 26,
  },
  stepperValue: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    height: 40,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
  toggle: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    minWidth: 72,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  select: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-end',
    maxWidth: 200,
  },
  selectOption: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
