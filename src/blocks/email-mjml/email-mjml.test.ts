import { describe, expect, it } from 'vitest';
import { createBlock, createEmptyDocument, createLegacyDocument, insertBlock, readBlockText, type BlockDocument, type TextMap } from '../index';
import { buildEmailMjml, buttonRawHtml, emailSlotToken, fillEmailSlots, styleButtonHtml, type EmailShellTheme } from './index';

const OWNER = 'email.invitation';

const theme: EmailShellTheme = {
  canvasColor: '#f5f8fa',
  cardColor: '#ffffff',
  textColor: '#1f363d',
  fontFamily: "Poppins, 'Segoe UI', sans-serif",
  buttonBackground: '#0f766e',
  buttonText: '#ffffff',
  dividerColor: '#e5e7eb',
};

function build(document: BlockDocument, texts: TextMap) {
  return buildEmailMjml({
    document,
    readText: (block, field) => readBlockText(texts, OWNER, block, field, 'da'),
    theme,
  });
}

describe('buildEmailMjml', () => {
  it('renders the legacy document as one classic slot plus preheader and footer', () => {
    const output = build(createLegacyDocument('email', { edgeToEdgeFirstImage: true }), { [`${OWNER}.content`]: { da: '<p>Hej {{guest.first_name}}</p>' } });
    expect(output.slots.map((slot) => slot.kind)).toEqual(['preheader', 'classic', 'footer']);
    const classic = output.slots[1];
    expect(classic?.kind === 'classic' && classic.edgeToEdgeFirstImage).toBe(true);
    expect(classic?.kind === 'classic' && classic.raw).toContain('{{guest.first_name}}');
    expect(output.mjml).toContain(emailSlotToken('classic'));
    expect(output.mjml).not.toContain('{{');
    expect(output.mjml).toContain('<mj-body background-color="#f5f8fa" width="570px" css-class="email-canvas">');
  });

  it('paints background images on blocks, the card and the canvas', () => {
    let document = createEmptyDocument('email');
    const text = createBlock('text', 'email', { style: { backgroundImage: 'https://cdn.example.com/block.jpg' } });
    document = insertBlock(document, text, { parentId: 'root', region: 0, index: 0 });
    const output = buildEmailMjml({
      document,
      readText: (block, field) => readBlockText({ [`${OWNER}.block.${text.id}.html`]: { da: '<p>Hej</p>' } }, OWNER, block, field, 'da'),
      theme: { ...theme, cardImage: 'https://cdn.example.com/card.jpg', canvasImage: 'https://cdn.example.com/canvas.jpg' },
      transformUrl: (url) => url.replace('cdn.example.com', 'img.example.com'),
    });
    expect(output.mjml).toContain('background-url="https://img.example.com/block.jpg" background-size="cover"');
    expect(output.mjml).toContain('<mj-wrapper padding="0" background-color="#ffffff" background-url="https://img.example.com/card.jpg"');
    expect(output.mjml).toContain('.email-canvas { background-image: url("https://img.example.com/canvas.jpg")');
    // With a card image, sections without a color of their own stay transparent so it shows.
    expect(output.mjml).not.toContain('<mj-section background-color="#ffffff"');
  });

  it('drops background image URLs that could break out of CSS', () => {
    const output = build(createEmptyDocument('email'), {});
    const unsafe = buildEmailMjml({ document: createEmptyDocument('email'), readText: () => '', theme: { ...theme, canvasImage: 'https://x.com/a.jpg"); color: red; ("' } });
    expect(unsafe.mjml).not.toContain('background-image');
    // Sections leave the card color to the wrapper behind them.
    expect(output.mjml).not.toContain('<mj-section background-color=');
    expect(output.mjml).toContain('<mj-wrapper padding="0" background-color="#ffffff"');
  });

  it('rounds the card and keeps canvas beside it on narrow screens', () => {
    const output = buildEmailMjml({ document: createEmptyDocument('email'), readText: () => '', theme: { ...theme, cardRadius: 16 } });
    expect(output.mjml).toContain('border-radius="16px" css-class="email-card-stack"');
    expect(output.mjml).toContain('.email-card-stack { overflow: hidden; }');
    expect(output.mjml).toContain('@media only screen and (max-width: 593px) { .email-card-stack { margin-left: 12px !important;');
    expect(build(createEmptyDocument('email'), {}).mjml).not.toContain('border-radius=');
  });

  it('leaves the footer out when the email hides it', () => {
    const legacy = createLegacyDocument('email');
    const hidden = { ...legacy, root: { ...legacy.root, style: { ...legacy.root.style, showFooter: false } } };
    const output = build(hidden, { [`${OWNER}.content`]: { da: '<p>Hej</p>' } });
    expect(output.slots.map((slot) => slot.kind)).toEqual(['preheader', 'classic']);
    expect(output.mjml).not.toContain(emailSlotToken('footer'));
  });

  it('sets heading blocks in the heading font', () => {
    let document = createEmptyDocument('email');
    const heading = createBlock('heading', 'email');
    document = insertBlock(document, heading, { parentId: 'root', region: 0, index: 0 });
    const texts = { [`${OWNER}.block.${heading.id}.html`]: { da: 'Velkommen' } };
    const readText = (block: Parameters<typeof readBlockText>[2], field: Parameters<typeof readBlockText>[3]) => readBlockText(texts, OWNER, block, field, 'da');

    const output = buildEmailMjml({ document, readText, theme: { ...theme, headingFontFamily: "Georgia, 'Times New Roman', serif" } });
    expect(output.mjml).toContain("font-family: Georgia, 'Times New Roman', serif !important");
    expect(build(document, texts).mjml).toContain(`font-family: ${theme.fontFamily} !important`);
  });

  it('puts the card color behind every block and keeps the canvas free of borders, for dark mode', () => {
    const output = build(createLegacyDocument('email'), {});
    expect(output.mjml).toContain('<mj-wrapper padding="0" background-color="#ffffff" css-class="email-card-stack">');
    expect(output.mjml).toContain('<mj-spacer height="20px" padding="0" /></mj-column></mj-section><mj-wrapper');
    expect(output.mjml).not.toContain('border=');
  });

  it('skips empty blocks and builds a link-tag button', () => {
    let document = createEmptyDocument('email');
    const text = createBlock('text', 'email', { taken: document.blocks });
    const button = createBlock('button', 'email', { taken: { ...document.blocks, [text.id]: true } });
    document = insertBlock(document, text, { parentId: 'root', region: 0, index: 0 });
    document = insertBlock(document, button, { parentId: 'root', region: 0, index: 1 });
    const output = build(document, {
      [`${OWNER}.block.${button.id}.label`]: { da: 'Tilmeld; nu' },
      [`${OWNER}.block.${button.id}.href`]: { da: '{{guest.registration_form_url}}' },
    });
    expect(output.slots.map((slot) => slot.kind)).toEqual(['preheader', 'button', 'footer']);
    const slot = output.slots[1];
    expect(slot?.kind === 'button' && slot.raw).toBe('{{guest.registration_form_url;Tilmeld, nu}}');
  });

  it('leaves the space above an opening image to the document top spacing', () => {
    let document = createEmptyDocument('email');
    const image = createBlock('image', 'email', { style: { fullWidth: true } });
    document = insertBlock(document, image, { parentId: 'root', region: 0, index: 0 });
    const texts = { [`${OWNER}.block.${image.id}.src`]: { da: 'https://cdn.example.com/a.png' } };

    const flush = build({ ...document, root: { ...document.root, style: { ...document.root.style, paddingTop: 0 } } }, texts);
    expect(flush.mjml).toContain('width="570px" align="center" padding="0px 0px 8px 0px"');
    expect(flush.mjml).not.toContain('mj-spacer height="0px"');

    const spaced = build({ ...document, root: { ...document.root, style: { ...document.root.style, paddingTop: 40 } } }, texts);
    expect(spaced.mjml).toContain('mj-spacer height="40px"');
  });

  it('applies the document side spacing to each top-level block, except full-width ones', () => {
    let document = createEmptyDocument('email');
    document = { ...document, root: { ...document.root, style: { ...document.root.style, paddingX: 20 } } };
    const text = createBlock('text', 'email', { taken: document.blocks });
    document = insertBlock(document, text, { parentId: 'root', region: 0, index: 0 });
    const divider = createBlock('divider', 'email', { taken: document.blocks, style: { fullWidth: true } });
    document = insertBlock(document, divider, { parentId: 'root', region: 0, index: 1 });
    const output = build(document, { [`${OWNER}.block.${text.id}.html`]: { da: '<p>Hej</p>' } });
    expect(output.mjml).toContain('<mj-text padding="8px 20px 8px 20px"');
    expect(output.mjml).toContain('<mj-divider border-color="#e5e7eb" border-width="1px" border-style="solid" padding="16px 0px 16px 0px"');
  });

  it('gives blocks inside columns no side spacing of their own', () => {
    let document = createEmptyDocument('email');
    const columns = createBlock('columns', 'email', { taken: document.blocks });
    document = insertBlock(document, columns, { parentId: 'root', region: 0, index: 0 });
    const text = createBlock('text', 'email', { taken: document.blocks });
    document = insertBlock(document, text, { parentId: columns.id, region: 0, index: 0 });
    const output = build(document, { [`${OWNER}.block.${text.id}.html`]: { da: '<p>Hej</p>' } });
    expect(output.mjml).toContain('padding="8px 35px 8px 35px" css-class="email-card"');
    expect(output.mjml).toContain('<mj-text padding="8px 0px 8px 0px"');
  });
});

describe('buttons', () => {
  it('escapes plain links and drops unsafe schemes', () => {
    expect(buttonRawHtml('Go <now>', 'example.com/a?b=1&c=2')).toBe('<a href="https://example.com/a?b=1&amp;c=2" target="_blank">Go &lt;now&gt;</a>');
    expect(buttonRawHtml('Go', 'javascript:alert(1)')).toBe('<span>Go</span>');
  });

  it('styles the anchors the tag resolver produced', () => {
    const styled = styleButtonHtml('<a href="https://x.dk" style="color:red" class="event-button">Go</a>', 'color: white');
    expect(styled).toBe('<a href="https://x.dk" style="color: white">Go</a>');
    expect(styleButtonHtml('<span>Go</span>', 'color: white')).toBe('<span style="color: white">Go</span>');
  });

  it('fills slots without regex replacement surprises', () => {
    const html = `<div>${emailSlotToken('a')}</div>`;
    expect(fillEmailSlots(html, [{ id: 'a', kind: 'footer' }], { a: '$& $1' })).toBe('<div>$& $1</div>');
  });
});
