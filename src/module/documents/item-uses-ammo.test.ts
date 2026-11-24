import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../testing/model-import.ts';

/**
 * #765: a ranged weapon uses ammunition only when its own data says so (a clip,
 * or a single-use mode), not because its Reload field holds something. Creature
 * weapons print a dash for Reload and have no clip.
 */

/** The structural `this` the getter reads. */
interface UsesAmmoThis {
    isRanged: boolean;
    system: { usesAmmo?: boolean; reload?: string };
}

/** Read `WH40KItem#usesAmmo` against a structural `this`. */
async function usesAmmo(target: UsesAmmoThis): Promise<boolean | undefined> {
    const mod = await importModelOrSkip(import('./item.ts'));
    if (mod === undefined) return undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Reflect.get returns unknown; narrowed by the typeof guard on the next line
    const value: unknown = Reflect.get(mod.WH40KItem.prototype, 'usesAmmo', target);
    if (typeof value !== 'boolean') throw new Error('WH40KItem#usesAmmo did not return a boolean');
    return value;
}

describe('WH40KItem.usesAmmo (#765)', () => {
    it('a clipless natural weapon with a dash for Reload uses no ammunition', async () => {
        const result = await usesAmmo({ isRanged: true, system: { usesAmmo: false, reload: '—' } });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (result === undefined) return;
        expect(result).toBe(false);
    });

    it('a ranged weapon whose data has a clip uses ammunition', async () => {
        const result = await usesAmmo({ isRanged: true, system: { usesAmmo: true, reload: 'Full' } });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (result === undefined) return;
        expect(result).toBe(true);
    });

    it('a melee weapon never does', async () => {
        const result = await usesAmmo({ isRanged: false, system: { usesAmmo: true } });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (result === undefined) return;
        expect(result).toBe(false);
    });
});
