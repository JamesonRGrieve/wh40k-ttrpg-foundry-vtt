import { describe, expect, it } from 'vitest';
import { computeEncumbrance, type EncumbranceActorView, type EncumbranceItemView, getCarryCapacity } from './encumbrance-calculator.ts';

/**
 * Coverage for the encumbrance calculator. The actor param was narrowed to the
 * structural EncumbranceActorView (#test-coverage), so this drives it with a
 * plain stub — no Foundry Document needed.
 */

type BackpackStub = { hasBackpack: boolean; isCombatVest: boolean; weight: { max: number } };

function actorView(items: EncumbranceItemView[], opts: { backpack?: BackpackStub; strength?: number; toughness?: number } = {}): EncumbranceActorView {
    return {
        system: { ...(opts.backpack !== undefined ? { backpack: opts.backpack } : {}) },
        items,
        characteristics: { strength: { bonus: opts.strength ?? 5 }, toughness: { bonus: opts.toughness ?? 5 } },
    };
}

const item = (totalWeight: number, extra: Partial<EncumbranceItemView> = {}): EncumbranceItemView => ({ isStorageLocation: false, totalWeight, ...extra });

describe('getCarryCapacity', () => {
    it('reads the S+T lookup table and clamps to its bounds', () => {
        expect(getCarryCapacity(0)).toBe(0.9);
        expect(getCarryCapacity(10)).toBe(78);
        expect(getCarryCapacity(20)).toBe(2250);
        expect(getCarryCapacity(25)).toBe(2250); // clamped to 20
        expect(getCarryCapacity(-3)).toBe(0.9); // clamped to 0
    });
});

describe('computeEncumbrance', () => {
    it('sums carried item weight and derives max from S+T bonus (5+5 → 78kg)', () => {
        const result = computeEncumbrance(actorView([item(10), item(20)]));
        expect(result.value).toBe(30);
        expect(result.max).toBe(78);
        expect(result.encumbered).toBe(false);
    });

    it('excludes storage-location and ship-stowed items', () => {
        const result = computeEncumbrance(
            actorView([item(100, { isStorageLocation: true }), item(50, { system: { state: { inShipStorage: true } } }), item(10)]),
        );
        expect(result.value).toBe(10);
    });

    it('splits backpack-stowed weight from carried weight', () => {
        const result = computeEncumbrance(
            actorView([item(10, { system: { state: { inBackpack: true } } }), item(5)], {
                backpack: { hasBackpack: true, isCombatVest: false, weight: { max: 30 } },
            }),
        );
        expect(result.value).toBe(5);
        expect(result.backpack_value).toBe(10);
        expect(result.backpack_max).toBe(30);
        expect(result.backpack_encumbered).toBe(false);
    });

    it('folds backpack weight into carried weight for a combat vest', () => {
        const result = computeEncumbrance(
            actorView([item(10, { system: { state: { inBackpack: true } } }), item(5)], {
                backpack: { hasBackpack: true, isCombatVest: true, weight: { max: 30 } },
            }),
        );
        expect(result.value).toBe(15);
    });

    it('flags encumbered when carried weight exceeds the max', () => {
        const result = computeEncumbrance(actorView([item(5)], { strength: 0, toughness: 0 }));
        expect(result.max).toBe(0.9);
        expect(result.encumbered).toBe(true);
    });
});
