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
    expect(output.mjml).toContain('width="610px"');
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

  it('lets a full-width image skip the top padding', () => {
    let document = createEmptyDocument('email');
    const image = createBlock('image', 'email', { style: { fullWidth: true } });
    document = insertBlock(document, image, { parentId: 'root', region: 0, index: 0 });
    const output = build(document, { [`${OWNER}.block.${image.id}.src`]: { da: 'https://cdn.example.com/a.png' } });
    expect(output.mjml).toContain('<mj-image src="https://cdn.example.com/a.png"');
    expect(output.mjml).toContain('width="570px"');
    expect(output.mjml.indexOf('mj-spacer height="24px"')).toBe(-1);
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
