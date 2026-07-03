import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropItemAsItemPile, isItemPilesPile, registerItemPilesValuation, shouldSeedPileActorType } from './item-piles.ts';

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

describe('isItemPilesPile', () => {
    it('is true for an actor flagged as an enabled Item Piles pile', () => {
        expect(isItemPilesPile({ flags: { 'item-piles': { data: { enabled: true } } } })).toBe(true);
    });

    it('is false when the pile flag is disabled, absent, or malformed', () => {
        expect(isItemPilesPile({ flags: { 'item-piles': { data: { enabled: false } } } })).toBe(false);
        expect(isItemPilesPile({ flags: { 'item-piles': { data: {} } } })).toBe(false);
        expect(isItemPilesPile({ flags: { 'item-piles': 'not-an-object' } })).toBe(false);
        expect(isItemPilesPile({ flags: {} })).toBe(false);
    });

    it('is false for null/undefined or a non-flaggable actor', () => {
        expect(isItemPilesPile(null)).toBe(false);
        expect(isItemPilesPile(undefined)).toBe(false);
        expect(isItemPilesPile({})).toBe(false);
    });
});

describe('registerItemPilesValuation — system integration payload', () => {
    interface CapturedConfig {
        VERSION: string;
        ACTOR_CLASS_TYPE: string;
        ITEM_QUANTITY_ATTRIBUTE: string;
        ITEM_PRICE_ATTRIBUTE: string;
        ITEM_FILTERS: Array<{ path: string; filters: string }>;
        CURRENCIES: object[];
    }

    it('registers a complete payload (pile actor type + quantity + filters) on item-piles-ready', () => {
        let captured: CapturedConfig | undefined;
        const addSystemIntegration = vi.fn((config: CapturedConfig): void => {
            captured = config;
        });
        let readyCb: (() => void) | undefined;
        vi.stubGlobal('Hooks', {
            once: (event: string, cb: () => void) => {
                if (event === 'item-piles-ready') readyCb = cb;
            },
        });
        // isGM:false → the async seed step returns early, so this test isolates the payload.
        vi.stubGlobal('game', { modules: { get: () => ({ active: true }) }, itempiles: { API: { addSystemIntegration } }, user: { isGM: false } });

        registerItemPilesValuation();
        expect(readyCb).toBeTypeOf('function');
        readyCb?.();

        expect(captured).toBeDefined();
        const cfg = captured as CapturedConfig;
        // The bug that broke drops: ACTOR_CLASS_TYPE was empty -> "type may not be undefined".
        expect(cfg.ACTOR_CLASS_TYPE).toBe('loot');
        expect(cfg.ITEM_QUANTITY_ATTRIBUTE).toBe('system.quantity');
        expect(cfg.ITEM_PRICE_ATTRIBUTE).toBe('system.price.value');
        expect(cfg.VERSION).toBeTruthy();
        // Non-physical items (talents etc.) are filtered out of pile contents.
        expect(cfg.ITEM_FILTERS.some((f) => f.path === 'type' && f.filters.includes('talent'))).toBe(true);
        // Currencies come from the static WH40K.currencies registry.
        expect(cfg.CURRENCIES.length).toBeGreaterThan(0);
    });

    it('no-ops (no throw, no hook) when Item Piles is not active', () => {
        vi.stubGlobal('game', { modules: { get: () => undefined } });
        expect(() => {
            registerItemPilesValuation();
        }).not.toThrow();
    });

    /** Stub Item Piles as active with a GM user and a settings store seeded with
     *  the given actorClassType, capturing the ready callback and the set spy. */
    function stubItemPilesWithSetting(current: string): { readyCb: (() => void) | undefined; set: ReturnType<typeof vi.fn> } {
        const store = new Map<string, string>([['item-piles.actorClassType', current]]);
        const set = vi.fn().mockResolvedValue(undefined);
        const ref: { readyCb: (() => void) | undefined; set: ReturnType<typeof vi.fn> } = { readyCb: undefined, set };
        vi.stubGlobal('Hooks', {
            once: (event: string, cb: () => void) => {
                if (event === 'item-piles-ready') ref.readyCb = cb;
            },
        });
        vi.stubGlobal('game', {
            modules: { get: () => ({ active: true }) },
            itempiles: { API: { addSystemIntegration: vi.fn() } },
            user: { isGM: true },
            settings: { settings: store, get: (namespace: string, key: string) => store.get(`${namespace}.${key}`), set },
        });
        return ref;
    }

    it('seeds the item-piles actorClassType setting to loot when the GM left it empty (#402)', async () => {
        // `stub` is a live ref: registerItemPilesValuation assigns stub.readyCb via the Hooks stub.
        const stub = stubItemPilesWithSetting('');
        registerItemPilesValuation();
        stub.readyCb?.();
        // The seed runs on the fire-and-forget async chain; flush the microtask queue.
        await Promise.resolve();
        await Promise.resolve();
        expect(stub.set).toHaveBeenCalledWith('item-piles', 'actorClassType', 'loot');
    });

    it('does not overwrite an actorClassType a GM has already set (#402)', async () => {
        const stub = stubItemPilesWithSetting('npc');
        registerItemPilesValuation();
        stub.readyCb?.();
        await Promise.resolve();
        await Promise.resolve();
        expect(stub.set).not.toHaveBeenCalled();
    });
});

describe('shouldSeedPileActorType (#402)', () => {
    it('needs seeding when the setting is unset or blank (Actor.create would get type: undefined)', () => {
        expect(shouldSeedPileActorType(undefined)).toBe(true);
        expect(shouldSeedPileActorType(null)).toBe(true);
        expect(shouldSeedPileActorType('')).toBe(true);
        expect(shouldSeedPileActorType('   ')).toBe(true);
    });

    it('does not re-seed once a pile actor type is set (respects a GM override)', () => {
        expect(shouldSeedPileActorType('loot')).toBe(false);
        expect(shouldSeedPileActorType('npc')).toBe(false);
    });
});
