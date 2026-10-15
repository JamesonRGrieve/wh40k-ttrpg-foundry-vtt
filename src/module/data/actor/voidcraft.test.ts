import { describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';
import type { ShipAppliedModifier, ShipModifierStatKey } from './voidcraft.ts';

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

    it('collects a role ballisticSkill bonus separately from crewRating (#196)', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const { default: StarshipData } = mod;
        // A Master of Ordnance raises the ship's BS without raising Crew Rating.
        // These were collected and then silently dropped: the write-back block had
        // no `ballisticSkill` line, and the sheet read `crew.crewRating` directly.
        const items = [
            {
                type: 'shipRole',
                name: 'Master of Ordnance',
                uuid: 'Actor.A.Item.9',
                system: { shipBonuses: { manoeuvrability: 0, detection: 0, ballisticSkill: 5, crewRating: 0 } },
            },
        ];
        const applied = StarshipData.computeAppliedModifiers(items);
        expect(applied.ballisticSkill.total).toBe(5);
        expect(applied.ballisticSkill.sources).toHaveLength(1);
        // The BS bonus must NOT leak into Crew Rating — they are distinct axes.
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

    it('exports the RAW ship-initiative formula and exposes it per-instance', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        // RAW: 1d10 + Detection Bonus. `@detBonus` must match the key
        // getRollData publishes, or the Roll resolves the term to 0.
        expect(mod.VOIDCRAFT_INITIATIVE_FORMULA).toBe('1d10 + @detBonus');

        const fakeInstance = Object.create(mod.default.prototype) as { initiativeFormula: string };
        expect(fakeInstance.initiativeFormula).toBe(mod.VOIDCRAFT_INITIATIVE_FORMULA);
    });

    it('getRollData publishes detBonus so the initiative formula resolves', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        /** The shorthand keys `VoidcraftData.getRollData()` publishes. */
        type VoidcraftRollData = {
            speed: number;
            man: number;
            det: number;
            detBonus: number;
            arm: number;
            vs: number;
            tr: number;
            cr: number;
        };
        type StarshipLike = {
            speed: number;
            manoeuvrability: number;
            detection: number;
            detectionBonus: number;
            armour: number;
            voidShields: number;
            turretRating: number;
            crew: { crewRating: number };
            getRollData: () => VoidcraftRollData;
        };
        const fakeInstance = Object.create(mod.default.prototype) as StarshipLike;
        fakeInstance.speed = 6;
        fakeInstance.manoeuvrability = 15;
        fakeInstance.detection = 45;
        fakeInstance.detectionBonus = 4;
        fakeInstance.armour = 18;
        fakeInstance.voidShields = 1;
        fakeInstance.turretRating = 2;
        fakeInstance.crew = { crewRating: 30 };

        const rollData = fakeInstance.getRollData();
        expect(rollData.detBonus).toBe(4);
        expect(rollData.det).toBe(45);
        // The formula's only @-term must be a published key.
        const term = mod.VOIDCRAFT_INITIATIVE_FORMULA.replace('1d10 + @', '');
        expect(Object.keys(rollData)).toContain(term);
    });

    it('folds the Crippled −10 Manoeuvrability / Detection and half Speed into the stats as named sources (#187)', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        type StarshipLike = {
            gameSystem: string;
            hullIntegrity: { max: number; value: number };
            speed: number;
            manoeuvrability: number;
            detection: number;
            _applyCrippledStatChanges: (applied: Record<ShipModifierStatKey, ShipAppliedModifier>) => void;
        };
        const ship = Object.create(mod.default.prototype) as StarshipLike;
        Object.assign(ship, { gameSystem: 'rt', hullIntegrity: { max: 35, value: 0 }, speed: 7, manoeuvrability: 15, detection: 20 });
        const applied = mod.default._emptyAppliedModifiers();
        ship._applyCrippledStatChanges(applied);
        expect([ship.speed, ship.manoeuvrability, ship.detection]).toEqual([4, 5, 10]);
        expect(applied.speed.sources).toEqual([{ name: '', type: mod.CRIPPLED_SOURCE_TYPE, uuid: '', sourceUuid: '', value: -3 }]);
        expect(applied.detection.total).toBe(-10);

        // Another line at 0 Hull, and an RT ship at 1 Hull, are left alone.
        for (const state of [
            { gameSystem: 'dh2', hullIntegrity: { max: 35, value: 0 } },
            { gameSystem: 'rt', hullIntegrity: { max: 35, value: 1 } },
        ]) {
            Object.assign(ship, state, { speed: 7, manoeuvrability: 15, detection: 20 });
            const untouched = mod.default._emptyAppliedModifiers();
            ship._applyCrippledStatChanges(untouched);
            expect([ship.speed, ship.manoeuvrability, ship.detection]).toEqual([7, 15, 20]);
            expect(untouched.manoeuvrability.sources).toEqual([]);
        }
    });

    it('keeps an RT ship at 0 Hull Crippled, not destroyed, until a destroying Critical Hit (#187)', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        type StarshipLike = {
            gameSystem: string;
            hullIntegrity: { max: number; value: number };
            shipStatuses: { destroysShip: boolean }[];
            isCrippled: boolean;
            isDestroyed: boolean;
        };
        const ship = Object.create(mod.default.prototype) as StarshipLike;
        ship.gameSystem = 'rt';
        ship.hullIntegrity = { max: 35, value: 0 };
        ship.shipStatuses = [{ destroysShip: false }];
        expect(ship.isCrippled).toBe(true);
        expect(ship.isDestroyed).toBe(false);
        ship.shipStatuses = [{ destroysShip: false }, { destroysShip: true }];
        expect(ship.isDestroyed).toBe(true);

        // Another line keeps the 0-Hull reading.
        ship.gameSystem = 'dh2';
        ship.shipStatuses = [];
        expect(ship.isDestroyed).toBe(true);
        ship.hullIntegrity = { max: 35, value: 1 };
        expect(ship.isDestroyed).toBe(false);
    });

    it('hullTypeLabel reads the label from WH40K.hullTypes, and shows a value outside it as stored (#647)', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        vi.stubGlobal('game', { i18n: { localize: (key: string): string => `loc:${key}` } });
        const ship = Object.create(mod.default.prototype) as { hullType: string; hullTypeLabel: string };
        ship.hullType = 'light-cruiser';
        expect(ship.hullTypeLabel).toBe('loc:WH40K.HullType.LightCruiser');
        // A pack's off-enum value (the Wayfarer Station's "space-station") is not a missing langpack key.
        ship.hullType = 'space-station';
        expect(ship.hullTypeLabel).toBe('space-station');
        ship.hullType = '';
        expect(ship.hullTypeLabel).toBe('');
        vi.unstubAllGlobals();
    });
});
