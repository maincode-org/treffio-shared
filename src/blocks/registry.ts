import { z } from 'zod';
import { normalizeColor } from './colors';
import {
  COLUMN_LAYOUTS,
  type BlockDocument,
  type BlockNode,
  type BlockPropsByType,
  type BlockStyle,
  type BlockType,
  type ColumnsLayout,
  type Padding,
  type Surface,
} from './types';

const colorSchema = z
  .string()
  .nullable()
  .catch(null)
  .transform((value) => normalizeColor(value));

const alignSchema = z.enum(['left', 'center', 'right']).catch('left');

const intIn = (min: number, max: number, fallback: number) =>
  z
    .number()
    .catch(fallback)
    .transform((value) => Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback))));

export const PADDING_MAX = 200;

const paddingSchema = (fallback: Padding) =>
  z
    .object({
      top: intIn(0, PADDING_MAX, fallback.top),
      right: intIn(0, PADDING_MAX, fallback.right),
      bottom: intIn(0, PADDING_MAX, fallback.bottom),
      left: intIn(0, PADDING_MAX, fallback.left),
    })
    .catch(fallback);

const styleSchema = (fallback: BlockStyle) =>
  z
    .object({
      padding: paddingSchema(fallback.padding),
      backgroundColor: colorSchema.default(null),
      fullWidth: z.boolean().catch(false).default(false),
    })
    .catch(fallback);

/** Horizontal inset that lines block content up with the legacy email body (570px card, 35px sides). */
export const EMAIL_CONTENT_INSET = 35;

/** Default side spacing of a document (`RootStyle.paddingX`). */
export const defaultSideInset = (surface: Surface) => (surface === 'email' ? EMAIL_CONTENT_INSET : 0);

const padded = (vertical: number): BlockStyle => ({
  padding: { top: vertical, right: 0, bottom: vertical, left: 0 },
  backgroundColor: null,
  fullWidth: false,
});

/**
 * The padding a block renders with: its own top/bottom, the document's side spacing for top-level
 * blocks, none on the sides for full-width blocks and blocks inside columns. An image that opens the
 * document has no space of its own above it, so the document's top spacing alone decides the gap.
 */
export function resolveBlockPadding(block: BlockNode, document: Pick<BlockDocument, 'root'>, nested: boolean): Padding {
  const side = nested || block.style.fullWidth ? 0 : document.root.style.paddingX;
  const opensWithImage = !nested && block.type === 'image' && document.root.childIds[0] === block.id;
  return { top: opensWithImage ? 0 : block.style.padding.top, right: side, bottom: block.style.padding.bottom, left: side };
}

/** A translatable value of a block, stored in `event_text`. */
export type TextField = 'html' | 'label' | 'href' | 'src' | 'alt';

export type TextFieldKind = 'rich' | 'inline' | 'plain' | 'url';

export type BlockDefinition<T extends BlockType = BlockType> = {
  type: T;
  label: string;
  description: string;
  surfaces: readonly Surface[];
  /** Offered in the "+" menu. Classic blocks only come from legacy content. */
  insertable: boolean;
  /** Container blocks hold child blocks in regions (columns). */
  container: boolean;
  textFields: readonly { field: TextField; kind: TextFieldKind; label: string }[];
  propsSchema: z.ZodType<BlockPropsByType[T]>;
  defaultProps: () => BlockPropsByType[T];
  defaultStyle: (surface: Surface) => BlockStyle;
};

const headingProps = (): BlockPropsByType['heading'] => ({ level: 2, align: 'left', color: null });
const textProps = (): BlockPropsByType['text'] => ({ align: 'left', color: null });
const buttonProps = (): BlockPropsByType['button'] => ({
  align: 'left',
  fullWidth: false,
  backgroundColor: null,
  textColor: null,
  radius: 6,
});
const imageProps = (): BlockPropsByType['image'] => ({ width: 100, align: 'center', radius: 0 });
const dividerProps = (): BlockPropsByType['divider'] => ({ color: null, thickness: 1, lineStyle: 'solid' });
const spacerProps = (): BlockPropsByType['spacer'] => ({ height: 24 });
const columnsProps = (): BlockPropsByType['columns'] => ({
  layout: '50-50',
  gap: 16,
  stackOnMobile: true,
  verticalAlign: 'top',
});
const classicProps = (): BlockPropsByType['classic'] => ({ edgeToEdgeFirstImage: false });

const withDefaults = <T extends object>(defaults: () => T, shape: z.ZodRawShape) =>
  z
    .object(shape)
    .partial()
    .catch({})
    .transform((value) => ({ ...defaults(), ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) }) as T);

export const BLOCK_DEFINITIONS: { [T in BlockType]: BlockDefinition<T> } = {
  heading: {
    type: 'heading',
    label: 'Heading',
    description: 'A title or section heading',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: false,
    textFields: [{ field: 'html', kind: 'inline', label: 'Heading' }],
    propsSchema: withDefaults(headingProps, {
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]).catch(2),
      align: alignSchema,
      color: colorSchema,
    }),
    defaultProps: headingProps,
    defaultStyle: () => padded(8),
  },
  text: {
    type: 'text',
    label: 'Text',
    description: 'Paragraphs, lists, links and tags',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: false,
    textFields: [{ field: 'html', kind: 'rich', label: 'Text' }],
    propsSchema: withDefaults(textProps, { align: alignSchema, color: colorSchema }),
    defaultProps: textProps,
    defaultStyle: () => padded(8),
  },
  button: {
    type: 'button',
    label: 'Button',
    description: 'A call to action with a link',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: false,
    textFields: [
      { field: 'label', kind: 'plain', label: 'Button text' },
      { field: 'href', kind: 'url', label: 'Link' },
    ],
    propsSchema: withDefaults(buttonProps, {
      align: alignSchema,
      fullWidth: z.boolean().catch(false),
      backgroundColor: colorSchema,
      textColor: colorSchema,
      radius: intIn(0, 40, 6),
    }),
    defaultProps: buttonProps,
    defaultStyle: () => padded(12),
  },
  image: {
    type: 'image',
    label: 'Image',
    description: 'A picture, optionally linked',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: false,
    textFields: [
      { field: 'src', kind: 'url', label: 'Image' },
      { field: 'alt', kind: 'plain', label: 'Alt text' },
      { field: 'href', kind: 'url', label: 'Link' },
    ],
    propsSchema: withDefaults(imageProps, {
      width: intIn(10, 100, 100),
      align: z.enum(['left', 'center', 'right']).catch('center'),
      radius: intIn(0, 40, 0),
    }),
    defaultProps: imageProps,
    defaultStyle: () => padded(8),
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    description: 'A horizontal line',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: false,
    textFields: [],
    propsSchema: withDefaults(dividerProps, {
      color: colorSchema,
      thickness: intIn(1, 8, 1),
      lineStyle: z.enum(['solid', 'dashed', 'dotted']).catch('solid'),
    }),
    defaultProps: dividerProps,
    defaultStyle: () => padded(16),
  },
  spacer: {
    type: 'spacer',
    label: 'Spacer',
    description: 'Empty vertical space',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: false,
    textFields: [],
    propsSchema: withDefaults(spacerProps, { height: intIn(4, 200, 24) }),
    defaultProps: spacerProps,
    defaultStyle: () => padded(0),
  },
  columns: {
    type: 'columns',
    label: 'Columns',
    description: 'Place blocks side by side',
    surfaces: ['email', 'in_app', 'page'],
    insertable: true,
    container: true,
    textFields: [],
    propsSchema: withDefaults(columnsProps, {
      layout: z.enum(COLUMN_LAYOUTS).catch('50-50'),
      gap: intIn(0, 60, 16),
      stackOnMobile: z.boolean().catch(true),
      verticalAlign: z.enum(['top', 'middle', 'bottom']).catch('top'),
    }),
    defaultProps: columnsProps,
    defaultStyle: () => padded(8),
  },
  classic: {
    type: 'classic',
    label: 'Classic content',
    description: 'Content written before blocks existed',
    surfaces: ['email', 'in_app', 'page'],
    insertable: false,
    container: false,
    textFields: [{ field: 'html', kind: 'rich', label: 'Content' }],
    propsSchema: withDefaults(classicProps, { edgeToEdgeFirstImage: z.boolean().catch(false) }),
    defaultProps: classicProps,
    defaultStyle: (surface) => ({
      padding: { top: defaultSideInset(surface), right: 0, bottom: 0, left: 0 },
      backgroundColor: null,
      fullWidth: false,
    }),
  },
};

export function getBlockDefinition<T extends BlockType>(type: T): BlockDefinition<T> {
  return BLOCK_DEFINITIONS[type];
}

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && Object.hasOwn(BLOCK_DEFINITIONS, value);
}

/** Blocks the "+" menu offers on a surface. Containers cannot be nested in containers. */
export function insertableBlockTypes(surface: Surface, insideContainer: boolean): BlockType[] {
  return (Object.keys(BLOCK_DEFINITIONS) as BlockType[]).filter((type) => {
    const definition = BLOCK_DEFINITIONS[type];
    if (!definition.insertable || !definition.surfaces.includes(surface)) return false;
    return !(insideContainer && definition.container);
  });
}

export function parseBlockStyle(type: BlockType, surface: Surface, raw: unknown): BlockStyle {
  return styleSchema(BLOCK_DEFINITIONS[type].defaultStyle(surface)).parse(raw);
}

export function parseBlockProps<T extends BlockType>(type: T, raw: unknown): BlockPropsByType[T] {
  return BLOCK_DEFINITIONS[type].propsSchema.parse(raw);
}

/** Column widths in percent for a layout. */
export function columnWidths(layout: ColumnsLayout): number[] {
  switch (layout) {
    case '33-67':
      return [33.33, 66.67];
    case '67-33':
      return [66.67, 33.33];
    case '33-33-33':
      return [33.33, 33.33, 33.34];
    case '25-25-25-25':
      return [25, 25, 25, 25];
    case '50-50':
    default:
      return [50, 50];
  }
}

export function columnCount(layout: ColumnsLayout): number {
  return columnWidths(layout).length;
}
