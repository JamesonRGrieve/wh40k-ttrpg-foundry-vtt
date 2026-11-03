import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import { isLineOriginPack, type PackMetadataLike } from '../utils/line-packs.ts';
import {
    eliteCharge,
    eliteEntries,
    eliteXpCost,
    grantedEliteSources,
    isEliteStep,
    type LineOriginEntry,
    lineHasEliteAdvances,
    originSource,
    ownedEliteSources,
} from './elite-advances.ts';

/**
 * The advancement dialog's Elite Advances tab (#684). It showed on every aptitude
 * line from one hard-coded DH2 pack, so OW and BC got an empty tab and DH2 missed
 * the elites printed in its other books; owned elites were matched by name. A line's
 * elites are now the elite-step documents of that line in its origin packs, the tab
 * shows only when there are some, and an owned elite is matched by its compendium source.
 */

const PSYKER = 'Compendium.wh40k-rpg.dh2-elite-advances.Item.DH2PsyElt0000002';
const INQUISITOR = 'Compendium.wh40k-rpg.dh2-elite-advances.Item.DH2InqElt0000001';

const DH2_ORIGINS: LineOriginEntry[] = [
    { uuid: 'Compendium.wh40k-rpg.dh2-homeworlds.Item.hive', name: 'Hive World', system: { step: 'homeWorld', gameSystems: ['dh2', 'dh1'] } },
    { uuid: INQUISITOR, name: 'Inquisitor', system: { step: 'elite', gameSystems: ['dh2'] } },
    { uuid: PSYKER, name: 'Psyker', system: { step: 'elite', gameSystems: ['dh2'] } },
];
const OW_ORIGINS: LineOriginEntry[] = [
    {
        uuid: 'Compendium.wh40k-rpg.ow-specialities.Item.psyker',
        name: 'Sanctioned Psyker',
        system: { step: 'speciality', grantsPsychicPowers: true, gameSystems: ['ow'] },
    },
];
/** BC's archetype pack references DH2's Psyker elite advance: a DH2 document, not a BC elite. */
const BC_ORIGINS: LineOriginEntry[] = [
    { uuid: 'Compendium.wh40k-rpg.bc-archetypes.Item.chosen', name: 'Chosen', system: { step: 'archetype', gameSystems: ['bc'] } },
    { uuid: 'Compendium.wh40k-rpg.bc-archetypes.Item.psyker', name: 'Psyker', system: { step: 'elite', gameSystems: ['dh2'] } },
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

    it('recognises an elite the origin-path builder created, stamped only with the legacy core.sourceId', () => {
        const builderItem = { name: 'Psyker', isOriginPath: true, system: { step: 'elite' }, _stats: null, flags: { core: { sourceId: PSYKER } } };
        expect(originSource(builderItem)).toBe(PSYKER);
        expect([...ownedEliteSources([builderItem])]).toEqual([PSYKER]);
        // compendiumSource wins over the legacy stamp.
        expect(originSource({ _stats: { compendiumSource: INQUISITOR }, flags: { core: { sourceId: PSYKER } } })).toBe(INQUISITOR);
        expect(originSource({ _stats: null, flags: {} })).toBe('');
    });

    it('charges an elite its authored xpCost, and nothing when another origin grants it', () => {
        const mystic = { system: { step: 'role', grants: { elites: [PSYKER] } } };
        const hiveWorld = { system: { step: 'homeWorld', grants: {} } };
        const granted = grantedEliteSources([hiveWorld, mystic]);
        expect([...granted]).toEqual([PSYKER]);
        expect(eliteCharge({ step: 'elite', xpCost: 300 }, PSYKER, granted)).toBe(0);
        expect(eliteCharge({ step: 'elite', xpCost: 1000 }, INQUISITOR, granted)).toBe(1000);
        expect(eliteCharge({ step: 'elite', xpCost: 300 }, PSYKER, new Set())).toBe(300);
        // An unknown source is never treated as granted, and a missing cost is 0.
        expect(eliteCharge({ step: 'elite', xpCost: 300 }, '', new Set(['']))).toBe(300);
        expect(eliteXpCost({ step: 'elite' })).toBe(0);
        expect(isEliteStep({ step: 'elite' })).toBe(true);
        expect(isEliteStep({ step: 'role' })).toBe(false);
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
    // Select by each pack's declared flags in the private manifest, as the dialog does.
    const manifest = JSON.parse(readFileSync(join(PRIVATE_ROOT, 'system.packs.json'), 'utf8')) as { packs: PackMetadataLike[] };
    const declared = new Map(manifest.packs.map((pack) => [pack.name, pack]));
    const packDirs = readdirSync(PRIVATE_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((group) =>
            readdirSync(join(PRIVATE_ROOT, group.name), { withFileTypes: true })
                .filter((pack) => {
                    const metadata = declared.get(pack.name);
                    return pack.isDirectory() && metadata !== undefined && isLineOriginPack(metadata, line);
                })
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

    it("DH2's elites carry their printed Experience Cost and prerequisites, and the Mystic grants the Psyker", () => {
        const elites = new Map(
            eliteEntries(privateLineOrigins('dh2'), 'dh2').map((entry) => [
                entry.name,
                entry.system as { xpCost?: number; prerequisites?: Array<{ type: string; key: string; value?: number }> },
            ]),
        );
        const cost = (name: string): number | undefined => elites.get(name)?.xpCost;
        expect([cost('Inquisitor'), cost('Psyker'), cost('Untouchable'), cost('Sister of Battle'), cost('Astropath')]).toEqual([1000, 300, 300, 750, 300]);
        // An origin gate names its document by UUID; compare by document id, so no pack id is spelled here.
        const docId = (uuid: string): string => uuid.split('.').pop() ?? '';
        const idOf = (name: string): string => eliteEntries(privateLineOrigins('dh2'), 'dh2').find((entry) => entry.name === name)?.uuid ?? '';
        const gates = (name: string): string[] =>
            (elites.get(name)?.prerequisites ?? []).map(
                (p) => `${p.type}:${p.type === 'influence' || p.type === 'characteristic' ? `${p.key} ${String(p.value)}` : docId(p.key)}`,
            );
        expect(gates('Inquisitor')).toEqual(['influence:influence 75']);
        expect(gates('Psyker')).toEqual(['characteristic:willpower 40', `notOrigin:${idOf('Untouchable')}`]);
        expect(gates('Untouchable')).toEqual([`notOrigin:${idOf('Psyker')}`]);
        const mystic = privateLineOrigins('dh2').find((entry) => entry.name === 'Mystic');
        expect([...grantedEliteSources(mystic === undefined ? [] : [mystic])].map(docId)).toEqual([idOf('Psyker')]);
    });

    it('BC lists no elite advance of its own', () => {
        expect(eliteEntries(privateLineOrigins('bc'), 'bc')).toEqual([]);
    });
});
