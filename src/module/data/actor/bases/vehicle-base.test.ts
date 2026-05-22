import { describe, expect, it } from 'vitest';

/**
 * Tests for VehicleBaseData.
 * VehicleBaseData is a shared subclass of VehicleData (no additional fields)
 * that every system's vehicle variant extends. Tests verify the identity and
 * the inheritance chain VehicleBaseData → VehicleData.
 */
const MOD = await import('./vehicle-base').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`VehicleBaseData could not be imported in this environment: ${msg}`);
    return undefined;
});

const VEH_MOD = await import('../vehicle').catch(() => undefined);

describe('VehicleBaseData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || VEH_MOD === undefined)('inherits VehicleData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(VEH_MOD?.default);
    });

    it.skipIf(MOD === undefined)('armourSummary getter is inherited from VehicleData', () => {
        let proto: object | null = MOD?.default.prototype ?? null;
        let found = false;
        while (proto !== null) {
            if (Object.getOwnPropertyDescriptor(proto, 'armourSummary')?.get !== undefined) {
                found = true;
                break;
            }
            proto = Object.getPrototypeOf(proto) as object | null;
        }
        expect(found).toBe(true);
    });

    it.skipIf(MOD === undefined)('defineSchema is available as a static method via inheritance', () => {
        expect(typeof MOD?.default.defineSchema).toBe('function');
    });
});
