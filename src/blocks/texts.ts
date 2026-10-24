import { textKeyForBlock } from './keys';
import type { TextField } from './registry';
import { LOCALES, type BlockNode, type Locale } from './types';

/** One `event_text` row: a value per language column. */
export type LocalizedText = Partial<Record<Locale, string | null>>;

/** `event_text` rows by key. */
export type TextMap = Record<string, LocalizedText>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The value in `lang`, else in the fallback languages in order, else ''. */
export function readLocalized(entry: LocalizedText | undefined, lang: Locale, fallbacks: readonly Locale[] = []): string {
  if (!entry) return '';
  const own = entry[lang];
  if (present(own)) return own;
  for (const fallback of fallbacks) {
    const value = entry[fallback];
    if (present(value)) return value;
  }
  return '';
}

export function hasOwnTranslation(entry: LocalizedText | undefined, lang: Locale): boolean {
  return present(entry?.[lang]);
}

export function readBlockText(
  texts: TextMap,
  ownerKey: string,
  block: Pick<BlockNode, 'id' | 'type'>,
  field: TextField,
  lang: Locale,
  fallbacks: readonly Locale[] = []
): string {
  return readLocalized(texts[textKeyForBlock(ownerKey, block, field)], lang, fallbacks);
}

/** Copy of `texts` with one language cell set. Empty strings are stored as '' so clearing is a real change. */
export function writeLocalized(texts: TextMap, key: string, lang: Locale, value: string): TextMap {
  const current = texts[key] ?? {};
  if ((current[lang] ?? '') === value) return texts;
  return { ...texts, [key]: { ...current, [lang]: value } };
}

/** Cells that differ between two maps, for saving only what changed. */
export function diffTextMaps(before: TextMap, after: TextMap): { key: string; lang: Locale; value: string }[] {
  const changes: { key: string; lang: Locale; value: string }[] = [];
  for (const [key, entry] of Object.entries(after)) {
    const previous = before[key] ?? {};
    for (const lang of LOCALES) {
      const next = entry[lang] ?? '';
      if (next !== (previous[lang] ?? '')) changes.push({ key, lang, value: next });
    }
  }
  return changes;
}
