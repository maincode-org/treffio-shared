import { BLOCK_DEFINITIONS } from './registry';
import { createBlock } from './tree';
import { BLOCK_DOCUMENT_VERSION, type BlockDocument, type Surface } from './types';

export const CLASSIC_BLOCK_ID = 'classic';

/**
 * The document an item without a stored document behaves as: one Classic block that reads the
 * owner's existing `.content` text. Rendering this must match the pre-block output.
 */
export function createLegacyDocument(surface: Surface, options?: { edgeToEdgeFirstImage?: boolean }): BlockDocument {
  const classic = createBlock('classic', surface, {
    id: CLASSIC_BLOCK_ID,
    props: { edgeToEdgeFirstImage: options?.edgeToEdgeFirstImage === true },
  });
  return {
    version: BLOCK_DOCUMENT_VERSION,
    surface,
    root: { childIds: [classic.id], style: { paddingTop: 0, paddingBottom: 0 } },
    blocks: { [classic.id]: classic },
  };
}

/** True when the document is nothing but legacy content, so the stored `.content` text alone describes it. */
export function isLegacyOnlyDocument(document: BlockDocument): boolean {
  const ids = document.root.childIds;
  if (ids.length !== 1) return false;
  const only = ids[0] ? document.blocks[ids[0]] : undefined;
  if (only?.type !== 'classic') return false;
  const defaults = BLOCK_DEFINITIONS.classic.defaultStyle(document.surface);
  const padding = only.style.padding;
  return (
    document.root.style.paddingTop === 0 &&
    document.root.style.paddingBottom === 0 &&
    only.style.backgroundColor === null &&
    padding.top === defaults.padding.top &&
    padding.right === defaults.padding.right &&
    padding.bottom === defaults.padding.bottom &&
    padding.left === defaults.padding.left
  );
}

export function hasClassicBlock(document: BlockDocument): boolean {
  return Object.values(document.blocks).some((block) => block.type === 'classic');
}
