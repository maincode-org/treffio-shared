import { opaqueColor } from '../colors';
import { escapeAttribute, escapeHtml, parseTagOnlyValue, sanitizeBackgroundImageUrl, sanitizeUrl, toTagSafeText } from '../html';
import { RSVP_DEFAULT_LABELS, rsvpLinkCode, ticketTagRaw } from '../event-blocks';
import {
  blockCardEdges,
  clampEmailBodyTextSize,
  columnWidths,
  EMAIL_BODY_TEXT_SIZE,
  headingFontSize,
  imageCornerRadii,
  resolveBlockPadding,
  sanitizeCalendarCode,
  type TextField,
} from '../registry';
import type { Align, BlockDocument, BlockNode, ButtonBlock, ColumnsBlock, CoverBlock, Padding, RsvpBlock } from '../types';

/** Box behind accent and filled callouts when no color is chosen. */
export const CALLOUT_DEFAULT_BOX = '#f4f6f8';

/** Resolved shell colors and fonts. Colors are hex or rgba(); `fontFamily` must not contain double quotes. */
export type EmailShellTheme = {
  canvasColor: string;
  cardColor: string;
  textColor: string;
  fontFamily: string;
  /** Heading blocks. Defaults to `fontFamily`. Must not contain double quotes either. */
  headingFontFamily?: string;
  /** Body text size in px. Defaults to 14. */
  textSize?: number;
  /** Small body text size in px. Defaults to 12. */
  smallTextSize?: number;
  /** Image covering the canvas around the card (CSS only; Outlook on Windows shows `canvasColor`). */
  canvasImage?: string | null;
  /** Image covering the card behind the blocks. Blocks without a color of their own let it show. */
  cardImage?: string | null;
  /** Card corner radius in px, 0 to EMAIL_CARD_RADIUS_MAX. */
  cardRadius?: number;
  buttonBackground: string;
  buttonText: string;
  dividerColor: string;
};

/**
 * A part of the email that differs per recipient. The compiled MJML keeps a token where the slot
 * goes; the sender resolves tags in `raw`, post-processes by kind, and fills the token.
 */
export type EmailSlot =
  /** `textColor` is the block's resolved color; headings and links inside the rich text take it too. */
  | { id: string; kind: 'rich'; blockId: string; raw: string; textColor: string }
  | { id: string; kind: 'classic'; blockId: string; raw: string; padding: Padding; edgeToEdgeFirstImage: boolean }
  | { id: string; kind: 'button'; blockId: string; raw: string; anchorStyle: string }
  /** Calendar buttons from a calendar tag: the server restyles each link and aligns the row. */
  | { id: string; kind: 'calendar'; blockId: string; raw: string; anchorStyle: string; align: Align }
  /** The personal ticket tag. Without a recipient (preview) the server draws a placeholder of `qrSize`. */
  | { id: string; kind: 'ticket'; blockId: string; raw: string; qrSize: number; showDetails: boolean }
  | { id: string; kind: 'preheader' }
  | { id: string; kind: 'footer' };

export type EmailMjmlInput = {
  document: BlockDocument;
  /** Raw (unresolved) value of a block text field in the target language. */
  readText: (block: BlockNode, field: TextField) => string;
  theme: EmailShellTheme;
  /** Extra rules for the `<style>` block (base typography, theme CSS). */
  headCss?: string;
  /** Rewrites image URLs, e.g. storage hosts to the public CDN. */
  transformUrl?: (url: string) => string;
  /** Inner card width in px. Defaults to the legacy 570. */
  cardWidth?: number;
  /** Canvas above and below the card in px. Defaults to the legacy 20. */
  canvasPadding?: number;
};

export type EmailMjmlOutput = { mjml: string; slots: EmailSlot[] };

export const PREHEADER_SLOT_ID = 'preheader';
export const FOOTER_SLOT_ID = 'footer';

export const DEFAULT_EMAIL_CARD_WIDTH = 570;
export const DEFAULT_EMAIL_CANVAS_PADDING = 20;
export const DEFAULT_EMAIL_FOOTER_INSET = 35;
export const EMAIL_CARD_RADIUS_MAX = 40;
/** Canvas kept beside the card on screens narrower than it. */
export const EMAIL_CARD_MOBILE_MARGIN = 12;

export function emailSlotToken(id: string): string {
  return `%%TREFFIO_SLOT_${id}%%`;
}

/** Puts per-recipient HTML into the compiled document. Missing slots become empty. */
export function fillEmailSlots(html: string, slots: readonly EmailSlot[], contents: Readonly<Record<string, string>>): string {
  let result = html;
  for (const slot of slots) {
    result = result.split(emailSlotToken(slot.id)).join(contents[slot.id] ?? '');
  }
  return result;
}

const px = (value: number) => `${Math.max(0, Math.round(value))}px`;

function themeBodySize(theme: EmailShellTheme, size: 'normal' | 'small'): number {
  return size === 'small'
    ? clampEmailBodyTextSize(theme.smallTextSize ?? EMAIL_BODY_TEXT_SIZE.small, EMAIL_BODY_TEXT_SIZE.small)
    : clampEmailBodyTextSize(theme.textSize ?? EMAIL_BODY_TEXT_SIZE.normal, EMAIL_BODY_TEXT_SIZE.normal);
}
const paddingAttr = (padding: Padding) => `${px(padding.top)} ${px(padding.right)} ${px(padding.bottom)} ${px(padding.left)}`;
const attr = (value: string) => escapeAttribute(value);

type AnchorLook = { background: string | null; text: string; radius: number; block: boolean; fontFamily: string; border?: number; extra?: string };

/** Inline style of a button link. A border is drawn inside the padding so outlined and solid buttons match in height. */
function buttonAnchorStyle(look: AnchorLook): string {
  const border = look.border ?? 0;
  return [
    `display: ${look.block ? 'block' : 'inline-block'}`,
    `padding: ${12 - border}px ${24 - border}px`,
    `font-family: ${look.fontFamily}`,
    'font-size: 15px',
    'font-weight: 600',
    'line-height: 1.2',
    `color: ${look.text} !important`,
    'text-decoration: none !important',
    `border-radius: ${look.radius}px`,
    look.background ? `background-color: ${look.background}` : 'background-color: transparent',
    border > 0 ? `border: ${border}px solid ${look.text}` : '',
    'mso-padding-alt: 0',
    look.extra ?? '',
  ]
    .filter(Boolean)
    .join('; ');
}

function anchorStyleFor(block: ButtonBlock, theme: EmailShellTheme): { background: string; style: string } {
  const background = block.props.backgroundColor ?? theme.buttonBackground;
  const text = block.props.textColor ?? theme.buttonText;
  const style = buttonAnchorStyle({ background, text, radius: block.props.radius, block: block.props.fullWidth, fontFamily: theme.fontFamily });
  return { background, style };
}

/** Plain text (with tags) as HTML: escaped, line breaks kept. */
function plainTextHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** One table cell holding a button slot, with the background on the cell for Outlook. */
function buttonCell(token: string, background: string | null, radius: number, width: string): string {
  const bgcolor = background ? ` bgcolor="${attr(opaqueColor(background, '#333333'))}"` : '';
  const fill = background ? ` background-color: ${attr(background)};` : '';
  return `<td align="center"${bgcolor}${width ? ` width="${width}"` : ''} style="border-radius: ${radius}px;${fill}">${token}</td>`;
}

function renderRsvp(block: RsvpBlock, ctx: RenderContext, padding: Padding, bg: string): string {
  const { input, theme } = ctx;
  const { props } = block;
  const registerBackground = props.backgroundColor ?? theme.buttonBackground;
  const registerText = props.textColor ?? theme.buttonText;
  const registerLabel = input.readText(block, 'label').trim() || RSVP_DEFAULT_LABELS.register.en;
  const registerId = `${block.id}__register`;
  ctx.slots.push({
    id: registerId,
    kind: 'button',
    blockId: block.id,
    raw: buttonRawHtml(registerLabel, `{{${rsvpLinkCode(props, 'register')}}}`),
    anchorStyle: buttonAnchorStyle({ background: registerBackground, text: registerText, radius: props.radius, block: props.fullWidth, fontFamily: theme.fontFamily }),
  });

  const cellWidth = props.fullWidth && props.showDecline ? '50%' : '';
  const registerCell = buttonCell(emailSlotToken(registerId), registerBackground, props.radius, cellWidth);
  const cells: string[] = [];

  if (props.showDecline) {
    const solid = props.declineStyle === 'solid';
    const declineBackground = solid ? (props.declineBackgroundColor ?? registerBackground) : props.declineBackgroundColor;
    const declineText = props.declineTextColor ?? (solid ? registerText : registerBackground);
    const declineLabel = input.readText(block, 'declineLabel').trim() || RSVP_DEFAULT_LABELS.decline.en;
    const declineId = `${block.id}__decline`;
    ctx.slots.push({
      id: declineId,
      kind: 'button',
      blockId: block.id,
      raw: buttonRawHtml(declineLabel, `{{${rsvpLinkCode(props, 'decline')}}}`),
      anchorStyle: buttonAnchorStyle({
        background: declineBackground,
        text: declineText,
        radius: props.radius,
        block: props.fullWidth,
        fontFamily: theme.fontFamily,
        border: solid ? 0 : 2,
      }),
    });
    cells.push(buttonCell(emailSlotToken(declineId), declineBackground, props.radius, cellWidth));
    cells.push('<td width="12" style="width: 12px; font-size: 0; line-height: 0;">&nbsp;</td>');
  }
  cells.push(registerCell);

  const tableStyle = `border-collapse: separate;${props.fullWidth ? ' width: 100%;' : ''}`;
  const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${props.align}" style="${tableStyle}"><tr>${cells.join('')}</tr></table>`;
  return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(props.align)}"${bg}>${table}</mj-text>`;
}

/** A box around other content: background, border and radius on one table cell. */
function boxTable(inner: string, box: { color: string | null; border: string; radius: number; padding: string; align: Align }): string {
  const bgcolor = box.color ? ` bgcolor="${attr(opaqueColor(box.color, '#ffffff'))}"` : '';
  const style = [
    `padding: ${box.padding}`,
    box.color ? `background-color: ${attr(box.color)}` : '',
    box.border,
    box.radius > 0 ? `border-radius: ${box.radius}px` : '',
    `text-align: ${box.align}`,
  ]
    .filter(Boolean)
    .join('; ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate;"><tr><td${bgcolor} style="${style}">${inner}</td></tr></table>`;
}

/**
 * Raw button HTML before tag resolution. A link-tag href becomes `{{code;label;params}}` so the
 * tag resolver builds the personal link; a plain URL becomes an anchor.
 */
export function buttonRawHtml(label: string, href: string): string {
  const tag = parseTagOnlyValue(href);
  if (tag) {
    const text = toTagSafeText(label);
    return `{{${tag.code};${escapeHtml(text)}${tag.params ? `;${tag.params}` : ''}}}`;
  }
  const url = sanitizeUrl(href);
  if (!url) return `<span>${escapeHtml(label)}</span>`;
  return `<a href="${attr(url)}" target="_blank">${escapeHtml(label)}</a>`;
}

/** Applies the button look to the anchor(s) the tag resolver produced, or wraps plain text. */
export function styleButtonHtml(resolvedHtml: string, anchorStyle: string): string {
  if (/<a\b/i.test(resolvedHtml)) {
    return resolvedHtml.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
      const cleaned = attrs.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/\sclass\s*=\s*("[^"]*"|'[^']*')/gi, '');
      return `<a${cleaned} style="${anchorStyle}">`;
    });
  }
  return `<span style="${anchorStyle}">${resolvedHtml.replace(/^<span>|<\/span>$/g, '')}</span>`;
}

type RenderContext = {
  input: EmailMjmlInput;
  theme: EmailShellTheme;
  slots: EmailSlot[];
  cardWidth: number;
  /** Resolved card corner radius in px; 0 when the card is square. */
  cardRadius: number;
};

/** Heading text is inline: paragraphs from the editor become line breaks, keeping leading indentation. */
export function inlineHtml(html: string): string {
  const unwrapped = html
    .replace(/<\/(p|div|h[1-6])>\s*<(p|div|h[1-6])\b[^>]*>/gi, '<br>')
    .replace(/<\/?(p|div|h[1-6])\b[^>]*>/gi, '')
    .replace(/(<br\s*\/?>\s*)+$/i, '')
    .replace(/\s+$/, '');
  return unwrapped.trim() ? unwrapped : '';
}

function textAlign(align: Align): string {
  return align;
}

function containerBg(block: BlockNode, nested: boolean): string {
  if (!nested || !block.style.backgroundColor) return '';
  return ` container-background-color="${attr(block.style.backgroundColor)}"`;
}

/** One block as MJML content elements (inside an mj-column). `width` is the available px width. */
function renderElement(block: BlockNode, ctx: RenderContext, width: number, nested: boolean): string {
  const { input, theme } = ctx;
  const padding = resolveBlockPadding(block, input.document, nested);
  const bg = containerBg(block, nested);

  switch (block.type) {
    case 'text': {
      const raw = input.readText(block, 'html');
      if (!raw.trim()) return '';
      const color = block.props.color ?? theme.textColor;
      const fontSize = themeBodySize(theme, block.props.size);
      ctx.slots.push({ id: block.id, kind: 'rich', blockId: block.id, raw, textColor: color });
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(block.props.align)}" color="${attr(color)}" font-size="${fontSize}px" line-height="1.4"${bg}>${emailSlotToken(block.id)}</mj-text>`;
    }
    case 'heading': {
      const raw = inlineHtml(input.readText(block, 'html'));
      if (!raw.trim()) return '';
      const level = block.props.level;
      const color = block.props.color ?? theme.textColor;
      ctx.slots.push({ id: block.id, kind: 'rich', blockId: block.id, raw, textColor: color });
      const style = [
        'margin: 0 !important',
        `font-family: ${theme.headingFontFamily ?? theme.fontFamily} !important`,
        `font-size: ${headingFontSize(level)}px !important`,
        'font-weight: 700 !important',
        'line-height: 1.2 !important',
        `color: ${color} !important`,
        `text-align: ${block.props.align}`,
      ].join('; ');
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(block.props.align)}"${bg}><h${level} style="${style}">${emailSlotToken(block.id)}</h${level}></mj-text>`;
    }
    case 'classic': {
      const raw = input.readText(block, 'html');
      if (!raw.trim()) return '';
      ctx.slots.push({
        id: block.id,
        kind: 'classic',
        blockId: block.id,
        raw,
        padding,
        edgeToEdgeFirstImage: block.props.edgeToEdgeFirstImage,
      });
      return `<mj-text padding="0"${bg}>${emailSlotToken(block.id)}</mj-text>`;
    }
    case 'button': {
      const label = input.readText(block, 'label');
      if (!label.trim()) return '';
      const href = input.readText(block, 'href');
      const { background, style } = anchorStyleFor(block, theme);
      ctx.slots.push({ id: block.id, kind: 'button', blockId: block.id, raw: buttonRawHtml(label, href), anchorStyle: style });
      const radius = `${block.props.radius}px`;
      const tableAlign = block.props.align === 'center' ? 'center' : block.props.align;
      const tableStyle = `border-collapse: separate;${block.props.fullWidth ? ' width: 100%;' : ''}`;
      const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${tableAlign}" style="${tableStyle}"><tr><td align="center" bgcolor="${attr(opaqueColor(background, '#333333'))}" style="border-radius: ${radius}; background-color: ${attr(background)};">${emailSlotToken(block.id)}</td></tr></table>`;
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(block.props.align)}"${bg}>${button}</mj-text>`;
    }
    case 'image': {
      const rawSrc = input.readText(block, 'src').trim();
      const src = rawSrc && /^https?:\/\//i.test(rawSrc) ? (input.transformUrl ? input.transformUrl(rawSrc) : rawSrc) : '';
      if (!src) return '';
      const alt = input.readText(block, 'alt');
      const href = sanitizeUrl(input.readText(block, 'href'));
      const available = Math.max(1, width - padding.left - padding.right);
      const imageWidth = Math.max(1, Math.round((available * block.props.width) / 100));
      const hrefAttr = href && !parseTagOnlyValue(href) ? ` href="${attr(href)}" target="_blank"` : '';
      const corners = imageCornerRadii(block, input.document, nested, ctx.cardRadius);
      const radius = radiusAttr(corners.top, corners.bottom);
      return `<mj-image src="${attr(src)}" alt="${attr(alt)}" width="${imageWidth}px" align="${block.props.align}" padding="${paddingAttr(padding)}"${radius}${hrefAttr}${bg} />`;
    }
    case 'divider': {
      const color = block.props.color ?? theme.dividerColor;
      return `<mj-divider border-color="${attr(color)}" border-width="${block.props.thickness}px" border-style="${block.props.lineStyle}" padding="${paddingAttr(padding)}"${bg} />`;
    }
    case 'spacer':
      return `<mj-spacer height="${block.props.height}px" padding="0"${bg} />`;
    case 'rsvp':
      return renderRsvp(block, ctx, padding, bg);
    case 'calendar': {
      const code = block.props.source === 'custom' ? sanitizeCalendarCode(block.props.customCode) : 'event.add_to_calendar';
      if (!code) return '';
      const anchorStyle = buttonAnchorStyle({
        background: block.props.backgroundColor ?? theme.buttonBackground,
        text: block.props.textColor ?? theme.buttonText,
        radius: block.props.radius,
        block: false,
        fontFamily: theme.fontFamily,
        extra: 'margin: 4px',
      });
      ctx.slots.push({ id: block.id, kind: 'calendar', blockId: block.id, raw: `{{${code}}}`, anchorStyle, align: block.props.align });
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(block.props.align)}"${bg}>${emailSlotToken(block.id)}</mj-text>`;
    }
    case 'ticket': {
      const { props } = block;
      ctx.slots.push({ id: block.id, kind: 'ticket', blockId: block.id, raw: ticketTagRaw(props), qrSize: props.qrSize, showDetails: props.showDetails });
      const card = !!props.cardColor || !!props.borderColor;
      const style = [
        'border-collapse: separate',
        props.cardColor ? `background-color: ${attr(props.cardColor)}` : '',
        props.borderColor ? `border: 1px solid ${attr(props.borderColor)}` : '',
        card && props.radius > 0 ? `border-radius: ${props.radius}px` : '',
      ]
        .filter(Boolean)
        .join('; ');
      const bgcolor = props.cardColor ? ` bgcolor="${attr(opaqueColor(props.cardColor, '#ffffff'))}"` : '';
      const ticket = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${props.align}"${bgcolor} style="${style}"><tr><td align="center" style="padding: ${card ? 20 : 0}px;">${emailSlotToken(block.id)}</td></tr></table>`;
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(props.align)}"${bg}>${ticket}</mj-text>`;
    }
    case 'event_info': {
      const { props } = block;
      const color = props.color ?? theme.textColor;
      const rows = (
        [
          ['when', '&#128197;'],
          ['where', '&#128205;'],
        ] as const
      )
        .map(([field, icon]) => {
          const value = input.readText(block, field).trim();
          if (!value) return '';
          const id = `${block.id}__${field}`;
          ctx.slots.push({ id, kind: 'rich', blockId: block.id, raw: plainTextHtml(value), textColor: color });
          const iconCell = props.showIcons ? `<td width="28" valign="top" style="width: 28px; font-size: 16px; line-height: 1.4;">${icon}</td>` : '';
          return `<tr>${iconCell}<td valign="top" style="padding: 2px 0; text-align: ${props.align};">${emailSlotToken(id)}</td></tr>`;
        })
        .filter(Boolean);
      if (rows.length === 0) return '';
      const list = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
      const boxed = !!props.boxColor || !!props.borderColor;
      const inner = boxed
        ? boxTable(list, {
            color: props.boxColor,
            border: props.borderColor ? `border: 1px solid ${attr(props.borderColor)}` : '',
            radius: props.radius,
            padding: '14px 18px',
            align: props.align,
          })
        : list;
      const fontSize = themeBodySize(theme, 'normal');
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(props.align)}" color="${attr(color)}" font-size="${fontSize}px" line-height="1.4"${bg}>${inner}</mj-text>`;
    }
    case 'callout': {
      const raw = input.readText(block, 'html');
      if (!raw.trim()) return '';
      const { props } = block;
      const color = props.color ?? theme.textColor;
      const accent = props.accentColor ?? theme.buttonBackground;
      const boxColor = props.boxColor ?? (props.variant === 'outline' ? null : CALLOUT_DEFAULT_BOX);
      const border = props.variant === 'accent' ? `border-left: 4px solid ${attr(accent)}` : props.variant === 'outline' ? `border: 1px solid ${attr(accent)}` : '';
      const fontSize = themeBodySize(theme, props.size);
      ctx.slots.push({ id: block.id, kind: 'rich', blockId: block.id, raw, textColor: color });
      const inner = boxTable(emailSlotToken(block.id), { color: boxColor, border, radius: props.radius, padding: '16px 20px', align: props.align });
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(props.align)}" color="${attr(color)}" font-size="${fontSize}px" line-height="1.4"${bg}>${inner}</mj-text>`;
    }
    case 'columns':
    case 'cover':
      return '';
  }
}

/** What paints behind a section. A null color leaves it transparent, so the card (color or image) shows. */
type SectionFill = { color: string | null; image?: string | null };

function backgroundImageAttrs(url: string): string {
  return ` background-url="${attr(url)}" background-size="cover" background-position="center center" background-repeat="no-repeat"`;
}

/** ` border-radius` for the given top and bottom corner radii, or nothing when both are 0. */
function radiusAttr(top: number, bottom: number): string {
  if (top <= 0 && bottom <= 0) return '';
  return top === bottom ? ` border-radius="${px(top)}"` : ` border-radius="${px(top)} ${px(top)} ${px(bottom)} ${px(bottom)}"`;
}

function section(inner: string, fill: SectionFill, padding: Partial<Padding> = {}, radius = ''): string {
  const p: Padding = { top: 0, right: 0, bottom: 0, left: 0, ...padding };
  const color = fill.color ? ` background-color="${attr(fill.color)}"` : '';
  const image = fill.image ? backgroundImageAttrs(fill.image) : '';
  return `<mj-section${color}${image}${radius} padding="${paddingAttr(p)}" css-class="email-card">${inner}</mj-section>`;
}

/**
 * A block background against a card edge rounds with the card. The card clips too, but not every
 * client honors overflow on it, so the background rounds itself.
 */
function blockSectionRadius(block: BlockNode, fill: SectionFill, ctx: RenderContext): string {
  if (ctx.cardRadius <= 0 || (!fill.color && !fill.image)) return '';
  const edges = blockCardEdges(block, ctx.input.document, false);
  return radiusAttr(edges.top ? ctx.cardRadius : 0, edges.bottom ? ctx.cardRadius : 0);
}

function spacerSection(height: number, fill: SectionFill): string {
  if (height <= 0) return '';
  return section(`<mj-column padding="0"><mj-spacer height="${height}px" padding="0" /></mj-column>`, fill);
}

/**
 * Sections are transparent unless the block has a background of its own: the card wrapper behind
 * them carries the card color and image. That keeps a card image and rounded corners visible, and
 * dark-mode clients recolor one surface instead of each block (which left seams between them).
 */
const CARD_FILL: SectionFill = { color: null };

function blockFill(block: BlockNode, ctx: RenderContext): SectionFill {
  const image = sanitizeBackgroundImageUrl(block.style.backgroundImage);
  return {
    color: block.style.backgroundColor,
    image: image ? imageUrl(image, ctx.input) : null,
  };
}

function imageUrl(url: string, input: EmailMjmlInput): string {
  return input.transformUrl ? input.transformUrl(url) : url;
}

function renderColumns(block: ColumnsBlock, ctx: RenderContext): string {
  const { document } = ctx.input;
  const widths = columnWidths(block.props.layout);
  const padding = resolveBlockPadding(block, document, false);
  const inner = Math.max(1, ctx.cardWidth - padding.left - padding.right);
  const half = block.props.gap / 2;
  const lastIndex = widths.length - 1;

  const columns = widths
    .map((percent, index) => {
      const columnPadding = { left: index === 0 ? 0 : half, right: index === lastIndex ? 0 : half };
      const columnWidth = (inner * percent) / 100 - columnPadding.left - columnPadding.right;
      const children = (block.children?.[index] ?? [])
        .map((id) => document.blocks[id])
        .filter((child): child is BlockNode => !!child)
        .map((child) => renderElement(child, ctx, columnWidth, true))
        .join('');
      return `<mj-column width="${percent}%" vertical-align="${block.props.verticalAlign}" padding="0 ${px(columnPadding.right)} 0 ${px(columnPadding.left)}">${children}</mj-column>`;
    })
    .join('');

  const body = block.props.stackOnMobile ? columns : `<mj-group>${columns}</mj-group>`;
  const fill = blockFill(block, ctx);
  return section(body, fill, padding, blockSectionRadius(block, fill, ctx));
}

/**
 * An image with blocks on top: one section with the image as its background, its children in a
 * single column inset by the side spacing. Children without a text color use the block's.
 */
function renderCover(block: CoverBlock, ctx: RenderContext): string {
  const { document } = ctx.input;
  const padding = resolveBlockPadding(block, document, false);
  const inner = Math.max(1, ctx.cardWidth - padding.left - padding.right);
  const childCtx: RenderContext = block.props.textColor ? { ...ctx, theme: { ...ctx.theme, textColor: block.props.textColor } } : ctx;
  const children = (block.children?.[0] ?? [])
    .map((id) => document.blocks[id])
    .filter((child): child is BlockNode => !!child)
    .map((child) => renderElement(child, childCtx, inner, true))
    .join('');
  const fill = blockFill(block, ctx);

  const hero = fill.image ? coverHeroSize(block, ctx.cardWidth) : null;
  if (!fill.image || !hero) {
    return section(`<mj-column padding="0">${children}</mj-column>`, fill, padding, blockSectionRadius(block, fill, ctx));
  }

  // mj-hero sizes the block: to the image's proportions (fluid) or a set height, and grows when the
  // blocks need more room. Its background color defaults to white, so it always gets one.
  const attrs = [
    `mode="${hero.mode}"`,
    hero.mode === 'fixed-height' ? `height="${px(hero.height)}"` : '',
    `background-url="${attr(fill.image)}"`,
    `background-width="${px(hero.backgroundWidth)}"`,
    `background-height="${px(hero.backgroundHeight)}"`,
    'background-position="center center"',
    `background-color="${attr(fill.color ?? ctx.theme.cardColor)}"`,
    `vertical-align="${block.props.verticalAlign}"`,
    `padding="${paddingAttr(padding)}"`,
  ].filter(Boolean);
  return `<mj-hero ${attrs.join(' ')}>${children}</mj-hero>`;
}

/**
 * How an image with content is sized: a set height, or the image's proportions when its pixel size
 * is known. The background size is the image scaled to cover the block, which Outlook draws as is.
 */
function coverHeroSize(
  block: CoverBlock,
  cardWidth: number
): { mode: 'fluid-height' | 'fixed-height'; height: number; backgroundWidth: number; backgroundHeight: number } | null {
  const { height, imageWidth, imageHeight } = block.props;
  const hasSize = !!imageWidth && !!imageHeight;
  if (height === null && !hasSize) return null;
  if (!hasSize) return { mode: 'fixed-height', height: height ?? 0, backgroundWidth: cardWidth, backgroundHeight: height ?? 0 };
  const fitted = Math.round((cardWidth * imageHeight) / imageWidth);
  const target = height ?? fitted;
  const scale = Math.max(cardWidth / imageWidth, target / imageHeight);
  return {
    mode: height === null ? 'fluid-height' : 'fixed-height',
    height: target,
    backgroundWidth: Math.round(imageWidth * scale),
    backgroundHeight: Math.round(imageHeight * scale),
  };
}

/**
 * Builds the MJML for an email. The card matches the legacy shell: 570px wide with 20px of canvas
 * above and below, footer padded 35px. Everything that depends on the recipient is a slot.
 */
export function buildEmailMjml(input: EmailMjmlInput): EmailMjmlOutput {
  const theme = input.theme;
  const cardWidth = input.cardWidth ?? DEFAULT_EMAIL_CARD_WIDTH;
  const canvasPadding = input.canvasPadding ?? DEFAULT_EMAIL_CANVAS_PADDING;
  const cardRadius = Math.max(0, Math.min(EMAIL_CARD_RADIUS_MAX, Math.round(theme.cardRadius ?? 0)));
  const ctx: RenderContext = { input, theme, slots: [{ id: PREHEADER_SLOT_ID, kind: 'preheader' }], cardWidth, cardRadius };
  const { document } = input;

  const sections: string[] = [];
  const rootIds = document.root.childIds;
  sections.push(spacerSection(document.root.style.paddingTop, CARD_FILL));

  for (const id of rootIds) {
    const block = document.blocks[id];
    if (!block) continue;
    if (block.type === 'columns') {
      sections.push(renderColumns(block, ctx));
      continue;
    }
    if (block.type === 'cover') {
      sections.push(renderCover(block, ctx));
      continue;
    }
    const element = renderElement(block, ctx, cardWidth, false);
    if (!element) continue;
    const fill = blockFill(block, ctx);
    sections.push(section(`<mj-column padding="0">${element}</mj-column>`, fill, {}, blockSectionRadius(block, fill, ctx)));
  }

  sections.push(spacerSection(document.root.style.paddingBottom, CARD_FILL));

  if (document.root.style.showFooter) {
    ctx.slots.push({ id: FOOTER_SLOT_ID, kind: 'footer' });
    const footerInset = DEFAULT_EMAIL_FOOTER_INSET;
    sections.push(
      section(
        `<mj-column padding="0"><mj-text padding="0 ${footerInset}px ${footerInset}px ${footerInset}px">${emailSlotToken(FOOTER_SLOT_ID)}</mj-text></mj-column>`,
        CARD_FILL
      )
    );
  }

  // mj-body cannot hold a background image, so the canvas gets one through CSS. Clients without
  // <style> support (Outlook on Windows) keep the canvas color.
  const canvasImage = sanitizeBackgroundImageUrl(theme.canvasImage);
  const canvasImageCss = canvasImage
    ? `.email-canvas { background-image: url("${imageUrl(canvasImage, input)}"); background-size: cover; background-position: center top; background-repeat: no-repeat; }`
    : '';
  // Rounded corners must clip blocks with a background of their own (Outlook on Windows stays square).
  const cardRadiusCss = cardRadius > 0 ? '.email-card-stack { overflow: hidden; }' : '';
  // On screens narrower than the card, keep some canvas beside it so it still reads as a card.
  const mobileCardCss = `@media only screen and (max-width: ${cardWidth + 2 * EMAIL_CARD_MOBILE_MARGIN - 1}px) { .email-card-stack { margin-left: ${EMAIL_CARD_MOBILE_MARGIN}px !important; margin-right: ${EMAIL_CARD_MOBILE_MARGIN}px !important; } }`;
  const css = [input.headCss ?? '', canvasImageCss, cardRadiusCss, mobileCardCss].filter(Boolean).join('\n');
  const head = [
    '<mj-head>',
    `<mj-preview>${emailSlotToken(PREHEADER_SLOT_ID)}</mj-preview>`,
    '<mj-attributes>',
    `<mj-all font-family="${attr(theme.fontFamily)}" />`,
    `<mj-text font-size="14px" line-height="1.4" color="${attr(theme.textColor)}" padding="0" />`,
    '<mj-section padding="0" />',
    '<mj-column padding="0" />',
    '<mj-image padding="0" />',
    '<mj-divider padding="0" />',
    '</mj-attributes>',
    css ? `<mj-style>${css.replace(/<\//g, '')}</mj-style>` : '',
    '</mj-head>',
  ].join('');

  // Each block is its own table. Dark-mode clients (Outlook) recolor them one by one and leave
  // hairline gaps between them, so a card-colored wrapper sits directly behind them. The canvas is
  // the body itself (borders would keep their light color in dark mode), with spacers above and
  // below the card; on screens wider than the card its sides show the body color.
  const canvasSpacer = canvasPadding > 0 ? `<mj-section padding="0"><mj-column padding="0"><mj-spacer height="${canvasPadding}px" padding="0" /></mj-column></mj-section>` : '';
  const cardImage = sanitizeBackgroundImageUrl(theme.cardImage);
  const cardImageAttrs = cardImage ? backgroundImageAttrs(imageUrl(cardImage, input)) : '';
  const cardRadiusAttr = cardRadius > 0 ? ` border-radius="${cardRadius}px"` : '';
  const card = `<mj-wrapper padding="0" background-color="${attr(theme.cardColor)}"${cardImageAttrs}${cardRadiusAttr} css-class="email-card-stack">${sections.join('')}</mj-wrapper>`;
  const body = `<mj-body background-color="${attr(theme.canvasColor)}" width="${cardWidth}px" css-class="email-canvas">${canvasSpacer}${card}${canvasSpacer}</mj-body>`;

  return { mjml: `<mjml>${head}${body}</mjml>`, slots: ctx.slots };
}
