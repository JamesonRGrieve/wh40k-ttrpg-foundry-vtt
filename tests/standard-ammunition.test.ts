/**
 * A line's standard ammunition is flagged by `system.standard`, never by a
 * name prefix (#699).
 *
 * Fourteen ammunition items were named "! Default: Bullets" and the like. The
 * prefix sorted them to the top of the pack, and the origin-path builder
 * matched it to keep them out of its equipment choices. Players read the
 * prefix in every list. The flag now carries that meaning, so the builder
 * reads the flag and the names read like the book.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';

const ROOT = resolve(__dirname, '..');
const MODULE_ROOT = resolve(ROOT, 'src', 'module');
const PRIVATE_ROOT = resolve(ROOT, 'src', 'packs-private');

/** The editorial prefix the content used to carry. */
const DEFAULT_PREFIX = '! Default';

function walk(dir: string, accept: (path: string) => boolean, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, accept, out);
        else if (accept(path)) out.push(path);
    }
    return out;
}

const read = (path: string): string => readFileSync(path, 'utf8');

describe('standard ammunition is a flag, not a name (#699)', () => {
    it('no system module matches the old name prefix', () => {
        const offenders = walk(MODULE_ROOT, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts')).filter((p) => read(p).includes(DEFAULT_PREFIX));
        expect(offenders).toEqual([]);
    });

    it('the ammunition DataModel declares the standard flag', () => {
        const src = read(resolve(MODULE_ROOT, 'data', 'item', 'ammunition.ts'));
        expect(src).toMatch(/standard: new fields\.BooleanField\(\{ required: true, initial: false \}\)/u);
    });

    it('the origin-path builder skips standard ammunition by its flag', () => {
        const src = read(resolve(MODULE_ROOT, 'applications', 'character-creation', 'origin-path-builder.ts'));
        expect(src).toContain("'system.standard'");
        expect(src).toContain('entrySys?.standard === true');
    });
});

interface AmmoDoc {
    name: string;
    type: string;
    _id: string;
    system?: { standard?: boolean };
}

function ammunitionDocs(): Array<{ path: string; doc: AmmoDoc }> {
    return walk(PRIVATE_ROOT, (p) => p.endsWith('.json') && p.includes('_source'))
        .map((path) => ({ path, doc: JSON.parse(read(path)) as AmmoDoc }))
        .filter(({ doc }) => doc.type === 'ammunition');
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('standard ammunition in the packs (#699)', () => {
    it('no ammunition is named with the editorial prefix', () => {
        const prefixed = ammunitionDocs()
            .filter(({ doc }) => doc.name.startsWith('!'))
            .map(({ doc }) => doc.name);
        expect(prefixed).toEqual([]);
    });

    it('every formerly prefixed item is flagged standard', () => {
        const standard = ammunitionDocs()
            .filter(({ doc }) => doc.system?.standard === true)
            .map(({ doc }) => doc.name)
            .sort();
        expect(standard).toEqual(
            [
                'Arrows/Quarrels',
                'Backpack Ammo/Power Pack',
                'Backpack Ammo/Power Pack (Astartes)',
                'Bolt Shells',
                'Bullets',
                'Cartridge/Shells',
                'Charge Pack (Heavy)',
                'Charge Pack (pistol/basic)',
                'Exotic Ammo',
                'Fuel',
                'Melta Canisters (pistol/basic/heavy)',
                'Plasma Flasks (Heavy)',
                'Plasma Flasks (pistol/basic)',
                'Shot',
            ].sort(),
        );
    });
});
