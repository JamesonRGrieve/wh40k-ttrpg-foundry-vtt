/**
 * Unit tests for the in-memory compendium hydration join.
 *
 * Covers the pure merge (`buildHydratedSystem`, persisted-wins) and the
 * resilience contract of `buildHydrationPatches`: it runs on a hot
 * prep/render path, so a compendium ref that can't resolve (a `fromUuid`
 * throw — e.g. a not-yet-ready `documentClass` surfacing as
 * "...reading 'database'") must be SKIPPED, never propagated. An
 * unguarded throw here became an unhandled rejection via the `void`ed
 * `createActor` hook / a crashed sheet render.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHydratedSystem, buildHydrationPatches } from './compendium-hydrate.ts';

/** Minimal structural shape matching the slice of an owned item `buildHydrationPatches` reads. */
interface MockItem {
    id: string | null;
    name: string | null;
    img: string | null;
    type: string;
    system: Record<string, number | string>;
    _stats?: { compendiumSource?: string | null };
}
const actorWith = (...items: MockItem[]): { items: { contents: MockItem[] } } => ({ items: { contents: items } });

const leanWeapon: MockItem = {
    id: 'i1',
    name: 'Bolt Pistol',
    img: null,
    type: 'weapon',
    system: { cost: 7 },
    _stats: { compendiumSource: 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.abc' },
};

describe('buildHydratedSystem (persisted-wins merge)', () => {
    it('overlays the actor-persisted fields on the canonical source body', () => {
        const merged = buildHydratedSystem({ damage: '1d10', nested: { x: 1, y: 2 }, cost: 0 }, { cost: 5, nested: { y: 9 } });
        expect(merged).toEqual({ damage: '1d10', nested: { x: 1, y: 9 }, cost: 5 });
    });
});

describe('buildHydrationPatches — resilience on the hot prep/render path', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('SKIPS an item whose fromUuid throws — never propagates (resolves to [])', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('fromUuid', vi.fn().mockRejectedValue(new Error("Cannot read properties of undefined (reading 'database')")));
        await expect(buildHydrationPatches(actorWith(leanWeapon))).resolves.toEqual([]);
    });

    it('skips an item whose ref resolves to null', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue(null));
        await expect(buildHydrationPatches(actorWith(leanWeapon))).resolves.toEqual([]);
    });

    it('leaves a self-contained item (no compendiumSource / variantOf) untouched without calling fromUuid', async () => {
        const fromUuidSpy = vi.fn();
        vi.stubGlobal('fromUuid', fromUuidSpy);
        const selfContained: MockItem = { id: 'i2', name: 'Natural Claws', img: null, type: 'weapon', system: {} };
        await expect(buildHydrationPatches(actorWith(selfContained))).resolves.toEqual([]);
        expect(fromUuidSpy).not.toHaveBeenCalled();
    });

    it('produces a patch (canonical body, persisted fields winning) when the ref resolves', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ img: 'icons/bolt.webp', system: { damage: '1d10+5', cost: 0 } }));
        const patches = await buildHydrationPatches(actorWith(leanWeapon));
        expect(patches).toHaveLength(1);
        expect(patches[0]).toMatchObject({ _id: 'i1', system: { damage: '1d10+5', cost: 7 } });
    });
});
