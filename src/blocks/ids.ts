const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Block ids end up in `event_text` keys, so they stay short and lowercase alphanumeric. */
export const BLOCK_ID_PATTERN = /^[a-z0-9]{1,32}$/;

function randomIndexes(count: number): number[] {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(count);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte % ALPHABET.length);
  }
  return Array.from({ length: count }, () => Math.floor(Math.random() * ALPHABET.length));
}

export function createBlockId(taken?: ReadonlySet<string> | Record<string, unknown>): string {
  const isTaken = (id: string) => (taken instanceof Set ? taken.has(id) : !!taken && Object.hasOwn(taken, id));
  for (;;) {
    const id = `b${randomIndexes(9)
      .map((index) => ALPHABET[index])
      .join('')}`;
    if (!isTaken(id)) return id;
  }
}
