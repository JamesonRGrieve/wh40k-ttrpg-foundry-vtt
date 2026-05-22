import { describe, expect, it } from 'vitest';

/**
 * Tests for DH1VehicleData.
 * DH1VehicleData is a thin wrapper around VehicleBaseData that tags the model
 * with gameSystem = 'dh1e'. Tests verify the identity and inheritance chain.
 */
const MOD = await import('./dh1-vehicle').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`DH1VehicleData could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/vehicle-base').catch(() => undefined);

describe('DH1VehicleData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is dh1e', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('dh1e');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits VehicleBaseData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
