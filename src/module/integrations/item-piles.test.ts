import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropItemAsItemPile } from './item-piles.ts';

/**
 * Unit coverage for the #385 Item Piles drop routing. Exercises the
 * feature-detection + API-call + graceful-fallback logic with a stubbed
 * `game.itempiles` — no licensed Foundry or installed module required, so it
 * runs in any CI lane (the real-module path is exercised by the Tier B e2e in
 * the licensed lane).
 */

interface ApiStub {
    createItemPile?: (options: { sceneId?: string; position?: { x: number; y: number }; items?: object[] }) => Promise<void>;
}
interface GameStub {
    modules: { get: (id: string) => { active: boolean } | undefined };
    itempiles?: { API?: ApiStub };
}

function stubGame(g: GameStub): void {
    vi.stubGlobal('game', g);
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const POS = { x: 100, y: 200 };

describe('dropItemAsItemPile (#385)', () => {
    it('returns false when Item Piles is not installed/active', async () => {
        stubGame({ modules: { get: () => undefined } });
        expect(await dropItemAsItemPile({ name: 'X' }, POS, 'scene1')).toBe(false);
    });

    it('returns false when Item Piles is active but exposes no createItemPile API', async () => {
        stubGame({ modules: { get: () => ({ active: true }) }, itempiles: { API: {} } });
        expect(await dropItemAsItemPile({ name: 'X' }, POS, 'scene1')).toBe(false);
    });

    it('routes the item through createItemPile and returns true when Item Piles is present', async () => {
        const createItemPile = vi.fn().mockResolvedValue(undefined);
        stubGame({ modules: { get: () => ({ active: true }) }, itempiles: { API: { createItemPile } } });
        const item = { name: 'Hand Cannon', type: 'weapon' };
        expect(await dropItemAsItemPile(item, POS, 'scene1')).toBe(true);
        expect(createItemPile).toHaveBeenCalledWith({ sceneId: 'scene1', position: POS, items: [item] });
    });

    it('falls back (returns false) when createItemPile rejects, so the caller uses the loot-actor path', async () => {
        vi.spyOn(console, 'warn').mockImplementation((): void => {});
        const createItemPile = vi.fn().mockRejectedValue(new Error('boom'));
        stubGame({ modules: { get: () => ({ active: true }) }, itempiles: { API: { createItemPile } } });
        expect(await dropItemAsItemPile({ name: 'X' }, POS, 'scene1')).toBe(false);
    });
});
