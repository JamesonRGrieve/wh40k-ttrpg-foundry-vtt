import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/** A migrated (rich) characteristic entry, as produced by `migrateCharacteristics`. */
interface MigratedChar {
    base: number;
    total: number;
    bonus: number;
    advancement?: boolean;
}
/** Authoring characteristics block: flat ints pre-migration, rich objects post-migration. */
type VehicleCharsField = Record<string, number | MigratedChar>;
/** One line's structured provenance entry, as authored on disk. */
type ProvenanceEntry = { provenance: string; book: string; page?: string };
/**
 * The raw, pre-validation shape `_migrateData` receives — a legacy flat string,
 * the already-structured block, or the authored per-line variant container.
 */
type LegacyCraftSource = {
    description?: string | { value: string; chat: string; summary: string };
    source?: string | ProvenanceEntry | { dh2: ProvenanceEntry };
};

/** A prepared (derived) characteristic entry with modifier + unnatural inputs. */
interface DerivedChar {
    base: number;
    modifier: number;
    unnatural: number;
    total: number;
    bonus: number;
}

/**
 * Tests for VehicleData.
 * VehicleData extends ActorDataModel (→ TypeDataModel) so instantiation
 * fails in happy-dom. We test exported symbol, static inheritance, and
 * the static-accessible computed property helpers in the class.
 */
describe('VehicleData', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const VehicleData = mod.default;
        expect(() => VehicleData._migrateData({})).not.toThrow();
    });

    it('isDamaged, isCritical, isDestroyed computed from integrity object', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        // Integrity/armour getters live on ConventionalCraftData, not the
        // abstract VehicleData base.
        const ConventionalCraftData = mod.ConventionalCraftData;

        // Simulate the instance shape without constructing via Foundry
        const fakeInstance = Object.create(ConventionalCraftData.prototype) as {
            integrity: { max: number; value: number; critical: number };
            isDamaged: boolean;
            isCritical: boolean;
            isDestroyed: boolean;
        };
        fakeInstance.integrity = { max: 20, value: 15, critical: 0 };
        expect(fakeInstance.isDamaged).toBe(true);
        expect(fakeInstance.isCritical).toBe(false);
        expect(fakeInstance.isDestroyed).toBe(false);
    });

    it('isDestroyed true when value is 0 and max > 0', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ConventionalCraftData = mod.ConventionalCraftData;

        const fakeInstance = Object.create(ConventionalCraftData.prototype) as {
            integrity: { max: number; value: number; critical: number };
            isDestroyed: boolean;
        };
        fakeInstance.integrity = { max: 20, value: 0, critical: 0 };
        expect(fakeInstance.isDestroyed).toBe(true);
    });

    it('armourSummary returns F/S/R formatted string', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ConventionalCraftData = mod.ConventionalCraftData;

        const fakeInstance = Object.create(ConventionalCraftData.prototype) as {
            armour: { front: { value: number }; side: { value: number }; rear: { value: number } };
            armourSummary: string;
        };
        fakeInstance.armour = { front: { value: 12 }, side: { value: 10 }, rear: { value: 8 } };
        expect(fakeInstance.armourSummary).toBe('F:12 / S:10 / R:8');
    });

    it('mergeSchema is available as a static method', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const VehicleData = mod.default;
        expect(typeof VehicleData.mergeSchema).toBe('function');
    });
});

/**
 * Optional creature-style characteristics profile on animate craft
 * (daemon-engines / walkers / Dreadnoughts). Ordinary vehicles carry no
 * profile (`characteristics === null`).
 */
describe('ConventionalCraftData characteristics profile', () => {
    it('_migrateData expands a flat-int characteristics block into the rich shape', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        // Defiler daemon-engine profile (OW Core p.355): WS/BS 25, S 75, T — (0).
        const source: { characteristics: VehicleCharsField } = {
            characteristics: { ws: 25, bs: 25, s: 75, t: 0, ag: 35, int: 10, per: 40, wp: 40, fel: 1 },
        };
        mod.ConventionalCraftData._migrateData(source);
        const chars = source.characteristics;
        expect(chars['weaponSkill']).toMatchObject({ base: 25, total: 25 });
        expect(chars['strength']).toMatchObject({ base: 75, total: 75 });
        // Short keys are remapped to full names.
        expect(chars['ws']).toBeUndefined();
    });

    it('_migrateData leaves an ordinary vehicle (no characteristics) untouched', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const source: { armour: { front: { value: number } }; characteristics?: VehicleCharsField } = { armour: { front: { value: 24 } } };
        expect(() => mod.ConventionalCraftData._migrateData(source)).not.toThrow();
        expect(source.characteristics).toBeUndefined();
    });

    it('_prepareCharacteristics derives total/bonus and applies the Unnatural multiplier', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const inst = Object.create(mod.ConventionalCraftData.prototype) as {
            characteristics: Record<string, DerivedChar> | null;
            _prepareCharacteristics: () => void;
        };
        inst.characteristics = {
            // Unnatural Strength (7): bonus = floor(75/10) * 7 = 49.
            strength: { base: 75, modifier: 0, unnatural: 7, total: 0, bonus: 0 },
            weaponSkill: { base: 25, modifier: 0, unnatural: 0, total: 0, bonus: 0 },
        };
        inst._prepareCharacteristics();
        expect(inst.characteristics['strength']).toMatchObject({ total: 75, bonus: 49 });
        expect(inst.characteristics['weaponSkill']).toMatchObject({ total: 25, bonus: 2 });
    });

    it('_prepareCharacteristics is a no-op when the craft has no profile', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const inst = Object.create(mod.ConventionalCraftData.prototype) as {
            characteristics: null;
            _prepareCharacteristics: () => void;
        };
        inst.characteristics = null;
        expect(() => inst._prepareCharacteristics()).not.toThrow();
    });
});

/**
 * `description` and `source` were, respectively, absent from the schema and
 * declared as a bare `StringField`, while every authored craft carried a
 * per-line description container and a structured provenance object — so
 * SchemaField.clean dropped both. These cover the migration that normalises the
 * legacy string forms live worlds still hold.
 */
describe('VehicleData description / source migration', () => {
    it('promotes a legacy flat description string into the {value, chat, summary} block', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const source: LegacyCraftSource = { description: '<p>A sturdy off-road trike.</p>' };
        mod.default._migrateData(source);
        expect(source.description).toEqual({ value: '<p>A sturdy off-road trike.</p>', chat: '', summary: '' });
    });

    it('promotes a legacy flat source string into structured provenance', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const source: LegacyCraftSource = { source: 'DH2: Enemies Without' };
        mod.default._migrateData(source);
        expect(source.source).toMatchObject({ provenance: 'raw', book: 'DH2: Enemies Without' });
    });

    it('leaves a per-line variant container alone for the resolver to collapse', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const authored = { dh2: { provenance: 'raw', book: 'DH2: Enemies Without', page: '56' } };
        const source: LegacyCraftSource = { source: authored };
        mod.default._migrateData(source);
        expect(source.source).toEqual(authored);
    });
});
