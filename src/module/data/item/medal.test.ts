import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDeclaredPacks } from '../../../../scripts/lib/pack-manifest.mjs';
import { installFoundryDataStub, LeafField } from '../../testing/foundry-data-stub.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { lineBookPacks } from '../../utils/line-packs.ts';

/**
 * MedalData schema contract, and the Only War Medals and Honours authored
 * through it (content#32): the core rules' and a supplement's. The model evaluates `foundry.data.fields` at module load, so the
 * recording stub is installed before the dynamic import.
 */

afterAll(installFoundryDataStub());

const { default: MedalData } = await import('./medal.ts');
const { MEDAL_HONOUR_TYPES } = await import('../../rules/ow-regimental-award.ts');

const schema = MedalData.defineSchema();

function leaf(value: object | undefined): LeafField {
    if (!(value instanceof LeafField)) throw new Error('expected a leaf field');
    return value;
}

describe('MedalData schema (content#32)', () => {
    it('declares the book’s format: Description, Awarded For, Squad Bonus, and the honour type', () => {
        expect(schema).toHaveProperty('description');
        expect(leaf(schema['awardedFor']).options.initial).toBe('');
        expect(leaf(schema['squadBonus']).options.initial).toBe('');
        expect(leaf(schema['honourType']).options.choices).toEqual([...MEDAL_HONOUR_TYPES]);
        expect(leaf(schema['honourType']).options.initial).toBe('regimental');
    });
});

interface MedalSource {
    name: string;
    type: string;
    system: {
        honourType: string;
        awardedFor: string;
        squadBonus: string;
        source: { ow: { provenance: string; book: string; page: string } };
        gameSystems: string[];
    };
}

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** The medals in a declared pack's `_source`, read from the private content root. */
function load(path: string | undefined): MedalSource[] {
    if (path === undefined) throw new Error('missing an OW medals pack');
    const dir = resolve(REPO_ROOT, 'src/packs-private', path.replace(/^packs\//, ''), '_source');
    return readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as MedalSource);
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('the printed Only War medals (content#32)', () => {
    // Read in beforeAll: a skipped describe's body still runs to collect its tests.
    let core: MedalSource[] = [];
    let supplement: MedalSource[] = [];
    beforeAll(() => {
        // OW's medals packs, in manifest order: the core rules', then the supplement's.
        const packs = lineBookPacks(
            readDeclaredPacks(REPO_ROOT).packs.map((metadata) => ({ metadata })),
            'ow',
            'medals',
        );
        if (packs.length !== 2) throw new Error(`expected two OW medals packs, found ${packs.length}`);
        core = load(packs.at(0)?.metadata.path);
        supplement = load(packs.at(1)?.metadata.path);
    });
    const summary = (medals: MedalSource[]): string[][] =>
        medals.map((medal) => [medal.name, medal.system.honourType]).sort((a, b) => (a.at(0) ?? '').localeCompare(b.at(0) ?? ''));

    it('OW rules: the six Imperial Honours, four Campaign Honours and the example Regimental Award', () => {
        expect(summary(core)).toEqual([
            ['Cog of Het', 'campaign'],
            ['Drusian Laurels', 'campaign'],
            ['Honorifica Imperialis', 'imperial'],
            ['Macharian Cross', 'imperial'],
            ['Medallion Crimson', 'imperial'],
            ['Ribbon Intrinsic', 'imperial'],
            ['The Order of St. Kark', 'campaign'],
            ['The Shield of Sacrous', 'regimental'],
            ["Trenchman's Long Service Medal", 'campaign'],
            ['Triple Skull', 'imperial'],
            ['Winged Skull', 'imperial'],
        ]);
        for (const medal of core) expect(medal.system.source.ow.page).toMatch(/^\d+$/);
    });

    it('the OW supplement: three Kill Markers (informal Regimental Awards) and ten Distinguished Service Medals (Campaign Honours)', () => {
        const byType = (type: string): number => supplement.filter((medal) => medal.system.honourType === type).length;
        expect(supplement).toHaveLength(13);
        expect(byType('regimental')).toBe(3);
        expect(byType('campaign')).toBe(10);
    });

    it('every medal is a raw OW medal with what it is awarded for and its Squad Bonus', () => {
        for (const medal of [...core, ...supplement]) {
            expect(medal.type).toBe('medal');
            expect(medal.system.gameSystems).toEqual(['ow']);
            expect(medal.system.source.ow.provenance).toBe('raw');
            expect(medal.system.awardedFor).toMatch(/^<p>.+<\/p>$/);
            expect(medal.system.squadBonus).toMatch(/^<p>.+<\/p>$/);
        }
    });
});
