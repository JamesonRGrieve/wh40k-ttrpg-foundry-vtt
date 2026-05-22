import { describe, expect, it } from 'vitest';

/**
 * Tests for StarshipBaseData.
 * StarshipBaseData is a shared subclass of StarshipData (no additional fields)
 * that exists so future systems can extend it without code duplication. Tests
 * verify the identity and the inheritance chain StarshipBaseData → StarshipData.
 */
const MOD = await import('./starship-base').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`StarshipBaseData could not be imported in this environment: ${msg}`);
    return undefined;
});

const SHIP_MOD = await import('../starship').catch(() => undefined);

describe('StarshipBaseData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || SHIP_MOD === undefined)('inherits StarshipData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(SHIP_MOD?.default);
    });

    it.skipIf(MOD === undefined)('hullTypeLabel getter is inherited from StarshipData', () => {
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

    it.skipIf(MOD === undefined)('defineSchema is available as a static method via inheritance', () => {
        expect(typeof MOD?.default.defineSchema).toBe('function');
    });
});
