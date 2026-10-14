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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconUrlFor, isGameIconUrl } from '../scripts/pack-icon-map.mjs';

const PACKS_ROOT = resolve(__dirname, '../src/packs-private');

/** The conditions reported broken in the picker. */
const REPORTED = ['Blinded', 'Fire', 'Blood Loss', 'Deafened', 'Pinned', 'Stunned', 'Insanity', 'Concealed'];

interface ConditionDoc {
    name: string;
    type: string;
    img: string;
}

/** A `_source` file, following a whole-file `reference` stub to the document it shares. */
function resolveSource(file: string): ConditionDoc {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { reference?: string; name?: string; img?: string } & Partial<ConditionDoc>;
    if (typeof raw.reference !== 'string') return raw as ConditionDoc;
    const target = raw.reference.startsWith('packs/') ? resolve(PACKS_ROOT, raw.reference.slice('packs/'.length)) : resolve(dirname(file), raw.reference);
    const body = resolveSource(target);
    return { ...body, ...(raw.name === undefined ? {} : { name: raw.name }), ...(raw.img === undefined ? {} : { img: raw.img }) };
}

/** Every document in every line's `*-items-conditions` pack, references resolved. */
function conditionDocs(): Array<{ file: string; doc: ConditionDoc }> {
    if (!existsSync(PACKS_ROOT)) return [];
    const out: Array<{ file: string; doc: ConditionDoc }> = [];
    for (const line of readdirSync(PACKS_ROOT, { withFileTypes: true })) {
        if (!line.isDirectory()) continue;
        for (const pack of readdirSync(join(PACKS_ROOT, line.name), { withFileTypes: true })) {
            if (!pack.isDirectory() || !pack.name.endsWith('-items-conditions')) continue;
            const dir = join(PACKS_ROOT, line.name, pack.name, '_source');
            for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
                const file = join(dir, name);
                out.push({ file, doc: resolveSource(file) });
            }
        }
    }
    return out;
}

const DOCS = conditionDocs();

describe.skipIf(DOCS.length === 0)('condition picker art', () => {
    it.each(REPORTED)('%s carries the game-icons default the reviewed table picks, in every line that has it', (name) => {
        const copies = DOCS.filter(({ doc }) => doc.name === name && doc.type === 'condition');
        expect(copies.length).toBeGreaterThan(0);
        const expected = iconUrlFor({ name, type: 'condition', system: {} });
        expect(isGameIconUrl(expected)).toBe(true);
        // IM authors its own Blinded / Deafened / Stunned with a placeholder of its own, not the shared DH2 art.
        const shared = copies.filter(({ file }) => !file.includes('/im-core-items-conditions/'));
        expect(shared.map(({ doc }) => doc.img)).toEqual(shared.map(() => expected));
    });

    it('no condition points at art the system does not serve', () => {
        const unserved = DOCS.filter(({ doc }) => /_vendored-ui\/|systems\/wh40k-rpg\/icons\//u.test(doc.img)).map(({ file }) => file);
        expect(unserved).toEqual([]);
    });
});
