/**
 * Scoring templates are data, not code.
 *
 * Every game scores differently, and the only way to cover hundreds of them is
 * to describe the scoresheet declaratively and keep one engine that interprets
 * it. Templates can therefore ship with the app, be downloaded later, or be
 * written by users, without a release.
 *
 * Totals are a weighted sum on purpose. A formula language would need a parser
 * and an evaluator, and would turn user-authored templates into arbitrary code
 * running on someone else's phone. `multiplier` plus per-round accumulation
 * covers the overwhelming majority of real scoresheets.
 */

export type CategoryInput =
  /** Free numeric entry, may be negative. */
  | 'number'
  /** Non-negative tally with plus/minus controls. */
  | 'counter'
  /** Scored or not scored. */
  | 'toggle'
  /** One of a fixed set of values. */
  | 'select';

export interface SelectOption {
  readonly label: string;
  readonly value: number;
}

export interface ScoreCategory {
  /** Stable identifier; the storage key for every entry in this category. */
  readonly key: string;
  readonly label: string;
  readonly input: CategoryInput;
  /** Short hint shown under the field, e.g. "1 point per pair of boots". */
  readonly help?: string;
  /** Applied when a player has recorded nothing, e.g. a starting rating of 20. */
  readonly defaultValue?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Points earned per recorded unit. Defaults to 1. */
  readonly multiplier?: number;
  /** Accumulates across rounds instead of holding one final figure. */
  readonly perRound?: boolean;
  /** Required when `input` is 'select'. */
  readonly options?: readonly SelectOption[];
  /** Counts towards the displayed subtotal but not the final total. */
  readonly excludeFromTotal?: boolean;
}

export interface ScoreTemplate {
  readonly id: string;
  readonly name: string;
  /** BoardGameGeek id, when this template targets a specific game. */
  readonly bggId?: number;
  readonly categories: readonly ScoreCategory[];
  /** Category keys consulted in order when totals are level, best value first. */
  readonly tiebreakers?: readonly string[];
  /** Golf-style: the lowest total wins. */
  readonly lowestWins?: boolean;
  /** The scoresheet is filled in round by round rather than once at the end. */
  readonly rounds?: boolean;
}

export function categoryByKey(
  template: ScoreTemplate,
  key: string,
): ScoreCategory | undefined {
  return template.categories.find((category) => category.key === key);
}

/** Constrains a value to the bounds and step declared by its category. */
export function clampToCategory(category: ScoreCategory, value: number): number {
  if (!Number.isFinite(value)) return category.defaultValue ?? 0;
  let next = value;
  if (category.input === 'counter' || category.input === 'toggle') {
    next = Math.max(0, next);
  }
  if (category.input === 'toggle') {
    next = next > 0 ? 1 : 0;
  }
  if (category.min !== undefined) next = Math.max(category.min, next);
  if (category.max !== undefined) next = Math.min(category.max, next);
  return next;
}

/**
 * Reports everything wrong with a template. Returns an empty array when the
 * template is sound. Run this over anything not written by us before trusting
 * it — downloaded templates and user-authored ones alike.
 */
export function validateTemplate(template: ScoreTemplate): string[] {
  const problems: string[] = [];

  if (template.id.trim() === '') problems.push('The template needs an id.');
  if (template.name.trim() === '') problems.push('The template needs a name.');
  if (template.categories.length === 0) {
    problems.push('The template needs at least one category.');
  }

  const seen = new Set<string>();
  for (const category of template.categories) {
    if (category.key.trim() === '') {
      problems.push('Every category needs a key.');
    } else if (seen.has(category.key)) {
      problems.push(`Duplicate category key: "${category.key}".`);
    }
    seen.add(category.key);

    if (category.input === 'select' && (category.options?.length ?? 0) === 0) {
      problems.push(`Category "${category.key}" is a select but declares no options.`);
    }
    if (
      category.min !== undefined &&
      category.max !== undefined &&
      category.min > category.max
    ) {
      problems.push(`Category "${category.key}" has min greater than max.`);
    }
    if (category.multiplier === 0) {
      problems.push(`Category "${category.key}" has a multiplier of 0 and can never score.`);
    }
  }

  for (const key of template.tiebreakers ?? []) {
    if (!seen.has(key)) {
      problems.push(`Tiebreaker "${key}" does not match any category.`);
    }
  }

  return problems;
}
