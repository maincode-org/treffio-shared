import { BLOCK_ID_PATTERN } from './ids';
import { BLOCK_DEFINITIONS, PADDING_MAX, columnCount, defaultSideInset, isBlockType, parseBlockProps, parseBlockStyle } from './registry';
import {
  BLOCK_DOCUMENT_VERSION,
  SURFACES,
  type BlockDocument,
  type BlockNode,
  type BlockType,
  type RootStyle,
  type Surface,
} from './types';

export const MAX_BLOCKS_PER_DOCUMENT = 250;

export type ParseDocumentResult =
  | { ok: true; document: BlockDocument; issues: string[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function defaultRootStyle(surface: Surface): RootStyle {
  return { paddingTop: 24, paddingBottom: 8, paddingX: defaultSideInset(surface), showFooter: true };
}

function parseRootStyle(raw: unknown, surface: Surface): RootStyle {
  const fallback = defaultRootStyle(surface);
  if (!isRecord(raw)) return fallback;
  return {
    paddingTop: clampInt(raw.paddingTop, 0, PADDING_MAX, fallback.paddingTop),
    paddingBottom: clampInt(raw.paddingBottom, 0, PADDING_MAX, fallback.paddingBottom),
    paddingX: clampInt(raw.paddingX, 0, PADDING_MAX, fallback.paddingX),
    showFooter: typeof raw.showFooter === 'boolean' ? raw.showFooter : fallback.showFooter,
  };
}

function opensWithImage(document: BlockDocument): boolean {
  const firstId = document.root.childIds[0];
  return !!firstId && document.blocks[firstId]?.type === 'image';
}

/**
 * Follows a structural edit with a sensible top spacing: none when an image becomes the opening
 * block (a banner sits flush), the default again when something else takes its place. A value the
 * user changed from those defaults is left alone.
 */
export function adjustTopSpacing(previous: BlockDocument, next: BlockDocument): BlockDocument {
  const before = opensWithImage(previous);
  const after = opensWithImage(next);
  if (before === after) return next;
  const defaultTop = defaultRootStyle(next.surface).paddingTop;
  const current = next.root.style.paddingTop;
  const target = after ? (current === defaultTop ? 0 : current) : current === 0 ? defaultTop : current;
  if (target === current) return next;
  return { ...next, root: { ...next.root, style: { ...next.root.style, paddingTop: target } } };
}

/** Images saved before `style.fullWidth` existed marked edge-to-edge with `props.fullBleed`. */
function legacyFullBleed(rawBlock: Record<string, unknown>): boolean {
  const style = rawBlock.style;
  if (isRecord(style) && typeof style.fullWidth === 'boolean') return false;
  return rawBlock.type === 'image' && isRecord(rawBlock.props) && rawBlock.props.fullBleed === true;
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Validate and normalize a stored or submitted document. Unknown props get defaults, broken
 * references are dropped and listed in `issues`, so callers can reject edits that lost content.
 */
export function parseBlockDocument(raw: unknown, expectedSurface?: Surface): ParseDocumentResult {
  if (!isRecord(raw)) return { ok: false, error: 'Document must be an object' };
  if (raw.version !== BLOCK_DOCUMENT_VERSION) return { ok: false, error: `Unsupported document version: ${String(raw.version)}` };

  const surface = raw.surface;
  if (typeof surface !== 'string' || !(SURFACES as readonly string[]).includes(surface)) {
    return { ok: false, error: 'Unknown document surface' };
  }
  if (expectedSurface && surface !== expectedSurface) {
    return { ok: false, error: `Expected a ${expectedSurface} document` };
  }
  const typedSurface = surface as Surface;

  if (!isRecord(raw.root)) return { ok: false, error: 'Document has no root' };
  if (!isRecord(raw.blocks)) return { ok: false, error: 'Document has no blocks' };

  const rawBlocks = raw.blocks;
  if (Object.keys(rawBlocks).length > MAX_BLOCKS_PER_DOCUMENT) {
    return { ok: false, error: `A document can hold at most ${MAX_BLOCKS_PER_DOCUMENT} blocks` };
  }

  const issues: string[] = [];
  const blocks: Record<string, BlockNode> = {};
  const seen = new Set<string>();
  let hasClassic = false;

  const takeBlock = (id: string, insideContainer: boolean): BlockNode | null => {
    if (seen.has(id)) {
      issues.push(`Block ${id} is placed twice`);
      return null;
    }
    const rawBlock = rawBlocks[id];
    if (!BLOCK_ID_PATTERN.test(id) || !isRecord(rawBlock)) {
      issues.push(`Block ${id} is missing or invalid`);
      return null;
    }
    const type = rawBlock.type;
    if (!isBlockType(type)) {
      issues.push(`Block ${id} has unknown type ${String(type)}`);
      return null;
    }
    const definition = BLOCK_DEFINITIONS[type];
    if (!definition.surfaces.includes(typedSurface)) {
      issues.push(`Block ${id} (${type}) is not allowed in ${typedSurface}`);
      return null;
    }
    if (insideContainer && definition.container) {
      issues.push(`Block ${id} (${type}) cannot be nested in another container`);
      return null;
    }
    if (type === 'classic' && hasClassic) {
      issues.push(`Block ${id} is a second classic block`);
      return null;
    }
    if (type === 'classic') hasClassic = true;
    seen.add(id);

    const node = {
      id,
      type,
      props: parseBlockProps(type, rawBlock.props),
      style: parseBlockStyle(type, typedSurface, rawBlock.style),
    } as BlockNode;
    if (legacyFullBleed(rawBlock)) node.style = { ...node.style, fullWidth: true };

    if (definition.container && node.type === 'columns') {
      const count = columnCount(node.props.layout);
      const rawRegions = Array.isArray(rawBlock.children) ? rawBlock.children : [];
      const regions: string[][] = Array.from({ length: count }, () => []);
      rawRegions.forEach((region, index) => {
        const target = regions[Math.min(index, count - 1)];
        if (!target) return;
        for (const childId of stringArray(region)) {
          if (takeBlock(childId, true)) target.push(childId);
        }
      });
      node.children = regions;
    }

    blocks[id] = node;
    return node;
  };

  const childIds: string[] = [];
  for (const id of stringArray(raw.root.childIds)) {
    if (takeBlock(id, false)) childIds.push(id);
  }

  for (const id of Object.keys(rawBlocks)) {
    if (!seen.has(id)) issues.push(`Block ${id} is not placed in the document`);
  }

  return {
    ok: true,
    document: {
      version: BLOCK_DOCUMENT_VERSION,
      surface: typedSurface,
      root: { childIds, style: parseRootStyle(raw.root.style, typedSurface) },
      blocks,
    },
    issues,
  };
}

export function createEmptyDocument(surface: Surface): BlockDocument {
  return { version: BLOCK_DOCUMENT_VERSION, surface, root: { childIds: [], style: defaultRootStyle(surface) }, blocks: {} };
}

export function blockTypesInDocument(document: BlockDocument): Set<BlockType> {
  return new Set(Object.values(document.blocks).map((block) => block.type));
}
