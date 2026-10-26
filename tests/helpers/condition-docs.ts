/**
 * Every condition document in the private content packs, with whole-file
 * `reference` stubs followed to the document they share. Shared by the suites
 * that check condition art (the effect picker and the token HUD palette).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const PACKS_ROOT = resolve(__dirname, '../../src/packs-private');

/** Placeholders a condition's palette button must never carry (#699). */
export const CONDITION_PLACEHOLDER_ART = ['icons/svg/poison.svg', 'icons/svg/mystery-man.svg'] as const;

/** Different names for one effect, which rightly share one glyph (#699). */
const CONDITION_ART_SYNONYMS: ReadonlyArray<readonly string[]> = [
    ['Ablaze', 'Fire'],
    ['Bleeding', 'Blood Loss'],
    ['Fear', 'Frightened'],
    ['Crippled', 'Useless Limb'],
];

/** Glyphs shared by differently named conditions that are not synonyms, as `img: names`. */
export function nonSynonymArtClashes(rows: ReadonlyArray<{ name: string; img: string }>): string[] {
    const namesByImg = new Map<string, Set<string>>();
    for (const { name, img } of rows) namesByImg.set(img, (namesByImg.get(img) ?? new Set()).add(name));
    const synonyms = (names: Set<string>): boolean => CONDITION_ART_SYNONYMS.some((group) => [...names].every((name) => group.includes(name)));
    return [...namesByImg.entries()].filter(([, names]) => names.size > 1 && !synonyms(names)).map(([img, names]) => `${img}: ${[...names].join(', ')}`);
}

export interface ConditionDoc {
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
export function conditionDocs(): Array<{ file: string; doc: ConditionDoc }> {
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
