/**
 * The Unarmed strike every creature is granted carries each FFG line's printed
 * unarmed rule (content#33): 1d5−3 Impact plus Strength Bonus, no penetration,
 * Primitive where that line's core prints it (DH1, RT, DW; DH1's Armour Points
 * also count double). IM keeps its own Unarmed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readDeclaredPacks } from '../scripts/lib/pack-manifest.mjs';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';
import { lineBookPacks } from '../src/module/utils/line-packs.ts';

const ROOT = resolve(__dirname, '..');

/** The shared Unarmed document, in whichever IM book weapons pack (selected by manifest flags) holds it. */
function unarmedPath(): string | undefined {
    const declared = readDeclaredPacks(ROOT).packs.map((pack) => ({ metadata: pack }));
    return lineBookPacks(declared, 'im', 'weapons')
        .map(({ metadata }) => resolve(ROOT, 'src/packs-private', metadata.path.replace(/^packs\//, ''), '_source/unarmed.json'))
        .find((path) => existsSync(path));
}

const UNARMED = unarmedPath();

interface UnarmedSource {
    system: {
        damage: Record<string, { formula: string; type: string; bonus: number; penetration: number }>;
        special: Record<string, string[]>;
        source: Record<string, { provenance: string; book?: string; page?: string }>;
    };
}

describe.skipIf(!HAS_PRIVATE_CONTENT || UNARMED === undefined)('the printed Unarmed strike per line (content#33)', () => {
    // Read in beforeAll: a skipped describe's body still runs to collect its tests.
    let unarmed: UnarmedSource;
    beforeAll(() => {
        unarmed = JSON.parse(readFileSync(UNARMED ?? '', 'utf8')) as UnarmedSource;
    });

    // Each line's branch cites its own line's book: the book carries the line's prefix.
    it.each([
        ['dh2', [], 'DH2'],
        ['dh1', ['primitive'], 'DH'],
        ['rt', ['primitive'], 'RT'],
        ['dw', ['primitive'], 'DW'],
        ['bc', [], 'BC'],
        ['ow', [], 'OW'],
    ])('%s: 1d5−3 Impact, Pen 0, qualities %j, a raw %s citation', (line, special, prefix) => {
        expect(unarmed.system.damage[line]).toEqual({ formula: '1d5', type: 'impact', bonus: -3, penetration: 0 });
        expect(unarmed.system.special[line]).toEqual(special);
        const source = unarmed.system.source[line];
        expect(source.provenance).toBe('raw');
        expect(source.book?.startsWith(`${prefix}: `)).toBe(true);
        expect(source.page).toMatch(/^[1-9]\d*$/u);
        expect(Object.keys(source).sort()).toEqual(['book', 'page', 'provenance']);
    });

    it('leaves IM its own Unarmed', () => {
        expect(unarmed.system.damage['im']).toEqual({ formula: '1d10', type: 'physical', bonus: 0, penetration: 0 });
        expect(unarmed.system.special['im']).toEqual([]);
        expect(unarmed.system.source['im'].provenance).toBe('raw');
        expect(unarmed.system.source['im'].book?.startsWith('IM: ')).toBe(true);
    });
});
