/**
 * The Unarmed strike every creature is granted carries each FFG line's printed
 * unarmed rule (content#33): 1d5−3 Impact plus Strength Bonus, no penetration,
 * Primitive where that line's core prints it. IM keeps its own Unarmed.
 *
 *   DH2 p. 228 · DH1 p. 197 (Armour Points count double) · RT p. 245 (Primitive)
 *   DW p. 245 (Primitive) · BC p. 243 · OW p. 251
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';

const UNARMED = resolve(__dirname, '../src/packs-private/imperium-maledictum/im-core-items-weapons/_source/unarmed.json');

interface UnarmedSource {
    system: {
        damage: Record<string, { formula: string; type: string; bonus: number; penetration: number }>;
        special: Record<string, string[]>;
        source: Record<string, { provenance: string; book?: string; page?: string }>;
    };
}

describe.skipIf(!HAS_PRIVATE_CONTENT || !existsSync(UNARMED))('the printed Unarmed strike per line (content#33)', () => {
    const unarmed = JSON.parse(readFileSync(UNARMED, 'utf8')) as UnarmedSource;

    it.each([
        ['dh2', [], 'DH2: Core Rulebook', '228'],
        ['dh1', ['primitive'], 'DH: Core Rulebook', '197'],
        ['rt', ['primitive'], 'RT: Core Rulebook', '245'],
        ['dw', ['primitive'], 'DW: Core Rulebook', '245'],
        ['bc', [], 'BC: Core Rulebook', '243'],
        ['ow', [], 'OW: Core Rulebook', '251'],
    ])('%s: 1d5−3 Impact, Pen 0, qualities %j, from %s p. %s', (line, special, book, page) => {
        expect(unarmed.system.damage[line]).toEqual({ formula: '1d5', type: 'impact', bonus: -3, penetration: 0 });
        expect(unarmed.system.special[line]).toEqual(special);
        expect(unarmed.system.source[line]).toEqual({ provenance: 'raw', book, page });
    });

    it('leaves IM its own Unarmed', () => {
        expect(unarmed.system.damage['im']).toEqual({ formula: '1d10', type: 'physical', bonus: 0, penetration: 0 });
        expect(unarmed.system.special['im']).toEqual([]);
        expect(unarmed.system.source['im']).toMatchObject({ provenance: 'raw', book: 'IM: Core Rulebook' });
    });
});
