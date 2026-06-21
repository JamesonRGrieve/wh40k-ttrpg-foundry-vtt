import { describe, expect, it } from 'vitest';
import { computeCharacteristicTotals } from '../data/shared/characteristic-math.ts';
import { computeMovement } from '../data/shared/movement-math.ts';
import { importModelOrSkip } from '../testing/model-import.ts';

describe('WH40KBaseActor', () => {
    it('exports WH40KBaseActor class', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KBaseActor).toBeTruthy();
    });

    it('_computeCharacteristics calculates total and bonus from base + advance', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        // Build a minimal actor-like object to test the computation logic directly.
        // base=30, advance=2, modifier=5 → total = 30 + 2*5 + 5 = 45, bonus = floor(45/10) = 4
        interface CharEntry {
            base: number;
            advance: number;
            modifier: number;
            unnatural: number;
            label: string;
            short: string;
            total: number;
            bonus: number;
        }
        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        const characteristics: Record<string, CharEntry> = {
            agility: { base: 30, advance: 2, modifier: 5, unnatural: 0, label: 'Agility', short: 'Ag', total: 0, bonus: 0 },
        };
        Object.defineProperty(fakeActor, 'characteristics', { value: characteristics, writable: true });
        Object.defineProperty(fakeActor, 'initiative', { value: { characteristic: '', base: 0, bonus: 0 }, writable: true });
        Object.defineProperty(fakeActor, 'system', { value: { initiative: { characteristic: '', bonus: 0 }, movement: {} }, writable: true });

        fakeActor._computeCharacteristics();

        const agility = characteristics['agility'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics['agility'] may be undefined at runtime despite being declared above
        expect(agility?.total).toBe(45);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: same guard
        expect(agility?.bonus).toBe(4);
    });

    it('_computeCharacteristics applies unnatural multiplier to bonus', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        // base=40, advance=0, modifier=0, unnatural=2 → total=40, bonus = floor(40/10)*2 = 8
        interface CharEntry2 {
            base: number;
            advance: number;
            modifier: number;
            unnatural: number;
            label: string;
            short: string;
            total: number;
            bonus: number;
        }
        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        const characteristics: Record<string, CharEntry2> = {
            strength: { base: 40, advance: 0, modifier: 0, unnatural: 2, label: 'Strength', short: 'S', total: 0, bonus: 0 },
        };
        Object.defineProperty(fakeActor, 'characteristics', { value: characteristics, writable: true });
        Object.defineProperty(fakeActor, 'initiative', { value: { characteristic: '', base: 0, bonus: 0 }, writable: true });
        Object.defineProperty(fakeActor, 'system', { value: { initiative: { characteristic: '', bonus: 0 }, movement: {} }, writable: true });

        fakeActor._computeCharacteristics();

        const strength = characteristics['strength'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics['strength'] may be undefined at runtime despite being declared above
        expect(strength?.total).toBe(40);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: same guard
        expect(strength?.bonus).toBe(8);
    });

    it('_computeMovement skips calculation when agility is absent', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const movement = { half: 0, full: 0, charge: 0, run: 0 };
        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        Object.defineProperty(fakeActor, 'characteristics', { value: {}, writable: true });
        Object.defineProperty(fakeActor, 'size', { value: 4, writable: false });
        Object.defineProperty(fakeActor, 'system', { value: { movement }, writable: true });

        fakeActor._computeMovement();

        // movement should remain unchanged when agility is absent
        expect(movement.half).toBe(0);
    });

    it('_computeCharacteristics matches the shared characteristic-math helper (#337 parity)', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        interface CharEntry {
            base: number;
            advance: number;
            modifier: number;
            unnatural: number;
            short: string;
            total: number;
            bonus: number;
        }
        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        // base=42, advance=3, modifier=-2, unnatural=3 → exercises the advance*5 term + unnatural multiplier.
        const characteristics: Record<string, CharEntry> = {
            agility: { base: 42, advance: 3, modifier: -2, unnatural: 3, short: 'Ag', total: 0, bonus: 0 },
        };
        Object.defineProperty(fakeActor, 'characteristics', { value: characteristics, writable: true });
        Object.defineProperty(fakeActor, 'initiative', { value: { characteristic: '', base: 0, bonus: 0 }, writable: true });
        Object.defineProperty(fakeActor, 'system', { value: { initiative: { characteristic: '', bonus: 0 }, movement: {} }, writable: true });

        fakeActor._computeCharacteristics();

        const expected = computeCharacteristicTotals(42, -2, 3, 3 * 5);
        const agility = characteristics['agility'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics['agility'] may be undefined at runtime despite being declared above
        expect(agility?.total).toBe(expected.total);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: same guard
        expect(agility?.bonus).toBe(expected.bonus);
    });

    it('_computeMovement matches the shared movement-math helper, applying the floors (#337 fix)', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        // agilityBonus=2, size=4 → baseMove = 2 + 4 - 4 = 2; floors clamp run to max(6, 12)=12 etc.
        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        Object.defineProperty(fakeActor, 'characteristics', { value: { agility: { bonus: 2, short: 'Ag', total: 0 } }, writable: true });
        Object.defineProperty(fakeActor, 'size', { value: 4, writable: false });
        Object.defineProperty(fakeActor, 'system', { value: { movement: {} }, writable: true });

        fakeActor._computeMovement();

        expect(fakeActor.system.movement).toEqual(computeMovement(2, 4, true));
    });

    it('_computeMovement floors the zero-base case to the 1/2/3/6 minimums (#337)', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        // agilityBonus=2, size=2 → baseMove = 0; the OLD copy produced 0/0/0/0,
        // the floors lift them to 1/2/3/6 (the divergence the fix corrects).
        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        Object.defineProperty(fakeActor, 'characteristics', { value: { agility: { bonus: 2, short: 'Ag', total: 0 } }, writable: true });
        Object.defineProperty(fakeActor, 'size', { value: 2, writable: false });
        Object.defineProperty(fakeActor, 'system', { value: { movement: {} }, writable: true });

        fakeActor._computeMovement();

        expect(fakeActor.system.movement).toEqual({ half: 1, full: 2, charge: 3, run: 6 });
    });

    it('getStatBreakdown returns null for unknown stat key', async () => {
        const mod = await importModelOrSkip(import('./base-actor.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeActor = Object.create(mod.WH40KBaseActor.prototype) as InstanceType<typeof mod.WH40KBaseActor>;
        Object.defineProperty(fakeActor, 'system', { value: {}, writable: true });
        Object.defineProperty(fakeActor, 'items', { value: { [Symbol.iterator]: [][Symbol.iterator].bind([]) }, writable: true });

        const result = fakeActor.getStatBreakdown('nonexistent');
        expect(result).toBeNull();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - getCharacteristicFuzzy matches by abbreviation (e.g. "AG" → agility)
    //   - _buildSimpleSkillRoll assembles correct rollData fields
    //   - _onItemsChanged delegates to system._initializeModifierTracking
});
