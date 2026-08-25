import type { ScoreTemplate } from '@/core/template';
import { validateTemplate } from '@/core/template';

import { BUILTIN_TEMPLATES, GENERIC_TEMPLATE_ID } from './builtin';

export { BUILTIN_TEMPLATES, GENERIC_TEMPLATE_ID, GENERIC_ROUNDS_TEMPLATE_ID } from './builtin';

/**
 * The catalog a match resolves its scoresheet against. Built-ins are seeded at
 * construction; templates downloaded or written by a user are added later and
 * are validated on the way in, so a broken one can never reach the engine.
 */
export class TemplateCatalog {
  private readonly byId = new Map<string, ScoreTemplate>();

  constructor(templates: readonly ScoreTemplate[] = BUILTIN_TEMPLATES) {
    for (const template of templates) {
      this.byId.set(template.id, template);
    }
  }

  get(id: string): ScoreTemplate | undefined {
    return this.byId.get(id);
  }

  /**
   * The scoresheet to use for a match. Falls back to the generic template so a
   * game with no dedicated sheet is still perfectly playable.
   */
  resolve(id: string | undefined): ScoreTemplate {
    const found = id === undefined ? undefined : this.byId.get(id);
    if (found !== undefined) return found;

    const generic = this.byId.get(GENERIC_TEMPLATE_ID);
    if (generic === undefined) {
      throw new Error('The generic template is missing from the catalog.');
    }
    return generic;
  }

  /** Templates written for a specific BoardGameGeek game. */
  forBggId(bggId: number): ScoreTemplate[] {
    return [...this.byId.values()].filter((template) => template.bggId === bggId);
  }

  /** Every template, generic ones last, so real scoresheets surface first. */
  list(): ScoreTemplate[] {
    return [...this.byId.values()].sort((a, b) => {
      const aGeneric = a.bggId === undefined ? 1 : 0;
      const bGeneric = b.bggId === undefined ? 1 : 0;
      if (aGeneric !== bGeneric) return aGeneric - bGeneric;
      return a.name.localeCompare(b.name, 'es');
    });
  }

  /** Adds a template that did not ship with the app. Rejects invalid ones. */
  add(template: ScoreTemplate): void {
    const problems = validateTemplate(template);
    if (problems.length > 0) {
      throw new Error(`Invalid template "${template.id}": ${problems.join(' ')}`);
    }
    this.byId.set(template.id, template);
  }
}

export const catalog = new TemplateCatalog();
