import { describe, expect, it } from 'vitest';
import {
    buildSpecialAbilityLookup,
    deterministicItemId,
    LEGACY_DISTINCTION_FLAG,
    migrateLegacyDistinctionLists,
    slugifyName,
    specialAbilityIndexEntries,
    type SpecialAbilityPack,
} from './legacy-distinction-lists.ts';

const PACK: SpecialAbilityPack = {
    documentName: 'Item',
    collection: 'wh40k-rpg.dw-special-abilities',
    index: {
        values: () => [
            { _id: '16ddcb89ff581b77', name: 'Campaign Hero', type: 'specialAbility', img: 'campaign-hero.webp' },
            { _id: 'd066301eaae6105b', name: 'Deathwing', type: 'specialAbility', img: null },
            { _id: 'aaaaaaaaaaaaaaaa', name: 'Bolter', type: 'weapon' },
        ],
    },
};
const lookup = (): ReturnType<typeof buildSpecialAbilityLookup> => buildSpecialAbilityLookup(specialAbilityIndexEntries([PACK]));

interface MigratedItem {
    _id: string;
    name: string;
    type: string;
    img?: string;
    system: { category: string };
    flags: Record<string, Record<string, string>>;
    _stats?: { compendiumSource: string };
}

interface MigratedActorSource {
    system: object;
    items: MigratedItem[];
}

function migrate(system: object, items: MigratedItem[] = []): { source: MigratedActorSource; added: number } {
    const source = { system, items };
    const added = migrateLegacyDistinctionLists(source, lookup);
    return { source, added };
}

describe('specialAbilityIndexEntries (#171)', () => {
    it('reads only special abilities from Item packs, with their compendium UUIDs', () => {
        const actorPack: SpecialAbilityPack = { ...PACK, documentName: 'Actor' };
        const entries = specialAbilityIndexEntries([PACK, actorPack]);
        expect(entries.map((entry) => entry.name)).toEqual(['Campaign Hero', 'Deathwing']);
        expect(entries.at(0)?.uuid).toBe('Compendium.wh40k-rpg.dw-special-abilities.Item.16ddcb89ff581b77');
    });
});

describe('buildSpecialAbilityLookup (#171)', () => {
    it('matches an entry by slug, name, id or UUID', () => {
        const resolve = lookup();
        expect(resolve('campaign-hero')?.name).toBe('Campaign Hero');
        expect(resolve('Campaign Hero')?.name).toBe('Campaign Hero');
        expect(resolve('d066301eaae6105b')?.name).toBe('Deathwing');
        expect(resolve('Compendium.wh40k-rpg.dw-special-abilities.Item.d066301eaae6105b')?.name).toBe('Deathwing');
        expect(resolve('bolter')).toBeNull();
    });

    it('slugifies names the way pack identifiers are written', () => {
        expect(slugifyName("Emperor's Champion")).toBe('emperors-champion');
    });
});

describe('migrateLegacyDistinctionLists (#171)', () => {
    // Regression: the retired arrays must never be silently dropped.
    it('turns every legacy entry into an owned special ability and removes the lists', () => {
        const { source, added } = migrate({ distinctions: ['deathwing', 'campaign-hero', 'lost-honour'], marksOfDistinction: ['campaign-hero'] });
        expect(added).toBe(3);
        expect('distinctions' in source.system).toBe(false);
        expect('marksOfDistinction' in source.system).toBe(false);
        const byName = new Map(source.items.map((item) => [item.name, item]));
        expect(byName.get('Deathwing')?.system.category).toBe('distinction');
        expect(byName.get('Campaign Hero')?.system.category).toBe('mark');
        expect(byName.get('Campaign Hero')?._stats?.compendiumSource).toBe('Compendium.wh40k-rpg.dw-special-abilities.Item.16ddcb89ff581b77');
        expect(byName.get('Campaign Hero')?.img).toBe('campaign-hero.webp');
    });

    it('keeps an unmatched entry visible under its raw name, flagged for the GM', () => {
        const { source } = migrate({ distinctions: ['lost-honour'], marksOfDistinction: [] });
        const item = source.items.at(0);
        expect(item?.name).toBe('lost-honour');
        expect(item?.type).toBe('specialAbility');
        expect(item?._stats).toBeUndefined();
        expect(item?.flags['wh40k-rpg']?.[LEGACY_DISTINCTION_FLAG]).toBe('lost-honour');
    });

    it('keeps an unindexed compendium UUID as the join key', () => {
        const uuid = 'Compendium.wh40k-rpg.dw-special-abilities.Item.0b6614504484f359';
        const { source } = migrate({ marksOfDistinction: [uuid] });
        expect(source.items.at(0)?._stats?.compendiumSource).toBe(uuid);
        expect(source.items.at(0)?.system.category).toBe('mark');
    });

    it('is idempotent: re-running over an already-migrated actor adds nothing', () => {
        const first = migrate({ distinctions: ['deathwing'] });
        const again = migrate({ distinctions: ['deathwing'] }, first.source.items);
        expect(again.added).toBe(0);
        expect(again.source.items).toHaveLength(1);
    });

    it('leaves an actor without the legacy lists untouched', () => {
        const { source, added } = migrate({ wounds: { value: 10 } });
        expect(added).toBe(0);
        expect(source.items).toEqual([]);
        expect(source.system).toEqual({ wounds: { value: 10 } });
    });

    it('derives stable 16-character ids', () => {
        expect(deterministicItemId('x')).toHaveLength(16);
        expect(deterministicItemId('x')).toBe(deterministicItemId('x'));
        expect(deterministicItemId('x')).not.toBe(deterministicItemId('y'));
    });
});
