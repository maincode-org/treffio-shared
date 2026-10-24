import { isBlankHtml, stripHtml } from './html';
import { textKeyForBlock } from './keys';
import { BLOCK_DEFINITIONS } from './registry';
import { readLocalized, type TextMap } from './texts';
import { orderedBlockIds } from './tree';
import type { BlockDocument, BlockNode, Locale } from './types';

type ReadOptions = { ownerKey: string; texts: TextMap; lang: Locale; fallbacks?: readonly Locale[] };

function read(block: BlockNode, field: 'html' | 'label' | 'src', options: ReadOptions): string {
  return readLocalized(options.texts[textKeyForBlock(options.ownerKey, block, field)], options.lang, options.fallbacks ?? []);
}

/** Whether a block shows anything to the recipient in this language. Spacers and dividers do not count. */
export function blockHasContent(block: BlockNode, options: ReadOptions): boolean {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'classic':
      return !isBlankHtml(read(block, 'html', options));
    case 'button':
      return read(block, 'label', options).trim().length > 0;
    case 'image':
      return read(block, 'src', options).trim().length > 0;
    default:
      return false;
  }
}

/** True when nothing in the document would show text, a button or an image. */
export function isDocumentEmpty(document: BlockDocument, options: ReadOptions): boolean {
  return !orderedBlockIds(document).some((id) => {
    const block = document.blocks[id];
    return !!block && blockHasContent(block, options);
  });
}

/** Text of the document in render order, for previews, search and plain-text fallbacks. */
export function documentPlainText(document: BlockDocument, options: ReadOptions): string {
  const parts: string[] = [];
  for (const id of orderedBlockIds(document)) {
    const block = document.blocks[id];
    if (!block) continue;
    if (block.type === 'heading' || block.type === 'text' || block.type === 'classic') {
      const text = stripHtml(read(block, 'html', options));
      if (text) parts.push(text);
    } else if (block.type === 'button') {
      const label = read(block, 'label', options).trim();
      if (label) parts.push(label);
    }
  }
  return parts.join('\n\n');
}

/** Copy the texts of duplicated blocks to their new ids, for every language. */
export function copyBlockTexts(texts: TextMap, ownerKey: string, document: BlockDocument, idMap: ReadonlyMap<string, string>): TextMap {
  let next = texts;
  for (const [oldId, newId] of idMap) {
    const block = document.blocks[newId] ?? document.blocks[oldId];
    if (!block) continue;
    for (const { field } of BLOCK_DEFINITIONS[block.type].textFields) {
      const source = texts[textKeyForBlock(ownerKey, { id: oldId, type: block.type }, field)];
      if (!source) continue;
      const targetKey = textKeyForBlock(ownerKey, { id: newId, type: block.type }, field);
      if (next === texts) next = { ...texts };
      next[targetKey] = { ...source };
    }
  }
  return next;
}
