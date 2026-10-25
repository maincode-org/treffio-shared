import { createBlockId } from './ids';
import { BLOCK_DEFINITIONS, columnCount, regionCount } from './registry';
import {
  ROOT_PARENT_ID,
  type BlockDocument,
  type BlockLocation,
  type BlockNode,
  type BlockPropsByType,
  type BlockStyle,
  type BlockType,
  type ColumnsLayout,
  type Surface,
} from './types';

export function createBlock<T extends BlockType>(
  type: T,
  surface: Surface,
  options?: { id?: string; props?: Partial<BlockPropsByType[T]>; style?: Partial<BlockStyle>; taken?: Record<string, unknown> }
): BlockNode {
  const definition = BLOCK_DEFINITIONS[type];
  const props = { ...definition.defaultProps(), ...options?.props };
  const style = { ...definition.defaultStyle(surface), ...options?.style };
  const node = { id: options?.id ?? createBlockId(options?.taken), type, props, style } as BlockNode;
  if (definition.container) {
    node.children = Array.from({ length: regionCount(node) }, () => []);
  }
  return node;
}

function regionOf(document: BlockDocument, parentId: string, region: number): string[] | undefined {
  if (parentId === ROOT_PARENT_ID) return region === 0 ? document.root.childIds : undefined;
  return document.blocks[parentId]?.children?.[region];
}

function withRegion(document: BlockDocument, parentId: string, region: number, ids: string[]): BlockDocument {
  if (parentId === ROOT_PARENT_ID) {
    return { ...document, root: { ...document.root, childIds: ids } };
  }
  const parent = document.blocks[parentId];
  if (!parent?.children) return document;
  const children = parent.children.map((current, index) => (index === region ? ids : current));
  return { ...document, blocks: { ...document.blocks, [parentId]: { ...parent, children } } };
}

export function findBlockLocation(document: BlockDocument, blockId: string): BlockLocation | null {
  const rootIndex = document.root.childIds.indexOf(blockId);
  if (rootIndex >= 0) return { parentId: ROOT_PARENT_ID, region: 0, index: rootIndex };
  for (const block of Object.values(document.blocks)) {
    if (!block.children) continue;
    for (let region = 0; region < block.children.length; region++) {
      const index = block.children[region]?.indexOf(blockId) ?? -1;
      if (index >= 0) return { parentId: block.id, region, index };
    }
  }
  return null;
}

/** Ids in render order, depth first. */
export function orderedBlockIds(document: BlockDocument): string[] {
  const ids: string[] = [];
  const visit = (list: readonly string[]) => {
    for (const id of list) {
      const block = document.blocks[id];
      if (!block) continue;
      ids.push(id);
      for (const region of block.children ?? []) visit(region);
    }
  };
  visit(document.root.childIds);
  return ids;
}

function descendantIds(document: BlockDocument, blockId: string): string[] {
  const block = document.blocks[blockId];
  if (!block?.children) return [];
  return block.children.flatMap((region) => region.flatMap((id) => [id, ...descendantIds(document, id)]));
}

export function insertBlock(document: BlockDocument, block: BlockNode, location: BlockLocation): BlockDocument {
  const region = regionOf(document, location.parentId, location.region);
  if (!region) return document;
  const index = Math.max(0, Math.min(region.length, location.index));
  const next = withRegion(document, location.parentId, location.region, [...region.slice(0, index), block.id, ...region.slice(index)]);
  return { ...next, blocks: { ...next.blocks, [block.id]: block } };
}

/** Removes a block and everything inside it. Returns the ids that left the document. */
export function removeBlock(document: BlockDocument, blockId: string): { document: BlockDocument; removedIds: string[] } {
  const location = findBlockLocation(document, blockId);
  if (!location) return { document, removedIds: [] };
  const region = regionOf(document, location.parentId, location.region) ?? [];
  const removedIds = [blockId, ...descendantIds(document, blockId)];
  const next = withRegion(
    document,
    location.parentId,
    location.region,
    region.filter((id) => id !== blockId)
  );
  const blocks = { ...next.blocks };
  for (const id of removedIds) delete blocks[id];
  return { document: { ...next, blocks }, removedIds };
}

export function canMoveBlock(document: BlockDocument, blockId: string, direction: -1 | 1): boolean {
  const location = findBlockLocation(document, blockId);
  if (!location) return false;
  const region = regionOf(document, location.parentId, location.region) ?? [];
  const target = location.index + direction;
  return target >= 0 && target < region.length;
}

/** Swap with the previous or next sibling. */
export function moveBlock(document: BlockDocument, blockId: string, direction: -1 | 1): BlockDocument {
  const location = findBlockLocation(document, blockId);
  if (!location || !canMoveBlock(document, blockId, direction)) return document;
  const region = [...(regionOf(document, location.parentId, location.region) ?? [])];
  const target = location.index + direction;
  const other = region[target];
  if (other === undefined) return document;
  region[target] = blockId;
  region[location.index] = other;
  return withRegion(document, location.parentId, location.region, region);
}

/**
 * Deep copy placed right after the original. `idMap` maps every copied id to its new id so the
 * caller can copy the block texts too.
 */
export function duplicateBlock(document: BlockDocument, blockId: string): { document: BlockDocument; idMap: Map<string, string>; newId: string | null } {
  const location = findBlockLocation(document, blockId);
  const original = document.blocks[blockId];
  if (!location || !original) return { document, idMap: new Map(), newId: null };

  const idMap = new Map<string, string>();
  const taken: Record<string, unknown> = { ...document.blocks };
  const copies: Record<string, BlockNode> = {};

  const copy = (id: string): string => {
    const source = document.blocks[id];
    const newId = createBlockId(taken);
    taken[newId] = true;
    idMap.set(id, newId);
    if (!source) return newId;
    const cloned = structuredClone(source);
    cloned.id = newId;
    if (cloned.children) cloned.children = cloned.children.map((region) => region.map(copy));
    copies[newId] = cloned;
    return newId;
  };

  const newId = copy(blockId);
  const region = regionOf(document, location.parentId, location.region) ?? [];
  const nextRegion = [...region.slice(0, location.index + 1), newId, ...region.slice(location.index + 1)];
  const next = withRegion(document, location.parentId, location.region, nextRegion);
  return { document: { ...next, blocks: { ...next.blocks, ...copies } }, idMap, newId };
}

export function updateBlockProps<T extends BlockType>(
  document: BlockDocument,
  blockId: string,
  type: T,
  patch: Partial<BlockPropsByType[T]>
): BlockDocument {
  const block = document.blocks[blockId];
  if (!block || block.type !== type) return document;
  const updated = { ...block, props: { ...block.props, ...patch } } as BlockNode;
  return { ...document, blocks: { ...document.blocks, [blockId]: updated } };
}

export function updateBlockStyle(document: BlockDocument, blockId: string, patch: Partial<BlockStyle>): BlockDocument {
  const block = document.blocks[blockId];
  if (!block) return document;
  const updated = { ...block, style: { ...block.style, ...patch } } as BlockNode;
  return { ...document, blocks: { ...document.blocks, [blockId]: updated } };
}

/** Change the column layout. Blocks in dropped columns move into the last remaining column. */
export function setColumnsLayout(document: BlockDocument, blockId: string, layout: ColumnsLayout): BlockDocument {
  const block = document.blocks[blockId];
  if (!block || block.type !== 'columns') return document;
  const count = columnCount(layout);
  const current = block.children ?? [];
  const regions: string[][] = Array.from({ length: count }, (_, index) => [...(current[index] ?? [])]);
  const overflow = current.slice(count).flat();
  const last = regions[count - 1];
  if (last && overflow.length > 0) last.push(...overflow);
  const updated: BlockNode = { ...block, props: { ...block.props, layout }, children: regions };
  return { ...document, blocks: { ...document.blocks, [blockId]: updated } };
}

export function isInsideContainer(document: BlockDocument, blockId: string): boolean {
  const location = findBlockLocation(document, blockId);
  return !!location && location.parentId !== ROOT_PARENT_ID;
}
