import { describe, expect, it } from 'vitest';

import { validateTemplate, type ScoreTemplate } from '@/core/template';

import { BUILTIN_TEMPLATES, GENERIC_TEMPLATE_ID, TemplateCatalog } from './catalog';

describe('built-in templates', () => {
  it.each(BUILTIN_TEMPLATES.map((template) => [template.name, template] as const))(
    '%s is valid',
    (_name, template) => {
      expect(validateTemplate(template)).toEqual([]);
    },
  );

  it('has no duplicate ids', () => {
    const ids = BUILTIN_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships a generic template that fits any game', () => {
    const generic = BUILTIN_TEMPLATES.find((template) => template.id === GENERIC_TEMPLATE_ID);
    expect(generic?.bggId).toBeUndefined();
    expect(generic?.categories.length).toBeGreaterThan(0);
  });
});

describe('TemplateCatalog', () => {
  const catalog = new TemplateCatalog();

  it('resolves a known id', () => {
    expect(catalog.resolve('catan')?.name).toBe('Catán');
  });

  it('falls back to the generic template for an unknown id', () => {
    expect(catalog.resolve('does-not-exist').id).toBe(GENERIC_TEMPLATE_ID);
  });

  it('falls back to the generic template when no id is given', () => {
    expect(catalog.resolve(undefined).id).toBe(GENERIC_TEMPLATE_ID);
  });

  it('finds templates by BoardGameGeek id', () => {
    expect(catalog.forBggId(13).map((template) => template.id)).toEqual(['catan']);
    expect(catalog.forBggId(999_999)).toEqual([]);
  });

  it('lists game-specific templates before the generic ones', () => {
    const listed = catalog.list();
    const firstGeneric = listed.findIndex((template) => template.bggId === undefined);
    const lastSpecific = listed.map((t) => t.bggId !== undefined).lastIndexOf(true);

    expect(lastSpecific).toBeLessThan(firstGeneric);
  });

  it('accepts a valid template added at runtime', () => {
    const extra = new TemplateCatalog();
    const template: ScoreTemplate = {
      id: 'user-made',
      name: 'Hecha en casa',
      categories: [{ key: 'points', label: 'Puntos', input: 'number' }],
    };

    extra.add(template);

    expect(extra.resolve('user-made').name).toBe('Hecha en casa');
  });

  it('refuses a template that would break the engine', () => {
    const extra = new TemplateCatalog();
    const broken: ScoreTemplate = {
      id: 'broken',
      name: 'Rota',
      categories: [{ key: 'points', label: 'Puntos', input: 'number' }],
      tiebreakers: ['nowhere'],
    };

    expect(() => extra.add(broken)).toThrow(/does not match any category/);
    expect(extra.resolve('broken').id).toBe(GENERIC_TEMPLATE_ID);
  });

  it('throws rather than guessing when the generic template is absent', () => {
    const empty = new TemplateCatalog([]);
    expect(() => empty.resolve('anything')).toThrow(/generic template is missing/);
  });
});
