/**
 * Arrive-loaded magazines (#574): a weapon created on an actor stores a full
 * magazine, its clip size read from its own data or, for a lean compendium stub,
 * from its compendium source.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalClipMax, fullMagazineFor, type LoadableWeapon, loadableFromSource, magazineToLoad, withFullMagazine } from './magazine-load.ts';

const HAND_FLAMER = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.j7K8l9M0n1O2p3Q4';

function weapon(overrides: Partial<LoadableWeapon> = {}): LoadableWeapon {
    return { type: 'weapon', clipValue: 0, clipMax: 0, magazineSegments: 0, compendiumSource: HAND_FLAMER, ...overrides };
}

describe('magazineToLoad', () => {
    it('loads an empty weapon to its clip size', () => {
        expect(magazineToLoad(weapon(), 12)).toBe(12);
    });

    it('leaves a weapon that already holds rounds', () => {
        expect(magazineToLoad(weapon({ clipValue: 3 }), 12)).toBeNull();
    });

    it('leaves a weapon with a loaded special-ammo magazine', () => {
        expect(magazineToLoad(weapon({ magazineSegments: 1 }), 12)).toBeNull();
    });

    it('leaves a weapon with no clip (melee, or clip.max 0)', () => {
        expect(magazineToLoad(weapon(), 0)).toBeNull();
        expect(magazineToLoad(weapon(), null)).toBeNull();
    });

    it('ignores anything that is not a weapon', () => {
        expect(magazineToLoad(weapon({ type: 'armour' }), 12)).toBeNull();
    });
});

describe('fullMagazineFor', () => {
    it('uses the weapon’s own clip size without a compendium lookup', async () => {
        const resolve = vi.fn().mockResolvedValue(99);
        await expect(fullMagazineFor(weapon({ clipMax: 6 }), resolve)).resolves.toBe(6);
        expect(resolve).not.toHaveBeenCalled();
    });

    it('resolves a lean stub’s clip size from its compendium source', async () => {
        const resolve = vi.fn().mockResolvedValue(2);
        await expect(fullMagazineFor(weapon(), resolve)).resolves.toBe(2);
        expect(resolve).toHaveBeenCalledWith(HAND_FLAMER);
    });

    it('does not look up a weapon that needs no loading', async () => {
        const resolve = vi.fn().mockResolvedValue(2);
        await expect(fullMagazineFor(weapon({ clipValue: 1 }), resolve)).resolves.toBeNull();
        expect(resolve).not.toHaveBeenCalled();
    });

    it('leaves an unlinked weapon with no clip size alone', async () => {
        const resolve = vi.fn();
        await expect(fullMagazineFor(weapon({ compendiumSource: null }), resolve)).resolves.toBeNull();
        expect(resolve).not.toHaveBeenCalled();
    });

    it('leaves a compendium melee weapon (resolved clip size 0) alone', async () => {
        await expect(fullMagazineFor(weapon(), vi.fn().mockResolvedValue(null))).resolves.toBeNull();
    });
});

describe('loadableFromSource', () => {
    it('reads a lean stub with no system as an empty, unsized, linked weapon', () => {
        expect(loadableFromSource({ name: 'Hand Flamer', type: 'weapon', _stats: { compendiumSource: HAND_FLAMER } })).toEqual(weapon());
    });

    it('reads the stored clip and magazine', () => {
        const raw = { type: 'weapon', system: { clip: { value: 4, max: 10, magazine: [{ count: 4 }] } }, _stats: { compendiumSource: null } };
        expect(loadableFromSource(raw)).toEqual({ type: 'weapon', clipValue: 4, clipMax: 10, magazineSegments: 1, compendiumSource: null });
    });
});

describe('withFullMagazine', () => {
    it('writes a full magazine into a copy, keeping every other field', async () => {
        const raw = { name: 'Autogun', type: 'weapon', system: { clip: { max: 30, value: 0, type: 'autogun' }, class: 'basic' } };
        const loaded = await withFullMagazine(raw, vi.fn());
        expect(loaded).toEqual({ name: 'Autogun', type: 'weapon', system: { clip: { max: 30, value: 30, type: 'autogun' }, class: 'basic' } });
        expect(raw.system.clip.value).toBe(0);
    });

    it('loads a lean stub that carries no system at all', async () => {
        const raw = { name: 'Hand Flamer', type: 'weapon', _stats: { compendiumSource: HAND_FLAMER } };
        const loaded = await withFullMagazine(raw, vi.fn().mockResolvedValue(2));
        expect(loaded).toEqual({ ...raw, system: { clip: { value: 2 } } });
    });

    it('returns the payload itself when nothing changes', async () => {
        const raw = { name: 'Sword', type: 'weapon', system: { clip: { max: 0, value: 0 } } };
        await expect(withFullMagazine(raw, vi.fn().mockResolvedValue(null))).resolves.toBe(raw);
    });
});

interface FromUuidShim {
    fromUuid?: ((uuid: string) => Promise<object | null>) | undefined;
}
const G = globalThis as FromUuidShim;

describe('canonicalClipMax', () => {
    afterEach(() => {
        G.fromUuid = undefined;
    });

    it('reads the prepared clip size of the Item the UUID names', async () => {
        G.fromUuid = vi.fn().mockResolvedValue({ documentName: 'Item', system: { clip: { max: 2 } } });
        await expect(canonicalClipMax(HAND_FLAMER)).resolves.toBe(2);
    });

    it('is null for a non-Item, an unsized clip, or an unresolved UUID', async () => {
        G.fromUuid = vi.fn().mockResolvedValue({ documentName: 'Actor', system: { clip: { max: 2 } } });
        await expect(canonicalClipMax(HAND_FLAMER)).resolves.toBeNull();
        G.fromUuid = vi.fn().mockResolvedValue({ documentName: 'Item', system: { clip: { max: 0 } } });
        await expect(canonicalClipMax(HAND_FLAMER)).resolves.toBeNull();
        G.fromUuid = vi.fn().mockResolvedValue(null);
        await expect(canonicalClipMax(HAND_FLAMER)).resolves.toBeNull();
    });

    it('is null, with a warning, when the lookup throws', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        G.fromUuid = vi.fn().mockRejectedValue(new Error('pack missing'));
        await expect(canonicalClipMax(HAND_FLAMER)).resolves.toBeNull();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
