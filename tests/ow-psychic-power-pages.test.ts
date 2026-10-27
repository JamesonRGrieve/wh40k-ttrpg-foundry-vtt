/**
 * Guard: every Only War psychic power cites a page in OW Core's psychic powers
 * chapter (content#39).
 *
 * Endurance cited OW Core p.116, which is the Athletics skill, and seventeen
 * other powers cited p.199, which is in the armoury chapter. Chapter VII,
 * "Psychic Powers", runs from its opener on printed p.221 to Hallucination on
 * p.238; Chapter VIII, "Combat", opens on p.239. The PDF index is the printed
 * page + 1, which the page footers confirm. The powers themselves sit on
 * pp.230–238: Biomancy 230–231, Divination 231–232, Pyromancy 233–234,
 * Telekinesis 234–236, Telepathy 237–238.
 *
 * The OW branch of a power can live on a canonical in another line's pack (the
 * DH2 core powers carry `source.ow`, and the OW pack stubs them), so every
 * `psychicPower` source document is read, whatever its group.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';

const ROOT = resolve(__dirname, '../src/packs-private');

/** The book string OW Core's raw citations carry. */
const OW_CORE = 'OW: Core Rulebook';

/** OW Core Chapter VII, Psychic Powers: printed pages, inclusive. */
const PSYCHIC_CHAPTER = { first: 221, last: 238 } as const;

interface OwSource {
    provenance?: string;
    book?: string;
    page?: string;
}

interface PackDoc {
    reference?: string;
    name?: string;
    type?: string;
    system?: { source?: { ow?: OwSource } };
}

/** Every pack source document's path. */
function sourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) files.push(...sourceFiles(path));
        else if (entry.name.endsWith('.json') && path.includes('/_source/')) files.push(path);
    }
    return files;
}

/** Every psychic power with a raw OW Core citation: its file, name and cited page. */
function owCorePowers(): Array<{ file: string; name: string; page: string }> {
    const powers: Array<{ file: string; name: string; page: string }> = [];
    for (const path of sourceFiles(ROOT)) {
        const doc = JSON.parse(readFileSync(path, 'utf8')) as PackDoc;
        const ow = doc.system?.source?.ow;
        if (doc.reference !== undefined || doc.type !== 'psychicPower' || ow?.provenance !== 'raw' || ow.book !== OW_CORE) continue;
        powers.push({ file: relative(ROOT, path), name: doc.name ?? '', page: ow.page ?? '' });
    }
    return powers;
}

/** Whether a cited page is a whole number inside the chapter. */
function inChapter(page: string): boolean {
    const n = Number(page);
    return /^\d+$/.test(page) && n >= PSYCHIC_CHAPTER.first && n <= PSYCHIC_CHAPTER.last;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('Only War psychic powers cite OW Core’s psychic powers chapter (content#39)', () => {
    const powers = owCorePowers();

    it('finds the OW Core powers, so the guard is not vacuous', () => {
        expect(powers.length).toBeGreaterThanOrEqual(30);
    });

    it(`every OW Core psychic power cites a page in pp.${PSYCHIC_CHAPTER.first}–${PSYCHIC_CHAPTER.last}`, () => {
        const offenders = powers.filter((power) => !inChapter(power.page)).map((power) => `${power.name} (${power.file}): p.${power.page}`);
        expect(offenders).toEqual([]);
    });

    it('cites the page each corrected power starts on', () => {
        const pageOf = new Map(powers.map((power) => [power.name, power.page]));
        expect(
            ['Endurance', 'Smite', 'Prescience', 'Flame Breath', 'Assail', 'Telekine Dome', 'Dominate', 'Terrify'].map((name) => [name, pageOf.get(name)]),
        ).toEqual([
            ['Endurance', '230'],
            ['Smite', '230'],
            ['Prescience', '231'],
            ['Flame Breath', '233'],
            ['Assail', '234'],
            ['Telekine Dome', '235'],
            ['Dominate', '237'],
            ['Terrify', '238'],
        ]);
    });
});
