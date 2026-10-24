import { describe, expect, it } from 'vitest';
import {
  CLASSIC_BLOCK_ID,
  copyBlockTexts,
  createBlock,
  createEmptyDocument,
  createLegacyDocument,
  diffTextMaps,
  documentTextKeys,
  duplicateBlock,
  findBlockLocation,
  insertBlock,
  isDocumentEmpty,
  isLegacyOnlyDocument,
  moveBlock,
  orphanedBlockTextKeys,
  parseBlockDocument,
  readLocalized,
  removeBlock,
  setColumnsLayout,
  textKeyForBlock,
  writeLocalized,
  type BlockDocument,
} from './index';

const OWNER = 'communication.0b1e7a2c-9f4d-4c1a-8e2b-5d6f7a8b9c0d';

function documentWith(...types: ('heading' | 'text' | 'button' | 'columns')[]): BlockDocument {
  let document = createEmptyDocument('email');
  for (const type of types) {
    const block = createBlock(type, 'email', { taken: document.blocks });
    document = insertBlock(document, block, { parentId: 'root', region: 0, index: document.root.childIds.length });
  }
  return document;
}

describe('legacy document', () => {
  it('reads the owner content key through the classic block', () => {
    const document = createLegacyDocument('email', { edgeToEdgeFirstImage: true });
    const classic = document.blocks[CLASSIC_BLOCK_ID];
    expect(classic?.type).toBe('classic');
    expect(classic && textKeyForBlock(OWNER, classic, 'html')).toBe(`${OWNER}.content`);
    expect(isLegacyOnlyDocument(document)).toBe(true);
  });

  it('stops being legacy-only once another block is added', () => {
    const legacy = createLegacyDocument('email');
    const next = insertBlock(legacy, createBlock('text', 'email', { taken: legacy.blocks }), { parentId: 'root', region: 0, index: 1 });
    expect(isLegacyOnlyDocument(next)).toBe(false);
  });
});

describe('tree operations', () => {
  it('moves, duplicates and removes blocks', () => {
    const document = documentWith('heading', 'text');
    const [headingId, textId] = document.root.childIds;
    expect(headingId && textId).toBeTruthy();
    if (!headingId || !textId) return;

    const moved = moveBlock(document, headingId, 1);
    expect(moved.root.childIds).toEqual([textId, headingId]);
    expect(moveBlock(moved, headingId, 1)).toBe(moved);

    const { document: duplicated, newId } = duplicateBlock(document, headingId);
    expect(newId).toBeTruthy();
    expect(duplicated.root.childIds).toEqual([headingId, newId, textId]);

    const { document: removed, removedIds } = removeBlock(duplicated, headingId);
    expect(removedIds).toEqual([headingId]);
    expect(removed.blocks[headingId]).toBeUndefined();
  });

  it('removes the children of a container with it', () => {
    let document = documentWith('columns');
    const columnsId = document.root.childIds[0] ?? '';
    const child = createBlock('text', 'email', { taken: document.blocks });
    document = insertBlock(document, child, { parentId: columnsId, region: 1, index: 0 });
    expect(findBlockLocation(document, child.id)).toEqual({ parentId: columnsId, region: 1, index: 0 });

    const { document: removed, removedIds } = removeBlock(document, columnsId);
    expect(removedIds).toEqual([columnsId, child.id]);
    expect(Object.keys(removed.blocks)).toHaveLength(0);
  });

  it('keeps blocks when a columns layout loses a column', () => {
    let document = documentWith('columns');
    const columnsId = document.root.childIds[0] ?? '';
    document = setColumnsLayout(document, columnsId, '33-33-33');
    const child = createBlock('button', 'email', { taken: document.blocks });
    document = insertBlock(document, child, { parentId: columnsId, region: 2, index: 0 });
    document = setColumnsLayout(document, columnsId, '50-50');
    expect(document.blocks[columnsId]?.children).toEqual([[], [child.id]]);
  });

  it('copies texts of duplicated blocks in every language', () => {
    const document = documentWith('text');
    const textId = document.root.childIds[0] ?? '';
    const key = `${OWNER}.block.${textId}.html`;
    const texts = { [key]: { da: '<p>Hej</p>', en: '<p>Hi</p>' } };
    const { document: duplicated, idMap, newId } = duplicateBlock(document, textId);
    const copied = copyBlockTexts(texts, OWNER, duplicated, idMap);
    expect(copied[`${OWNER}.block.${newId}.html`]).toEqual({ da: '<p>Hej</p>', en: '<p>Hi</p>' });
  });
});

describe('document parsing', () => {
  it('fills defaults and drops broken references', () => {
    const result = parseBlockDocument({
      version: 1,
      surface: 'email',
      root: { childIds: ['babc', 'missing'], style: { paddingTop: 999 } },
      blocks: { babc: { id: 'babc', type: 'heading', props: { level: 9 } }, bstray: { id: 'bstray', type: 'text' } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks.babc?.props).toEqual({ level: 2, align: 'left', color: null });
    expect(result.document.root.style.paddingTop).toBe(200);
    expect(result.issues).toHaveLength(2);
  });

  it('rejects containers inside containers and a second classic block', () => {
    const result = parseBlockDocument({
      version: 1,
      surface: 'email',
      root: { childIds: ['classic', 'bcols', 'bclassic2'] },
      blocks: {
        classic: { type: 'classic' },
        bclassic2: { type: 'classic' },
        bcols: { type: 'columns', props: { layout: '50-50' }, children: [['binner'], []] },
        binner: { type: 'columns' },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root.childIds).toEqual(['classic', 'bcols']);
    expect(result.document.blocks.bcols?.children).toEqual([[], []]);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects unsafe colors', () => {
    const result = parseBlockDocument({
      version: 1,
      surface: 'email',
      root: { childIds: ['btxt'] },
      blocks: { btxt: { type: 'text', props: { color: 'red;background:url(x)' }, style: { backgroundColor: 'rgba(0,0,0,0.5)' } } },
    });
    expect(result.ok && result.document.blocks.btxt?.props).toEqual({ align: 'left', color: null });
    expect(result.ok && result.document.blocks.btxt?.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
  });
});

describe('texts', () => {
  it('falls back to the default language', () => {
    expect(readLocalized({ da: 'Hej', en: '  ' }, 'en', ['da'])).toBe('Hej');
    expect(readLocalized(undefined, 'en', ['da'])).toBe('');
  });

  it('diffs only changed cells', () => {
    const before = { a: { da: 'x' } };
    const after = writeLocalized(writeLocalized(before, 'a', 'da', 'x'), 'a', 'en', 'y');
    expect(diffTextMaps(before, after)).toEqual([{ key: 'a', lang: 'en', value: 'y' }]);
  });

  it('lists keys and orphans', () => {
    const document = documentWith('button');
    const id = document.root.childIds[0] ?? '';
    expect(documentTextKeys(document, OWNER)).toEqual([`${OWNER}.block.${id}.label`, `${OWNER}.block.${id}.href`]);
    expect(orphanedBlockTextKeys(document, OWNER, [`${OWNER}.block.bgone.html`, `${OWNER}.subject`])).toEqual([`${OWNER}.block.bgone.html`]);
  });

  it('treats a document with only empty blocks as empty', () => {
    const document = documentWith('text', 'button');
    const textId = document.root.childIds[0] ?? '';
    expect(isDocumentEmpty(document, { ownerKey: OWNER, texts: {}, lang: 'da' })).toBe(true);
    const texts = { [`${OWNER}.block.${textId}.html`]: { da: '<p>{{guest.first_name}}</p>' } };
    expect(isDocumentEmpty(document, { ownerKey: OWNER, texts, lang: 'da' })).toBe(false);
  });
});
