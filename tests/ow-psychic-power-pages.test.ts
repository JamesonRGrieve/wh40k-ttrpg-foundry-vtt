/**
 * Guard: every Only War psychic power cites a page in the OW core rules' psychic
 * powers chapter (content#39).
 *
 * Endurance cited the page of the Athletics skill, and seventeen other powers
 * cited a page in the armoury chapter. The expected pages — the chapter's printed
 * span and the page each corrected power starts on — are content, so they live in
 * the private content repo (`checks/ow-psychic-power-pages.json`), not here.
 *
 * The OW core book is not named here: it is the book most of the OW branches'
 * raw psychic-power citations name.
 *
 * The OW branch of a power can live on a canonical in another line's pack (the
 * DH2 core powers carry `source.ow`, and the OW pack stubs them), so every
 * `psychicPower` source document is read, whatever its group.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';

const ROOT = resolve(__dirname, '../src/packs-private');

/** The expected pages, as the private content authors them. */
interface PageChecks {
    /** The psychic powers chapter's printed span, inclusive. */
    chapter: { first: number; last: number };
    /** Each corrected power's name and the page it starts on. */
    powers: Record<string, string>;
}

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

/**
 * Every psychic power with a raw citation of the OW core book: its file, name and
 * cited page. The core book is the one most raw OW psychic-power citations name.
 */
function owCorePowers(): Array<{ file: string; name: string; page: string }> {
    const byBook = new Map<string, Array<{ file: string; name: string; page: string }>>();
    for (const path of sourceFiles(ROOT)) {
        const doc = JSON.parse(readFileSync(path, 'utf8')) as PackDoc;
        const ow = doc.system?.source?.ow;
        if (doc.reference !== undefined || doc.type !== 'psychicPower' || ow?.provenance !== 'raw' || ow.book === undefined) continue;
        const powers = byBook.get(ow.book) ?? [];
        powers.push({ file: relative(ROOT, path), name: doc.name ?? '', page: ow.page ?? '' });
        byBook.set(ow.book, powers);
    }
    let core: Array<{ file: string; name: string; page: string }> = [];
    for (const powers of byBook.values()) if (powers.length > core.length) core = powers;
    return core;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('Only War psychic powers cite the OW core psychic powers chapter (content#39)', () => {
    // Read in beforeAll: a skipped describe's body still runs to collect its tests.
    let powers: Array<{ file: string; name: string; page: string }> = [];
    let checks: PageChecks = { chapter: { first: 0, last: 0 }, powers: {} };
    beforeAll(() => {
        powers = owCorePowers();
        checks = JSON.parse(readFileSync(resolve(ROOT, 'checks/ow-psychic-power-pages.json'), 'utf8')) as PageChecks;
    });

    it('finds the OW core powers and the expected pages, so the guard is not vacuous', () => {
        expect(powers.length).toBeGreaterThanOrEqual(30);
        expect(checks.chapter.first).toBeGreaterThan(0);
        expect(checks.chapter.last).toBeGreaterThanOrEqual(checks.chapter.first);
        expect(Object.keys(checks.powers).length).toBeGreaterThan(0);
    });

    it('every OW core psychic power cites a page inside the psychic powers chapter', () => {
        const { first, last } = checks.chapter;
        const inChapter = (page: string): boolean => /^\d+$/.test(page) && Number(page) >= first && Number(page) <= last;
        const offenders = powers.filter((power) => !inChapter(power.page)).map((power) => `${power.name} (${power.file}): ${power.page}`);
        expect(offenders).toEqual([]);
    });

    it('cites the page each corrected power starts on', () => {
        const pageOf = new Map(powers.map((power) => [power.name, power.page]));
        const expected = Object.entries(checks.powers);
        expect(expected.map(([name]) => [name, pageOf.get(name)])).toEqual(expected);
    });
});
