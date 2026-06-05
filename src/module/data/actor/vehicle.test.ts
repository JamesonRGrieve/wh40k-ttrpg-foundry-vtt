import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

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
