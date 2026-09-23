import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_ID } from '../constants.ts';
import {
    type CompendiumDropInput,
    cachedCompendiumActor,
    compendiumActorUuidOf,
    ensureCompendiumTokenActor,
    preloadCompendiumTokenActors,
    shouldPlaceTokenOnly,
} from './compendium-token-actors.ts';

const base: CompendiumDropInput = {
    type: 'Actor',
    uuid: 'Compendium.wh40k-rpg.dh2-core-actors-bestiary.Actor.abcdefghijklmnop',
    actorType: 'dh2-npc',
    isCharacter: false,
    ctrlKey: false,
    importSetting: false,
};

describe('shouldPlaceTokenOnly', () => {
    it('places a compendium NPC or vehicle as a token only', () => {
        expect(shouldPlaceTokenOnly(base)).toBe(true);
        expect(shouldPlaceTokenOnly({ ...base, actorType: 'dh2-terracraft' })).toBe(true);
    });

    it('imports characters (they are linked world actors)', () => {
        expect(shouldPlaceTokenOnly({ ...base, actorType: 'dh2-character', isCharacter: true })).toBe(false);
    });

    it('leaves world actors and non-actor drops to core', () => {
        expect(shouldPlaceTokenOnly({ ...base, uuid: 'Actor.abcdefghijklmnop' })).toBe(false);
        expect(shouldPlaceTokenOnly({ ...base, type: 'Item' })).toBe(false);
        expect(shouldPlaceTokenOnly({ ...base, uuid: undefined })).toBe(false);
    });

    it('imports when the type is unknown (no pack index entry)', () => {
        expect(shouldPlaceTokenOnly({ ...base, actorType: undefined })).toBe(false);
    });

    it('honours the Ctrl override and the import setting', () => {
        expect(shouldPlaceTokenOnly({ ...base, ctrlKey: true })).toBe(false);
        expect(shouldPlaceTokenOnly({ ...base, importSetting: true })).toBe(false);
    });
});

describe('compendiumActorUuidOf', () => {
    it('reads the flag, ignoring blanks and non-strings', () => {
        type FlagValue = string | number | undefined;
        const token = (value: FlagValue): { getFlag: () => FlagValue } => ({ getFlag: () => value });
        expect(compendiumActorUuidOf(token(base.uuid))).toBe(base.uuid);
        expect(compendiumActorUuidOf(token(''))).toBeNull();
        expect(compendiumActorUuidOf(token(undefined))).toBeNull();
        expect(compendiumActorUuidOf(token(7))).toBeNull();
    });
});

describe('ensureCompendiumTokenActor', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    interface MockToken {
        getFlag: (scope: string, key: string) => string | undefined;
        actorLink: boolean;
        isLazyDelta: boolean;
        reset: () => void;
        delta: { _createSyntheticActor: (options: { reinitializeCollections: boolean }) => void };
        object: { renderFlags: { set: (flags: { redraw: boolean }) => void } };
        calls: string[];
    }

    function mockToken(uuid: string, isLazyDelta: boolean): MockToken {
        const calls: string[] = [];
        return {
            getFlag: (scope, key) => (scope === SYSTEM_ID && key === 'compendiumActor' ? uuid : undefined),
            actorLink: false,
            isLazyDelta,
            reset: () => calls.push('reset'),
            delta: { _createSyntheticActor: () => calls.push('rebuild') },
            object: { renderFlags: { set: () => calls.push('redraw') } },
            calls,
        };
    }

    it('caches the compendium actor and rebuilds a synthetic actor materialised without it', async () => {
        const uuid = 'Compendium.wh40k-rpg.pack.Actor.rebuildRebuild0001';
        const actor = { documentName: 'Actor', name: 'Hive Ganger' };
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue(actor));
        const token = mockToken(uuid, false);

        await ensureCompendiumTokenActor(token);

        expect(cachedCompendiumActor(uuid)).toBe(actor);
        expect(token.calls).toEqual(['rebuild', 'reset', 'redraw']);
    });

    it('does not rebuild a still-lazy delta (it will build from the cache on first access)', async () => {
        const uuid = 'Compendium.wh40k-rpg.pack.Actor.lazyLazyLazy0002';
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ documentName: 'Actor' }));
        const token = mockToken(uuid, true);
        await ensureCompendiumTokenActor(token);
        expect(token.calls).toEqual([]);
    });

    it('loads each UUID once and skips tokens without the flag', async () => {
        const uuid = 'Compendium.wh40k-rpg.pack.Actor.onceOnceOnce0003';
        const fromUuidSpy = vi.fn().mockResolvedValue({ documentName: 'Actor' });
        vi.stubGlobal('fromUuid', fromUuidSpy);
        const plain = { ...mockToken('', false), getFlag: (): undefined => undefined };
        await preloadCompendiumTokenActors([{ tokens: [mockToken(uuid, true), mockToken(uuid, true), plain] }]);
        expect(fromUuidSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores a UUID that resolves to a non-Actor', async () => {
        const uuid = 'Compendium.wh40k-rpg.pack.Item.notAnActor000004';
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ documentName: 'Item' }));
        const token = mockToken(uuid, false);
        await ensureCompendiumTokenActor(token);
        expect(cachedCompendiumActor(uuid)).toBeNull();
        expect(token.calls).toEqual([]);
    });
});
