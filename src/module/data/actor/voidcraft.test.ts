import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * Tests for StarshipData.
 * StarshipData extends ActorDataModel (→ TypeDataModel) so instantiation
 * fails in happy-dom. We test the exported symbol and the derived-data
 * helpers via Object.create prototype tricks.
 */
describe('StarshipData', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const StarshipData = mod.default;
        expect(() => StarshipData._migrateData({})).not.toThrow();
    });

    it('_prepareResources computes space.available = total - used', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const StarshipData = mod.default;

        type StarshipLike = {
            space: { total: number; used: number; available: number };
            power: { total: number; used: number; available: number };
            _prepareResources: () => void;
        };
        const fakeInstance = Object.create(StarshipData.prototype) as StarshipLike;
        fakeInstance.space = { total: 100, used: 40, available: 0 };
        fakeInstance.power = { total: 60, used: 25, available: 0 };
        fakeInstance._prepareResources();
        expect(fakeInstance.space.available).toBe(60);
        expect(fakeInstance.power.available).toBe(35);
    });

    it('_prepareCombatStats computes detectionBonus as tens digit', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const StarshipData = mod.default;

        type StarshipLike = {
            detection: number;
            detectionBonus: number;
            hullIntegrity: { max: number; value: number };
            hullPercentage: number;
            crew: { morale: { max: number; value: number } };
            moralePercentage: number;
            _prepareCombatStats: () => void;
        };
        const fakeInstance = Object.create(StarshipData.prototype) as StarshipLike;
        fakeInstance.detection = 45;
        fakeInstance.hullIntegrity = { max: 50, value: 25 };
        fakeInstance.crew = { morale: { max: 100, value: 80 } };
        fakeInstance._prepareCombatStats();
        expect(fakeInstance.detectionBonus).toBe(4);
        expect(fakeInstance.hullPercentage).toBe(50);
        expect(fakeInstance.moralePercentage).toBe(80);
    });

    it('_emptyAppliedModifiers seeds every known stat key with total=0 and empty sources', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const { default: StarshipData, SHIP_MODIFIER_STAT_KEYS } = mod;
        const empty = StarshipData._emptyAppliedModifiers();
        for (const key of SHIP_MODIFIER_STAT_KEYS) {
            expect(empty[key]).toBeDefined();
            expect(empty[key].total).toBe(0);
            expect(empty[key].sources).toEqual([]);
        }
    });

    it('computeAppliedModifiers sums shipComponent.modifiers + shipUpgrade.modifiers + shipRole.shipBonuses', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const { default: StarshipData } = mod;
        const items = [
            {
                type: 'shipComponent',
                name: 'Best Auger Array',
                uuid: 'Actor.A.Item.1',
                _stats: { compendiumSource: 'Compendium.wh40k-rpg.rt-items.augur1' },
                system: { condition: 'functional', modifiers: { detection: 8, manoeuvrability: 2 } },
            },
            {
                type: 'shipComponent',
                name: 'Wrecked Plasma Drive',
                uuid: 'Actor.A.Item.2',
                system: { condition: 'damaged', modifiers: { speed: 5 } }, // ignored — damaged
            },
            {
                type: 'shipUpgrade',
                name: 'Reinforced Bulkheads',
                uuid: 'Actor.A.Item.3',
                _stats: { compendiumSource: 'Compendium.wh40k-rpg.rt-items.upgrade1' },
                system: { modifiers: { armour: 1, hullIntegrity: 4 } },
            },
            {
                type: 'shipRole',
                name: 'Helmsman',
                uuid: 'Actor.A.Item.4',
                system: { shipBonuses: { manoeuvrability: 5, detection: 0, ballisticSkill: 0, crewRating: 0 } },
            },
        ];
        // eslint-disable-next-line no-restricted-syntax -- boundary: test-fixture heterogeneous item shape vs the private ShipItemView interface; cast narrows to the public parameter signature
        const applied = StarshipData.computeAppliedModifiers(items as unknown as Parameters<typeof StarshipData.computeAppliedModifiers>[0]);
        expect(applied.detection.total).toBe(8);
        expect(applied.detection.sources).toHaveLength(1);
        const detSrc = applied.detection.sources[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch
        expect(detSrc?.name).toBe('Best Auger Array');
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch
        expect(detSrc?.sourceUuid).toBe('Compendium.wh40k-rpg.rt-items.augur1');
        // manoeuvrability: 2 from component + 5 from role
        expect(applied.manoeuvrability.total).toBe(7);
        expect(applied.manoeuvrability.sources).toHaveLength(2);
        expect(applied.armour.total).toBe(1);
        expect(applied.hullIntegrity.total).toBe(4);
        // damaged component contributes nothing
        expect(applied.speed.total).toBe(0);
        // unused stat keys default to 0
        expect(applied.voidShields.total).toBe(0);
        expect(applied.crewRating.total).toBe(0);
    });

    it('computeAppliedModifiers ignores unknown modifier keys', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const { default: StarshipData } = mod;
        const items = [
            {
                type: 'shipComponent',
                name: 'Strange Component',
                uuid: 'Actor.A.Item.X',
                system: { condition: 'functional', modifiers: { mysteryStat: 99, detection: 3 } },
            },
        ];
        // eslint-disable-next-line no-restricted-syntax -- boundary: test-fixture heterogeneous item shape vs the private ShipItemView interface; cast narrows to the public parameter signature
        const applied = StarshipData.computeAppliedModifiers(items);
        expect(applied.detection.total).toBe(3);
        // mysteryStat is dropped — not present in SHIP_MODIFIER_STAT_KEYS.
        expect(Object.keys(applied)).not.toContain('mysteryStat');
    });

    it('_prepareCombatStats handles zero maxima gracefully (percentage = 100)', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const StarshipData = mod.default;

        type StarshipLike = {
            detection: number;
            detectionBonus: number;
            hullIntegrity: { max: number; value: number };
            hullPercentage: number;
            crew: { morale: { max: number; value: number } };
            moralePercentage: number;
            _prepareCombatStats: () => void;
        };
        const fakeInstance = Object.create(StarshipData.prototype) as StarshipLike;
        fakeInstance.detection = 0;
        fakeInstance.hullIntegrity = { max: 0, value: 0 };
        fakeInstance.crew = { morale: { max: 0, value: 0 } };
        fakeInstance._prepareCombatStats();
        expect(fakeInstance.hullPercentage).toBe(100);
        expect(fakeInstance.moralePercentage).toBe(100);
    });
});
