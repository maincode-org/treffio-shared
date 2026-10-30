import type { ImageEditState } from './image-edits';

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

export const HEADING_LEVELS = [1, 2, 3, 4, 5] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export type HeadingProps = {
  level: HeadingLevel;
  align: Align;
  /** Null uses the theme text color. */
  color: string | null;
};

export const TEXT_SIZES = ['normal', 'small'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export type TextProps = {
  align: Align;
  color: string | null;
  /** Theme-controlled body size. `small` uses the theme's small text size. */
  size: TextSize;
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
  /** Edits baked into the image file (e.g. shaped edges). Null: the image is used as uploaded. */
  imageEdits: ImageEditState | null;
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
  /** Edits baked into the background image file (e.g. shaped edges). */
  imageEdits: ImageEditState | null;
};

/** Content written in the old single rich text editor. Its HTML lives on the owner's `.content` key. */
export type ClassicProps = {
  /** Mirrors the legacy edge-to-edge banner option: the first image spans the card. */
  edgeToEdgeFirstImage: boolean;
};

export const RSVP_DECLINE_STYLES = ['outline', 'solid'] as const;
export type RsvpDeclineStyle = (typeof RSVP_DECLINE_STYLES)[number];

/** Register and decline buttons. Links are the event's registration tags, so they work like the page's buttons. */
export type RsvpProps = {
  showDecline: boolean;
  /** True opens the registration (or decline) form directly; false opens the event page. */
  direct: boolean;
  /** True gives each guest their own link (recognized, no login); false shares one link. */
  personal: boolean;
  align: Align;
  /** Stretch the buttons to share the full width. */
  fullWidth: boolean;
  radius: number;
  /** Null uses the event brand color. */
  backgroundColor: string | null;
  textColor: string | null;
  declineStyle: RsvpDeclineStyle;
  /** Null: an outline decline button is see-through; a solid one uses the register button's color. */
  declineBackgroundColor: string | null;
  /** Null: the register button's color for an outline button, its text color for a solid one. */
  declineTextColor: string | null;
};

export type CalendarSource = 'event' | 'custom';

/** Add-to-calendar buttons (Google, Outlook, .ics) for the event or a custom date. */
export type CalendarProps = {
  source: CalendarSource;
  /** `calendar.custom:…` tag code when `source` is custom. */
  customCode: string | null;
  align: Align;
  radius: number;
  backgroundColor: string | null;
  textColor: string | null;
};

/** The guest's personal ticket: QR code, optionally with the attributes shown on tickets. */
export type TicketProps = {
  showDetails: boolean;
  /** QR code size in px. */
  qrSize: number;
  align: Align;
  /** Null: no card behind the ticket. */
  cardColor: string | null;
  borderColor: string | null;
  radius: number;
};

/** Where a When & where row comes from: the event's own value, typed text, or nothing. */
export const EVENT_INFO_SOURCES = ['event', 'custom', 'hidden'] as const;
export type EventInfoSource = (typeof EVENT_INFO_SOURCES)[number];

/** Date/time and place rows with icons. */
export type EventInfoProps = {
  whenSource: EventInfoSource;
  whereSource: EventInfoSource;
  align: Align;
  color: string | null;
  showIcons: boolean;
  boxColor: string | null;
  borderColor: string | null;
  radius: number;
};

export const CALLOUT_VARIANTS = ['filled', 'accent', 'outline'] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

/** Rich text in a highlighted box. */
export type CalloutProps = {
  variant: CalloutVariant;
  align: Align;
  color: string | null;
  /** Bar or border color. Null uses the event brand color. */
  accentColor: string | null;
  /** Null: a light gray for accent and filled boxes, none for outlined ones. */
  boxColor: string | null;
  radius: number;
  size: TextSize;
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
  rsvp: RsvpProps;
  calendar: CalendarProps;
  ticket: TicketProps;
  event_info: EventInfoProps;
  callout: CalloutProps;
};

export type BlockType = keyof BlockPropsByType;

export const BLOCK_TYPES = [
  'heading',
  'text',
  'button',
  'image',
  'divider',
  'spacer',
  'columns',
  'cover',
  'classic',
  'rsvp',
  'calendar',
  'ticket',
  'event_info',
  'callout',
] as const satisfies readonly BlockType[];

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
export type RsvpBlock = BlockNodeByType['rsvp'];
export type CalendarBlock = BlockNodeByType['calendar'];
export type TicketBlock = BlockNodeByType['ticket'];
export type EventInfoBlock = BlockNodeByType['event_info'];
export type CalloutBlock = BlockNodeByType['callout'];

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
