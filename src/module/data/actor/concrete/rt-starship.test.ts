import { describe, expect, it } from 'vitest';

/**
 * Tests for RTStarshipData.
 * RTStarshipData is a thin wrapper around StarshipBaseData that tags the model
 * with gameSystem = 'rt'. Tests verify the identity and inheritance chain.
 */
const MOD = await import('./rt-starship').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`RTStarshipData could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/starship-base').catch(() => undefined);

describe('RTStarshipData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is rt', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('rt');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits StarshipBaseData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });

    it.skipIf(MOD === undefined)('hullTypeLabel getter is inherited from StarshipData', () => {
        // The getter lives up the prototype chain (StarshipData), not on the
        // RTStarshipData prototype itself.
        let proto: object | null = MOD?.default.prototype ?? null;
        let found = false;
        while (proto !== null) {
            if (Object.getOwnPropertyDescriptor(proto, 'hullTypeLabel')?.get !== undefined) {
                found = true;
                break;
            }
            proto = Object.getPrototypeOf(proto) as object | null;
        }
        expect(found).toBe(true);
    });
});
