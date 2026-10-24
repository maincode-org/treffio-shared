import { opaqueColor } from '../colors';
import { escapeAttribute, escapeHtml, parseTagOnlyValue, sanitizeUrl, toTagSafeText } from '../html';
import { columnWidths, type TextField } from '../registry';
import type { Align, BlockDocument, BlockNode, ButtonBlock, ColumnsBlock, Padding } from '../types';

/** Resolved shell colors and fonts. Colors are hex or rgba(); `fontFamily` must not contain double quotes. */
export type EmailShellTheme = {
  canvasColor: string;
  cardColor: string;
  textColor: string;
  fontFamily: string;
  buttonBackground: string;
  buttonText: string;
  dividerColor: string;
};

/**
 * A part of the email that differs per recipient. The compiled MJML keeps a token where the slot
 * goes; the sender resolves tags in `raw`, post-processes by kind, and fills the token.
 */
export type EmailSlot =
  | { id: string; kind: 'rich'; blockId: string; raw: string }
  | { id: string; kind: 'classic'; blockId: string; raw: string; padding: Padding; edgeToEdgeFirstImage: boolean }
  | { id: string; kind: 'button'; blockId: string; raw: string; anchorStyle: string }
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
  /** Space around the card in px. Defaults to the legacy 20. */
  canvasPadding?: number;
};

export type EmailMjmlOutput = { mjml: string; slots: EmailSlot[] };

export const PREHEADER_SLOT_ID = 'preheader';
export const FOOTER_SLOT_ID = 'footer';

export const DEFAULT_EMAIL_CARD_WIDTH = 570;
export const DEFAULT_EMAIL_CANVAS_PADDING = 20;
export const DEFAULT_EMAIL_FOOTER_INSET = 35;

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

const HEADING_SIZES: Record<1 | 2 | 3, number> = { 1: 32, 2: 24, 3: 18 };

const px = (value: number) => `${Math.max(0, Math.round(value))}px`;
const paddingAttr = (padding: Padding) => `${px(padding.top)} ${px(padding.right)} ${px(padding.bottom)} ${px(padding.left)}`;
const attr = (value: string) => escapeAttribute(value);

function anchorStyleFor(block: ButtonBlock, theme: EmailShellTheme): { background: string; style: string } {
  const background = block.props.backgroundColor ?? theme.buttonBackground;
  const text = block.props.textColor ?? theme.buttonText;
  const display = block.props.fullWidth ? 'block' : 'inline-block';
  const style = [
    `display: ${display}`,
    'padding: 12px 24px',
    `font-family: ${theme.fontFamily}`,
    'font-size: 15px',
    'font-weight: 600',
    'line-height: 1.2',
    `color: ${text} !important`,
    'text-decoration: none !important',
    `border-radius: ${block.props.radius}px`,
    `background-color: ${background}`,
    'mso-padding-alt: 0',
  ].join('; ');
  return { background, style };
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
};

/** Heading text is inline: paragraphs from the editor become line breaks. */
export function inlineHtml(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6])>\s*<(p|div|h[1-6])\b[^>]*>/gi, '<br>')
    .replace(/<\/?(p|div|h[1-6])\b[^>]*>/gi, '')
    .replace(/(<br\s*\/?>\s*)+$/i, '')
    .trim();
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
  const padding = block.style.padding;
  const bg = containerBg(block, nested);

  switch (block.type) {
    case 'text': {
      const raw = input.readText(block, 'html');
      if (!raw.trim()) return '';
      ctx.slots.push({ id: block.id, kind: 'rich', blockId: block.id, raw });
      const color = block.props.color ?? theme.textColor;
      return `<mj-text padding="${paddingAttr(padding)}" align="${textAlign(block.props.align)}" color="${attr(color)}"${bg}>${emailSlotToken(block.id)}</mj-text>`;
    }
    case 'heading': {
      const raw = inlineHtml(input.readText(block, 'html'));
      if (!raw.trim()) return '';
      ctx.slots.push({ id: block.id, kind: 'rich', blockId: block.id, raw });
      const level = block.props.level;
      const color = block.props.color ?? theme.textColor;
      const style = [
        'margin: 0 !important',
        `font-family: ${theme.fontFamily} !important`,
        `font-size: ${HEADING_SIZES[level]}px !important`,
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
      const effectivePadding: Padding = block.props.fullBleed ? { ...padding, left: 0, right: 0 } : padding;
      const available = Math.max(1, width - effectivePadding.left - effectivePadding.right);
      const imageWidth = Math.max(1, Math.round((available * block.props.width) / 100));
      const hrefAttr = href && !parseTagOnlyValue(href) ? ` href="${attr(href)}" target="_blank"` : '';
      const radius = block.props.radius > 0 ? ` border-radius="${block.props.radius}px"` : '';
      return `<mj-image src="${attr(src)}" alt="${attr(alt)}" width="${imageWidth}px" align="${block.props.align}" padding="${paddingAttr(effectivePadding)}"${radius}${hrefAttr}${bg} />`;
    }
    case 'divider': {
      const color = block.props.color ?? theme.dividerColor;
      return `<mj-divider border-color="${attr(color)}" border-width="${block.props.thickness}px" border-style="${block.props.lineStyle}" padding="${paddingAttr(padding)}"${bg} />`;
    }
    case 'spacer':
      return `<mj-spacer height="${block.props.height}px" padding="0"${bg} />`;
    case 'columns':
      return '';
  }
}

function section(inner: string, background: string, padding: Partial<Padding> = {}): string {
  const p: Padding = { top: 0, right: 0, bottom: 0, left: 0, ...padding };
  return `<mj-section background-color="${attr(background)}" padding="${paddingAttr(p)}" css-class="email-card">${inner}</mj-section>`;
}

function spacerSection(height: number, background: string): string {
  if (height <= 0) return '';
  return section(`<mj-column padding="0"><mj-spacer height="${height}px" padding="0" /></mj-column>`, background);
}

function renderColumns(block: ColumnsBlock, ctx: RenderContext): string {
  const { document } = ctx.input;
  const widths = columnWidths(block.props.layout);
  const padding = block.style.padding;
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
  return section(body, block.style.backgroundColor ?? ctx.theme.cardColor, padding);
}

function isFullBleedImage(block: BlockNode | undefined): boolean {
  return block?.type === 'image' && block.props.fullBleed;
}

/**
 * Builds the MJML for an email. The card matches the legacy shell: 570px wide inside a 20px
 * canvas, footer padded 35px. Everything that depends on the recipient is a slot.
 */
export function buildEmailMjml(input: EmailMjmlInput): EmailMjmlOutput {
  const theme = input.theme;
  const cardWidth = input.cardWidth ?? DEFAULT_EMAIL_CARD_WIDTH;
  const canvasPadding = input.canvasPadding ?? DEFAULT_EMAIL_CANVAS_PADDING;
  const ctx: RenderContext = { input, theme, slots: [{ id: PREHEADER_SLOT_ID, kind: 'preheader' }], cardWidth };
  const { document } = input;

  const sections: string[] = [];
  const rootIds = document.root.childIds;
  const firstBlock = rootIds[0] ? document.blocks[rootIds[0]] : undefined;
  if (!isFullBleedImage(firstBlock)) sections.push(spacerSection(document.root.style.paddingTop, theme.cardColor));

  for (const id of rootIds) {
    const block = document.blocks[id];
    if (!block) continue;
    if (block.type === 'columns') {
      sections.push(renderColumns(block, ctx));
      continue;
    }
    const element = renderElement(block, ctx, cardWidth, false);
    if (!element) continue;
    sections.push(section(`<mj-column padding="0">${element}</mj-column>`, block.style.backgroundColor ?? theme.cardColor));
  }

  sections.push(spacerSection(document.root.style.paddingBottom, theme.cardColor));

  ctx.slots.push({ id: FOOTER_SLOT_ID, kind: 'footer' });
  const footerInset = DEFAULT_EMAIL_FOOTER_INSET;
  sections.push(
    section(
      `<mj-column padding="0"><mj-text padding="0 ${footerInset}px ${footerInset}px ${footerInset}px">${emailSlotToken(FOOTER_SLOT_ID)}</mj-text></mj-column>`,
      theme.cardColor
    )
  );

  const css = input.headCss ?? '';
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

  const body = `<mj-body background-color="${attr(theme.canvasColor)}" width="${cardWidth + canvasPadding * 2}px"><mj-wrapper padding="${canvasPadding}px" css-class="email-canvas">${sections.join('')}</mj-wrapper></mj-body>`;

  return { mjml: `<mjml>${head}${body}</mjml>`, slots: ctx.slots };
}
