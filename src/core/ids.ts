/**
 * Sortable, collision-resistant identifiers (ULID layout: 48-bit timestamp +
 * 80 bits of randomness, Crockford base32).
 *
 * Sortability is not cosmetic here. Score entries converge with last-write-wins
 * and two devices can stamp the same millisecond, so the id itself is the
 * tiebreaker. A lexicographically sortable id makes that comparison total,
 * deterministic and identical on every device.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export type RandomBytes = (size: number) => Uint8Array;
export type Clock = () => number;

function defaultRandomBytes(size: number): Uint8Array {
  const buffer = new Uint8Array(size);
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(buffer);
    return buffer;
  }
  for (let i = 0; i < size; i += 1) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

function encodeTime(time: number, length: number): string {
  let remaining = time;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const mod = remaining % ENCODING_LEN;
    out = ENCODING.charAt(mod) + out;
    remaining = (remaining - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(length: number, randomBytes: RandomBytes): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    // 256 is an exact multiple of 32, so the modulo introduces no bias.
    out += ENCODING.charAt((bytes[i] ?? 0) % ENCODING_LEN);
  }
  return out;
}

function increment(random: string, randomBytes: RandomBytes): string {
  const chars = random.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const index = ENCODING.indexOf(chars[i] ?? '');
    if (index >= 0 && index < ENCODING_LEN - 1) {
      chars[i] = ENCODING.charAt(index + 1);
      return chars.join('');
    }
    chars[i] = ENCODING.charAt(0);
  }
  // Every character overflowed: 80 bits exhausted inside one millisecond. Not
  // reachable in practice, but we still have to return something valid.
  return encodeRandom(random.length, randomBytes);
}

export interface IdFactoryOptions {
  readonly clock?: Clock;
  readonly randomBytes?: RandomBytes;
}

/**
 * Builds an id generator. Monotonic: ids created within the same millisecond
 * still sort in creation order. Injectable clock and randomness make it
 * deterministic under test.
 */
export function createIdFactory(options: IdFactoryOptions = {}) {
  const clock = options.clock ?? Date.now;
  const randomBytes = options.randomBytes ?? defaultRandomBytes;
  let lastTime = -1;
  let lastRandom = '';

  return function newId(prefix?: string): string {
    const now = clock();
    if (now <= lastTime && lastRandom !== '') {
      lastRandom = increment(lastRandom, randomBytes);
    } else {
      lastTime = now;
      lastRandom = encodeRandom(RANDOM_LEN, randomBytes);
    }
    const id = encodeTime(lastTime, TIME_LEN) + lastRandom;
    return prefix === undefined ? id : `${prefix}_${id}`;
  };
}

export const newId = createIdFactory();

/** Human-friendly code used to join a match from another device. */
const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

export function newJoinCode(length = 4, randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += JOIN_ALPHABET.charAt((bytes[i] ?? 0) % JOIN_ALPHABET.length);
  }
  return out;
}
