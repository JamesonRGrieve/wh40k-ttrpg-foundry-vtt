import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub, LeafField } from '../../testing/foundry-data-stub.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { readRepoFile } from '../../testing/repo-file.ts';

/**
 * MedalData schema contract, and the Only War Medals and Honours authored
 * through it (content#32): OW core pp. 294–295 and Enemies of the Imperium
 * pp. 140–143. The model evaluates `foundry.data.fields` at module load, so the
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

const PACKS = {
    core: 'src/packs-private/only-war/ow-core-items-medals/_source',
    enemies: 'src/packs-private/only-war/ow-enemies-items-medals/_source',
};

function load(dir: string): MedalSource[] {
    return readdirSync(resolve(__dirname, '..', '..', '..', '..', dir))
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(readRepoFile(`${dir}/${file}`)) as MedalSource);
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('the printed Only War medals (content#32)', () => {
    const core = load(PACKS.core);
    const enemies = load(PACKS.enemies);
    const summary = (medals: MedalSource[]): string[][] =>
        medals.map((medal) => [medal.name, medal.system.honourType, medal.system.source.ow.page]).sort((a, b) => (a.at(0) ?? '').localeCompare(b.at(0) ?? ''));

    it('OW core: the six Imperial Honours, four Campaign Honours and the example Regimental Award', () => {
        expect(summary(core)).toEqual([
            ['Cog of Het', 'campaign', '295'],
            ['Drusian Laurels', 'campaign', '295'],
            ['Honorifica Imperialis', 'imperial', '295'],
            ['Macharian Cross', 'imperial', '294'],
            ['Medallion Crimson', 'imperial', '294'],
            ['Ribbon Intrinsic', 'imperial', '294'],
            ['The Order of St. Kark', 'campaign', '295'],
            ['The Shield of Sacrous', 'regimental', '295'],
            ["Trenchman's Long Service Medal", 'campaign', '295'],
            ['Triple Skull', 'imperial', '294'],
            ['Winged Skull', 'imperial', '294'],
        ]);
    });

    it('Enemies of the Imperium: three Kill Markers (informal Regimental Awards) and ten Distinguished Service Medals (Campaign Honours)', () => {
        const byType = (type: string): number => enemies.filter((medal) => medal.system.honourType === type).length;
        expect(enemies).toHaveLength(13);
        expect(byType('regimental')).toBe(3);
        expect(byType('campaign')).toBe(10);
    });

    it('every medal is a raw OW medal with what it is awarded for and its Squad Bonus', () => {
        for (const medal of [...core, ...enemies]) {
            expect(medal.type).toBe('medal');
            expect(medal.system.gameSystems).toEqual(['ow']);
            expect(medal.system.source.ow.provenance).toBe('raw');
            expect(medal.system.awardedFor).toMatch(/^<p>.+<\/p>$/);
            expect(medal.system.squadBonus).toMatch(/^<p>.+<\/p>$/);
        }
    });
});
