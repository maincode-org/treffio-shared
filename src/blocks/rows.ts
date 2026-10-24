import { documentPlainText, isDocumentEmpty } from './content';
import { legacyContentKey } from './keys';
import type { TextMap } from './texts';
import { LOCALES, type BlockDocument, type Locale } from './types';

/** The shape of an `event_text` row this package needs. */
export type TextRowLike = { key: string; en?: string | null; da?: string | null; de?: string | null; swe?: string | null };

/** `event_text` rows below an owner key, as a text map. */
export function textMapFromRows(rows: readonly TextRowLike[] | null | undefined, ownerKey: string): TextMap {
  const prefix = `${ownerKey}.`;
  const texts: TextMap = {};
  for (const row of rows ?? []) {
    if (!row.key.startsWith(prefix)) continue;
    texts[row.key] = { en: row.en ?? null, da: row.da ?? null, de: row.de ?? null, swe: row.swe ?? null };
  }
  return texts;
}

function bodySummary(document: BlockDocument, ownerKey: string, texts: TextMap, lang: Locale): string {
  const options = { ownerKey, texts, lang, fallbacks: [] };
  if (isDocumentEmpty(document, options)) return '';
  const text = documentPlainText(document, options);
  return text.length >= 3 ? text : `${text} [blocks]`.trim();
}

/**
 * Copy of `rows` where every owner with a block document gets a `{owner}.content` row summarizing
 * its blocks per language (empty when that language shows nothing). Checks written for legacy
 * content ("does this email have a body in Danish?") then also understand block emails.
 * Never render from these rows: the summary is plain text.
 */
export function withDocumentBodies<T extends TextRowLike>(rows: readonly T[], documents: ReadonlyMap<string, BlockDocument>): T[] {
  if (documents.size === 0) return [...rows];
  const summaries = new Map<string, TextRowLike>();
  for (const [ownerKey, document] of documents) {
    const texts = textMapFromRows(rows, ownerKey);
    const contentKey = legacyContentKey(ownerKey);
    const summary: TextRowLike = { key: contentKey };
    for (const lang of LOCALES) summary[lang] = bodySummary(document, ownerKey, texts, lang) || null;
    summaries.set(contentKey, summary);
  }

  const result = rows.map((row) => {
    const summary = summaries.get(row.key);
    if (!summary) return row;
    summaries.delete(row.key);
    return { ...row, ...summary };
  });
  for (const summary of summaries.values()) result.push(summary as T);
  return result;
}
