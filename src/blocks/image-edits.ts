import { z } from 'zod';
import { normalizeColor } from './colors';

/** Shapes an image edge can be cut into. The same shapes as the page banner decorations. */
export const EDGE_SHAPES = ['wave', 'waves', 'tilt', 'arrow', 'triangle', 'book'] as const;
export type EdgeShape = (typeof EDGE_SHAPES)[number];

/** Edge shape height in percent of the image width. */
export const EDGE_SHAPE_SIZE = { min: 2, max: 25, default: 8 } as const;

export type EdgeShapeEdit = { shape: EdgeShape; size: number; flip: boolean };

/**
 * `background` paints the cut-away part in `color` (the color behind the image), so the file can stay
 * a small JPEG. `transparent` cuts it out, which needs a (larger) PNG.
 */
export const EDGE_FILLS = ['background', 'transparent'] as const;
export type EdgeFill = (typeof EDGE_FILLS)[number];

export type EdgeEdits = { top: EdgeShapeEdit | null; bottom: EdgeShapeEdit | null; fill: EdgeFill; color: string | null };

/** Edits baked into an image file. New kinds of edits are added as optional fields. */
export type ImageEdits = { edges?: EdgeEdits };

/**
 * A block's image edits, and the original of every edited file (edited URL -> original URL), so the
 * edits can be changed or removed. Keyed by URL, it covers each language's image.
 */
export type ImageEditState = { edits: ImageEdits; originals: Record<string, string> };

const MAX_ORIGINALS = 50;

const edgeSchema = z
  .object({
    shape: z.enum(EDGE_SHAPES),
    size: z
      .number()
      .catch(EDGE_SHAPE_SIZE.default)
      .transform((value) => Math.min(EDGE_SHAPE_SIZE.max, Math.max(EDGE_SHAPE_SIZE.min, Number.isFinite(value) ? value : EDGE_SHAPE_SIZE.default))),
    flip: z.boolean().catch(false),
  })
  .nullable()
  .catch(null);

const edgesSchema = z.object({
  top: edgeSchema,
  bottom: edgeSchema,
  fill: z.enum(EDGE_FILLS).catch('background'),
  color: z
    .string()
    .nullable()
    .catch(null)
    .transform((value) => normalizeColor(value)),
});

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

export const imageEditStateSchema = z
  .object({
    edits: z.object({ edges: edgesSchema.optional().catch(undefined) }).catch({}),
    originals: z
      .record(z.string(), z.string())
      .catch({})
      .transform((map) => Object.fromEntries(Object.entries(map).filter(([edited, original]) => isHttpUrl(edited) && isHttpUrl(original)).slice(0, MAX_ORIGINALS))),
  })
  .nullable()
  .catch(null);

/** Whether the edits change anything. */
export function hasImageEdits(edits: ImageEdits | null | undefined): boolean {
  return !!edits?.edges && (!!edits.edges.top || !!edits.edges.bottom);
}

/** The original of `url` when it is an edited file, else `url` itself. */
export function originalImageUrl(state: ImageEditState | null | undefined, url: string): string {
  return state?.originals[url] ?? url;
}
