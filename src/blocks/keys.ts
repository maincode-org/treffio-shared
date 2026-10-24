import { BLOCK_DEFINITIONS, type TextField } from './registry';
import type { BlockDocument, BlockNode } from './types';

/**
 * Every email, message and page has an owner key: the `event_text` prefix of its content.
 * `communication.{id}`, `email.invitation`, `event-message-override.{id}`, `page.{id}`.
 * Subject, preheader, legacy content and block texts all live below it.
 */
export const OWNER_KEY_PATTERN = /^(?:communication\.[0-9a-f-]{36}|event-message-override\.[0-9a-f-]{36}|page\.[0-9a-f-]{36}|email\.[a-z_]+)$/i;

export function isOwnerKey(value: string): boolean {
  return OWNER_KEY_PATTERN.test(value);
}

/** `email.invitation.content` → `email.invitation`. */
export function ownerKeyFromContentKey(contentKey: string): string {
  return contentKey.replace(/\.content$/, '');
}

export function legacyContentKey(ownerKey: string): string {
  return `${ownerKey}.content`;
}

export function subjectKey(ownerKey: string): string {
  return `${ownerKey}.subject`;
}

export function preheaderKey(ownerKey: string): string {
  return `${ownerKey}.preheader`;
}

export function rawHtmlOverrideKey(ownerKey: string): string {
  return `${ownerKey}.raw_html_override`;
}

const BLOCK_SEGMENT = '.block.';

export function blockTextKeyPrefix(ownerKey: string): string {
  return `${ownerKey}${BLOCK_SEGMENT}`;
}

export function blockTextKey(ownerKey: string, blockId: string, field: TextField): string {
  return `${ownerKey}${BLOCK_SEGMENT}${blockId}.${field}`;
}

/** The `event_text` key that holds a block field. Classic blocks read the owner's legacy content. */
export function textKeyForBlock(ownerKey: string, block: Pick<BlockNode, 'id' | 'type'>, field: TextField): string {
  if (block.type === 'classic' && field === 'html') return legacyContentKey(ownerKey);
  return blockTextKey(ownerKey, block.id, field);
}

export function parseBlockTextKey(ownerKey: string, key: string): { blockId: string; field: string } | null {
  const prefix = blockTextKeyPrefix(ownerKey);
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return null;
  return { blockId: rest.slice(0, dot), field: rest.slice(dot + 1) };
}

/** Every `event_text` key the document reads, in render order. */
export function documentTextKeys(document: BlockDocument, ownerKey: string): string[] {
  const keys: string[] = [];
  const visit = (ids: readonly string[]) => {
    for (const id of ids) {
      const block = document.blocks[id];
      if (!block) continue;
      for (const { field } of BLOCK_DEFINITIONS[block.type].textFields) {
        keys.push(textKeyForBlock(ownerKey, block, field));
      }
      for (const region of block.children ?? []) visit(region);
    }
  };
  visit(document.root.childIds);
  return keys;
}

/** Block text keys under the owner that the document no longer uses. */
export function orphanedBlockTextKeys(document: BlockDocument, ownerKey: string, existingKeys: Iterable<string>): string[] {
  const used = new Set(documentTextKeys(document, ownerKey));
  const prefix = blockTextKeyPrefix(ownerKey);
  const orphans: string[] = [];
  for (const key of existingKeys) {
    if (key.startsWith(prefix) && !used.has(key)) orphans.push(key);
  }
  return orphans;
}
