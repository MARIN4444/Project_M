/**
 * Scoresheets that ship with the app.
 *
 * These are written in TypeScript rather than loaded from JSON so the compiler
 * checks them: a typo in a category key or a tiebreaker pointing nowhere fails
 * the build instead of the game night. Templates fetched or written by users
 * arrive as plain data and go through `validateTemplate` at runtime instead.
 *
 * Labels are user-facing, so they are written in Spanish like the rest of the
 * interface. Keys are stable identifiers and stay in English.
 */

import type { ScoreTemplate } from '@/core/template';

/** Works for any game at all: one number per player. Never remove this. */
export const GENERIC_TEMPLATE_ID = 'generic-simple';
export const GENERIC_ROUNDS_TEMPLATE_ID = 'generic-rounds';

const generic: ScoreTemplate = {
  id: GENERIC_TEMPLATE_ID,
  name: 'Puntuación simple',
  categories: [{ key: 'points', label: 'Puntos', input: 'number' }],
};

const genericRounds: ScoreTemplate = {
  id: GENERIC_ROUNDS_TEMPLATE_ID,
  name: 'Puntuación por rondas',
  rounds: true,
  categories: [
    {
      key: 'points',
      label: 'Puntos de la ronda',
      input: 'number',
      perRound: true,
      help: 'Se suma a lo anotado en rondas anteriores.',
    },
  ],
};

const genericLowest: ScoreTemplate = {
  id: 'generic-lowest',
  name: 'Puntuación simple (gana el más bajo)',
  lowestWins: true,
  categories: [{ key: 'points', label: 'Puntos', input: 'number' }],
};

const catan: ScoreTemplate = {
  id: 'catan',
  name: 'Catán',
  bggId: 13,
  categories: [
    { key: 'settlements', label: 'Poblados', input: 'counter', multiplier: 1 },
    { key: 'cities', label: 'Ciudades', input: 'counter', multiplier: 2 },
    { key: 'longest-road', label: 'Ruta comercial más larga', input: 'toggle', multiplier: 2 },
    { key: 'largest-army', label: 'Ejército más grande', input: 'toggle', multiplier: 2 },
    { key: 'vp-cards', label: 'Cartas de punto de victoria', input: 'counter', multiplier: 1 },
  ],
};

const carcassonne: ScoreTemplate = {
  id: 'carcassonne',
  name: 'Carcassonne',
  bggId: 822,
  categories: [
    {
      key: 'during-game',
      label: 'Puntos durante la partida',
      input: 'number',
      help: 'Lo que ya fuisteis marcando en el track.',
    },
    { key: 'roads', label: 'Caminos sin terminar', input: 'number' },
    { key: 'cities', label: 'Ciudades sin terminar', input: 'number' },
    { key: 'monasteries', label: 'Monasterios sin terminar', input: 'number' },
    { key: 'farmers', label: 'Granjeros', input: 'number' },
  ],
};

const ticketToRide: ScoreTemplate = {
  id: 'ticket-to-ride',
  name: 'Aventureros al Tren',
  bggId: 9209,
  categories: [
    { key: 'routes', label: 'Rutas construidas', input: 'number' },
    { key: 'tickets-done', label: 'Billetes completados', input: 'number' },
    {
      key: 'tickets-failed',
      label: 'Billetes fallidos',
      input: 'number',
      multiplier: -1,
      help: 'Introduce el valor en positivo; se resta solo.',
    },
    { key: 'longest-route', label: 'Ruta continua más larga', input: 'toggle', multiplier: 10 },
  ],
};

const azul: ScoreTemplate = {
  id: 'azul',
  name: 'Azul',
  bggId: 230802,
  categories: [
    { key: 'during-game', label: 'Puntuación durante la partida', input: 'number' },
    { key: 'rows', label: 'Filas completas', input: 'counter', multiplier: 2 },
    { key: 'columns', label: 'Columnas completas', input: 'counter', multiplier: 7 },
    { key: 'colours', label: 'Colores completos (5 azulejos)', input: 'counter', multiplier: 10 },
  ],
};

const wingspan: ScoreTemplate = {
  id: 'wingspan',
  name: 'Wingspan',
  bggId: 266192,
  categories: [
    { key: 'birds', label: 'Aves', input: 'number' },
    { key: 'bonus-cards', label: 'Cartas de bonificación', input: 'number' },
    { key: 'round-goals', label: 'Objetivos de ronda', input: 'number' },
    { key: 'eggs', label: 'Huevos', input: 'counter' },
    { key: 'cached-food', label: 'Comida almacenada', input: 'counter' },
    { key: 'tucked-cards', label: 'Cartas guardadas', input: 'counter' },
  ],
  tiebreakers: ['bonus-cards'],
};

const terraformingMars: ScoreTemplate = {
  id: 'terraforming-mars',
  name: 'Terraforming Mars',
  bggId: 167791,
  categories: [
    {
      key: 'terraform-rating',
      label: 'Puntuación de terraformación',
      input: 'number',
      defaultValue: 20,
      help: 'Todo el mundo empieza en 20.',
    },
    { key: 'awards', label: 'Premios', input: 'number' },
    { key: 'milestones', label: 'Hitos reclamados', input: 'counter', multiplier: 5 },
    { key: 'card-vp', label: 'Puntos de cartas', input: 'number' },
    { key: 'cities', label: 'Ciudades', input: 'number' },
    { key: 'greeneries', label: 'Zonas verdes', input: 'counter' },
    {
      key: 'megacredits',
      label: 'Megacréditos',
      input: 'number',
      excludeFromTotal: true,
      help: 'No suma puntos; solo desempata.',
    },
  ],
  tiebreakers: ['megacredits'],
};

export const BUILTIN_TEMPLATES: readonly ScoreTemplate[] = [
  generic,
  genericRounds,
  genericLowest,
  azul,
  carcassonne,
  catan,
  terraformingMars,
  ticketToRide,
  wingspan,
];
