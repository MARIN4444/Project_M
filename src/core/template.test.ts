import { describe, expect, it } from 'vitest';

import { categoryByKey, clampToCategory, validateTemplate, type ScoreTemplate } from './template';

const sound: ScoreTemplate = {
  id: 'sound',
  name: 'Sound template',
  categories: [
    { key: 'points', label: 'Points', input: 'number' },
    { key: 'cash', label: 'Cash', input: 'counter' },
  ],
  tiebreakers: ['cash'],
};

describe('validateTemplate', () => {
  it('accepts a sound template', () => {
    expect(validateTemplate(sound)).toEqual([]);
  });

  it('rejects duplicate category keys', () => {
    const problems = validateTemplate({
      ...sound,
      categories: [
        { key: 'points', label: 'A', input: 'number' },
        { key: 'points', label: 'B', input: 'number' },
      ],
      tiebreakers: [],
    });

    expect(problems).toContain('Duplicate category key: "points".');
  });

  it('rejects a tiebreaker that matches no category', () => {
    const problems = validateTemplate({ ...sound, tiebreakers: ['nope'] });
    expect(problems).toContain('Tiebreaker "nope" does not match any category.');
  });

  it('rejects a select with no options', () => {
    const problems = validateTemplate({
      ...sound,
      categories: [{ key: 'pick', label: 'Pick', input: 'select' }],
      tiebreakers: [],
    });

    expect(problems).toContain('Category "pick" is a select but declares no options.');
  });

  it('rejects an inverted min/max range', () => {
    const problems = validateTemplate({
      ...sound,
      categories: [{ key: 'points', label: 'Points', input: 'number', min: 10, max: 2 }],
      tiebreakers: [],
    });

    expect(problems).toContain('Category "points" has min greater than max.');
  });

  it('rejects a category that can never score', () => {
    const problems = validateTemplate({
      ...sound,
      categories: [{ key: 'points', label: 'Points', input: 'number', multiplier: 0 }],
      tiebreakers: [],
    });

    expect(problems).toContain('Category "points" has a multiplier of 0 and can never score.');
  });

  it('rejects a template with no categories', () => {
    expect(validateTemplate({ ...sound, categories: [], tiebreakers: [] })).toContain(
      'The template needs at least one category.',
    );
  });
});

describe('clampToCategory', () => {
  it('lets a plain number go negative', () => {
    expect(clampToCategory({ key: 'p', label: 'P', input: 'number' }, -5)).toBe(-5);
  });

  it('holds a counter at zero', () => {
    expect(clampToCategory({ key: 'p', label: 'P', input: 'counter' }, -5)).toBe(0);
  });

  it('flattens a toggle to 0 or 1', () => {
    const toggle = { key: 'p', label: 'P', input: 'toggle' } as const;
    expect(clampToCategory(toggle, 7)).toBe(1);
    expect(clampToCategory(toggle, 0)).toBe(0);
  });

  it('respects declared bounds', () => {
    const bounded = { key: 'p', label: 'P', input: 'number', min: 2, max: 8 } as const;
    expect(clampToCategory(bounded, 99)).toBe(8);
    expect(clampToCategory(bounded, -99)).toBe(2);
  });

  it('falls back to the default when handed a non-number', () => {
    const category = { key: 'p', label: 'P', input: 'number', defaultValue: 20 } as const;
    expect(clampToCategory(category, Number.NaN)).toBe(20);
  });
});

describe('categoryByKey', () => {
  it('finds a category and reports a miss as undefined', () => {
    expect(categoryByKey(sound, 'cash')?.label).toBe('Cash');
    expect(categoryByKey(sound, 'missing')).toBeUndefined();
  });
});
