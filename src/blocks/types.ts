/** Language columns on `event_text`. */
export const LOCALES = ['en', 'da', 'de', 'swe'] as const;
export type Locale = (typeof LOCALES)[number];

/** Where a document is rendered. Each surface allows its own set of blocks. */
export const SURFACES = ['email', 'in_app', 'page'] as const;
export type Surface = (typeof SURFACES)[number];

export type Align = 'left' | 'center' | 'right';

export type Padding = { top: number; right: number; bottom: number; left: number };

export type BlockStyle = {
  /**
   * Only `top` and `bottom` are used. Side spacing comes from the document (`RootStyle.paddingX`)
   * for top-level blocks and is 0 inside columns; see `resolveBlockPadding`.
   */
  padding: Padding;
  /** Null keeps the surrounding (card) color. */
  backgroundColor: string | null;
  /** Top-level blocks only: an image covering the block, over its background color. Same in every language. */
  backgroundImage: string | null;
  /** Top-level blocks only: ignore the document's side spacing and reach the edges of the card. */
  fullWidth: boolean;
};

export type HeadingLevel = 1 | 2 | 3;

export type HeadingProps = {
  level: HeadingLevel;
  align: Align;
  /** Null uses the theme text color. */
  color: string | null;
};

export type TextProps = {
  align: Align;
  color: string | null;
};

export type ButtonProps = {
  align: Align;
  fullWidth: boolean;
  /** Null uses the event brand color. */
  backgroundColor: string | null;
  textColor: string | null;
  radius: number;
};

export type ImageProps = {
  /** Percent of the available width, 10-100. */
  width: number;
  align: Align;
  radius: number;
};

export type DividerLineStyle = 'solid' | 'dashed' | 'dotted';

export type DividerProps = {
  color: string | null;
  thickness: number;
  lineStyle: DividerLineStyle;
};

export type SpacerProps = {
  height: number;
};

export const COLUMN_LAYOUTS = ['50-50', '33-67', '67-33', '33-33-33', '25-25-25-25'] as const;
export type ColumnsLayout = (typeof COLUMN_LAYOUTS)[number];

export type VerticalAlign = 'top' | 'middle' | 'bottom';

export type ColumnsProps = {
  layout: ColumnsLayout;
  /** Space between columns in px. */
  gap: number;
  stackOnMobile: boolean;
  verticalAlign: VerticalAlign;
};

/** An image with blocks on top of it: the image is the block's background (`style.backgroundImage`). */
export type CoverProps = {
  /** Text color for headings and text inside that have none of their own. Null uses the theme. */
  textColor: string | null;
  /** Height in px. Null fits the image: the block keeps the image's proportions (and grows for content). */
  height: number | null;
  /** Where the blocks sit when the image is taller than they are. */
  verticalAlign: VerticalAlign;
  /** The image's pixel size, measured when it is chosen. Needed to fit the block to the image. */
  imageWidth: number | null;
  imageHeight: number | null;
};

/** Content written in the old single rich text editor. Its HTML lives on the owner's `.content` key. */
export type ClassicProps = {
  /** Mirrors the legacy edge-to-edge banner option: the first image spans the card. */
  edgeToEdgeFirstImage: boolean;
};

export type BlockPropsByType = {
  heading: HeadingProps;
  text: TextProps;
  button: ButtonProps;
  image: ImageProps;
  divider: DividerProps;
  spacer: SpacerProps;
  columns: ColumnsProps;
  cover: CoverProps;
  classic: ClassicProps;
};

export type BlockType = keyof BlockPropsByType;

export const BLOCK_TYPES = ['heading', 'text', 'button', 'image', 'divider', 'spacer', 'columns', 'cover', 'classic'] as const satisfies readonly BlockType[];

type BlockNodeOf<T extends BlockType> = {
  id: string;
  type: T;
  props: BlockPropsByType[T];
  style: BlockStyle;
  /** Child block ids per region. Only container blocks (columns) have regions. */
  children?: string[][];
};

export type BlockNodeByType = { [T in BlockType]: BlockNodeOf<T> };
export type BlockNode = BlockNodeByType[BlockType];

export type HeadingBlock = BlockNodeByType['heading'];
export type TextBlock = BlockNodeByType['text'];
export type ButtonBlock = BlockNodeByType['button'];
export type ImageBlock = BlockNodeByType['image'];
export type DividerBlock = BlockNodeByType['divider'];
export type SpacerBlock = BlockNodeByType['spacer'];
export type ColumnsBlock = BlockNodeByType['columns'];
export type CoverBlock = BlockNodeByType['cover'];
export type ClassicBlock = BlockNodeByType['classic'];

export type RootStyle = {
  /** Space above the first block, inside the card. */
  paddingTop: number;
  /** Space below the last block, before the footer. */
  paddingBottom: number;
  /** Side spacing, applied to every top-level block that is not full width. */
  paddingX: number;
  /** False leaves the event footer (contact details, custom footer text, Treffio credit) out of this email. */
  showFooter: boolean;
};

export const BLOCK_DOCUMENT_VERSION = 1;

/**
 * Layout of an email, message or page. Language-neutral: every translatable value lives in
 * `event_text` (see `keys.ts`), so a translation never has to copy the structure.
 */
export type BlockDocument = {
  version: typeof BLOCK_DOCUMENT_VERSION;
  surface: Surface;
  root: { childIds: string[]; style: RootStyle };
  blocks: Record<string, BlockNode>;
};

export const ROOT_PARENT_ID = 'root';

/** Where a block sits: the root list or a region (column) of a container block. */
export type BlockLocation = { parentId: string; region: number; index: number };
