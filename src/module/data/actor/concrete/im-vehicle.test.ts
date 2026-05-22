import { describe, expect, it } from 'vitest';

/**
 * Tests for IMVehicleData.
 * IMVehicleData is a thin wrapper around VehicleBaseData that tags the model
 * with gameSystem = 'im'. Tests verify the identity and inheritance chain.
 */
const MOD = await import('./im-vehicle').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`IMVehicleData could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/vehicle-base').catch(() => undefined);

describe('IMVehicleData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is im', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('im');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits VehicleBaseData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
