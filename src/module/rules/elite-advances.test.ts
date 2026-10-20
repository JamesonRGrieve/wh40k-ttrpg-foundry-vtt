import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import { isLineOriginPack } from '../utils/line-packs.ts';
import { eliteEntries, type LineOriginEntry, lineHasEliteAdvances, ownedEliteSources } from './elite-advances.ts';

/**
 * The advancement dialog's Elite Advances tab (#684). It showed on every aptitude
 * line from a hard-coded DH2 core pack, so OW and BC got an empty tab and DH2 missed
 * the elites printed in its other books; owned elites were matched by name. A line's
 * elites are now the elite-step documents of that line in its origin packs, the tab
 * shows only when there are some, and an owned elite is matched by its compendium source.
 */

const PSYKER = 'Compendium.wh40k-rpg.dh2-core-origins-elite-advances.Item.DH2PsyElt0000002';
const INQUISITOR = 'Compendium.wh40k-rpg.dh2-core-origins-elite-advances.Item.DH2InqElt0000001';

const DH2_ORIGINS: LineOriginEntry[] = [
    { uuid: 'Compendium.wh40k-rpg.dh2-core-origins-homeworlds.Item.hive', name: 'Hive World', system: { step: 'homeWorld', gameSystems: ['dh2', 'dh1'] } },
    { uuid: INQUISITOR, name: 'Inquisitor', system: { step: 'elite', gameSystems: ['dh2'] } },
    { uuid: PSYKER, name: 'Psyker', system: { step: 'elite', gameSystems: ['dh2'] } },
];
const OW_ORIGINS: LineOriginEntry[] = [
    {
        uuid: 'Compendium.wh40k-rpg.ow-core-origins-specialities.Item.psyker',
        name: 'Sanctioned Psyker',
        system: { step: 'speciality', grantsPsychicPowers: true, gameSystems: ['ow'] },
    },
];
/** BC's archetype pack references DH2's Psyker elite advance: a DH2 document, not a BC elite. */
const BC_ORIGINS: LineOriginEntry[] = [
    { uuid: 'Compendium.wh40k-rpg.bc-core-origins-archetypes.Item.chosen', name: 'Chosen', system: { step: 'archetype', gameSystems: ['bc'] } },
    { uuid: 'Compendium.wh40k-rpg.bc-core-origins-archetypes.Item.psyker', name: 'Psyker', system: { step: 'elite', gameSystems: ['dh2'] } },
];

describe('elite advances', () => {
    it("finds the line's elite-step documents, in pack order", () => {
        expect(eliteEntries(DH2_ORIGINS, 'dh2').map((entry) => entry.name)).toEqual(['Inquisitor', 'Psyker']);
    });

    it('shows the tab only for a line whose books print elites of its own', () => {
        expect(lineHasEliteAdvances(DH2_ORIGINS, 'dh2')).toBe(true);
        expect(lineHasEliteAdvances(OW_ORIGINS, 'ow')).toBe(false);
        expect(lineHasEliteAdvances(BC_ORIGINS, 'bc')).toBe(false);
        expect(lineHasEliteAdvances([], 'dh2')).toBe(false);
    });

    it('takes a document naming no line as its pack’s, and a single gameSystem as its line', () => {
        expect(lineHasEliteAdvances([{ uuid: 'a', name: 'A', system: { step: 'elite' } }], 'dh2')).toBe(true);
        expect(lineHasEliteAdvances([{ uuid: 'a', name: 'A', system: { step: 'elite', gameSystem: 'dh1' } }], 'dh2')).toBe(false);
    });

    it('matches an owned elite by its compendium source, so a renamed one stays owned', () => {
        const items = [
            { name: 'Sanctioned by the Ordos (renamed Psyker)', isOriginPath: true, system: { step: 'elite' }, _stats: { compendiumSource: PSYKER } },
            // Same name as an elite, but not created from one: not an owned elite.
            { name: 'Inquisitor', isOriginPath: true, system: { step: 'background' }, _stats: { compendiumSource: 'Compendium.x.y.Item.z' } },
            { name: 'Inquisitor', isOriginPath: false, system: { step: 'elite' }, _stats: null },
        ];
        const owned = ownedEliteSources(items);
        expect([...owned]).toEqual([PSYKER]);
        expect(eliteEntries(DH2_ORIGINS, 'dh2').map((entry) => owned.has(entry.uuid))).toEqual([false, true]);
    });
});

const PRIVATE_ROOT = resolve(__dirname, '../../../src/packs-private');

/** A pack `_source` file: a document, or a reference stub to another pack's (`{reference}`), which the compiler resolves. */
function readSourceDoc(path: string): { _id: string; name: string; system: object } {
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); narrowed to the fields this reads
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { reference?: string; _id?: string; name?: string; system?: object };
    if (typeof raw.reference === 'string') return readSourceDoc(join(PRIVATE_ROOT, raw.reference.replace(/^packs\//, '')));
    // A pack's folder records carry no system data; the index gives them none either.
    const { _id = '', name = '', system = {} } = raw;
    return { _id, name, system };
}

/** The documents in `line`'s origin packs in the private content, as compiled, for the dialog's walk. */
function privateLineOrigins(line: string): LineOriginEntry[] {
    const packDirs = readdirSync(PRIVATE_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((group) =>
            readdirSync(join(PRIVATE_ROOT, group.name), { withFileTypes: true })
                .filter((pack) => pack.isDirectory() && isLineOriginPack(pack.name, line))
                .map((pack) => join(PRIVATE_ROOT, group.name, pack.name, '_source')),
        );
    return packDirs.flatMap((dir) =>
        readdirSync(dir)
            .filter((file) => file.endsWith('.json'))
            .map((file) => {
                const doc = readSourceDoc(join(dir, file));
                return { uuid: doc._id, name: doc.name, system: doc.system };
            }),
    );
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('elite advances in each line’s real origin packs (#684)', () => {
    it('DH2 has the tab, with elites from every book that prints them', () => {
        const origins = privateLineOrigins('dh2');
        expect(lineHasEliteAdvances(origins, 'dh2')).toBe(true);
        expect(eliteEntries(origins, 'dh2').map((entry) => entry.name)).toEqual(
            expect.arrayContaining(['Inquisitor', 'Psyker', 'Untouchable', 'Astropath', 'Sister of Battle']),
        );
    });

    it.each(['ow', 'bc'])('%s has no Elite Advances tab', (line) => {
        expect(lineHasEliteAdvances(privateLineOrigins(line), line)).toBe(false);
    });

    it("BC's archetype pack does reference DH2's Psyker elite advance, which is not a BC elite", () => {
        const referenced = privateLineOrigins('bc').filter((entry) => 'step' in entry.system && entry.system.step === 'elite');
        expect(referenced.map((entry) => entry.name)).toEqual(['Psyker']);
        expect(eliteEntries(referenced, 'bc')).toEqual([]);
    });
});
