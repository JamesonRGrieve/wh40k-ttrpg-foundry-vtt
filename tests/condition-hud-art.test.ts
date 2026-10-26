/**
 * Each condition in the token HUD's status palette has its own glyph (#699).
 *
 * The palette shows every condition document's own `img`. Twelve diseases and
 * Toxic all used Foundry's `icons/svg/poison.svg`, and Imperium Maledictum's
 * thirteen conditions all used the mystery-man placeholder. So about fifteen
 * palette buttons were the same face. Each now carries the art the reviewed
 * table (`scripts/pack-icon-map.json` `rules.conditionName`) picks for its name,
 * or, for an IM condition with a same-named counterpart, that counterpart's art.
 */
import { describe, expect, it } from 'vitest';
import { ICON_TABLE, iconUrlFor } from '../scripts/pack-icon-map.mjs';
import { CONDITION_PLACEHOLDER_ART, conditionDocs, nonSynonymArtClashes } from './helpers/condition-docs.ts';

const DOCS = conditionDocs().filter(({ doc }) => doc.type === 'condition');
const PLACEHOLDERS: readonly string[] = CONDITION_PLACEHOLDER_ART;

describe.skipIf(DOCS.length === 0)('token HUD condition art (#699)', () => {
    it('no condition carries a placeholder glyph', () => {
        const placeholder = DOCS.filter(({ doc }) => PLACEHOLDERS.includes(doc.img)).map(({ doc }) => doc.name);
        expect(placeholder).toEqual([]);
    });

    it('every condition the table names carries its art, in every line', () => {
        const wrong = DOCS.filter(({ doc }) => doc.name in ICON_TABLE.rules.conditionName)
            .filter(({ doc }) => doc.img !== iconUrlFor({ name: doc.name, type: 'condition', system: {} }))
            .map(({ doc, file }) => `${doc.name} (${file.split('/src/packs-private/')[1] ?? file}): ${doc.img}`);
        expect(wrong).toEqual([]);
    });

    it('two differently named conditions share a glyph only when they are synonyms', () => {
        expect(nonSynonymArtClashes(DOCS.map(({ doc }) => doc))).toEqual([]);
    });

    it('the clash check catches two unrelated conditions on one glyph', () => {
        expect(
            nonSynonymArtClashes([
                { name: 'Grey Fever', img: 'x.svg' },
                { name: 'Eye Rot', img: 'x.svg' },
                { name: 'Fire', img: 'y.svg' },
                { name: 'Ablaze', img: 'y.svg' },
            ]),
        ).toEqual(['x.svg: Grey Fever, Eye Rot']);
    });
});
