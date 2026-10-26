/**
 * The effect picker's condition art (#625 follow-up).
 *
 * The Effect Creation dialog's condition picker shows each condition's own
 * compendium `img` (`conditionPickerRows` → the condition catalogue built from
 * the condition packs). Blinded, Fire, Blood Loss, Deafened, Pinned, Stunned,
 * Insanity and Concealed rendered as broken images there while they still
 * pointed at the removed `_vendored-ui` art. They must carry the game-icons
 * default the reviewed table picks for them (`scripts/pack-icon-map.json`
 * `rules.conditionName`), and every line's copy (the reference stubs into the
 * DH2 / RT canonical documents) must resolve to that same art.
 */
import { describe, expect, it } from 'vitest';
import { iconUrlFor, isGameIconUrl } from '../scripts/pack-icon-map.mjs';
import { conditionDocs } from './helpers/condition-docs.ts';

/** The conditions reported broken in the picker. */
const REPORTED = ['Blinded', 'Fire', 'Blood Loss', 'Deafened', 'Pinned', 'Stunned', 'Insanity', 'Concealed'];

const DOCS = conditionDocs();

describe.skipIf(DOCS.length === 0)('condition picker art', () => {
    it.each(REPORTED)('%s carries the game-icons default the reviewed table picks, in every line that has it', (name) => {
        const copies = DOCS.filter(({ doc }) => doc.name === name && doc.type === 'condition');
        expect(copies.length).toBeGreaterThan(0);
        const expected = iconUrlFor({ name, type: 'condition', system: {} });
        expect(isGameIconUrl(expected)).toBe(true);
        // IM's own Blinded / Deafened / Stunned now carry the same art too (#699).
        expect(copies.map(({ doc }) => doc.img)).toEqual(copies.map(() => expected));
    });

    it('no condition points at art the system does not serve', () => {
        const unserved = DOCS.filter(({ doc }) => /_vendored-ui\/|systems\/wh40k-rpg\/icons\//u.test(doc.img)).map(({ file }) => file);
        expect(unserved).toEqual([]);
    });
});
