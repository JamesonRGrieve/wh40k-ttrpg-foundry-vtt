/**
 * Tests for `WH40KBaseActor.getRerollOptions` — the collector that surfaces
 * per-source re-roll buttons on the chat card: applicable owned-talent/trait
 * re-rolls, `wh40k.collectRerollOptions` hook contributions, and the global
 * Spend-Fate variant. The pure applicability/availability predicates are tested
 * in `src/module/rules/reroll.test.ts`; this asserts the walk + hook + fate +
 * use-ledger wiring.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { RerollOption, RerollSpec } from '../src/module/rules/reroll.ts';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

/** The mutable payload the `wh40k.collectRerollOptions` hook receives. */
interface RerollHookPayload {
    options: RerollOption[];
}

interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: { renderTemplate: () => Promise<string> } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.Collection extends Map with framework-defined key/value types
    utils: { Collection: new () => Map<unknown, unknown> };
}
interface HooksStub {
    callAll: (hook: string, payload: RerollHookPayload) => boolean;
    on: (hook: string, fn: () => void) => number;
    once: (hook: string, fn: () => void) => number;
    off: (hook: string, id: number) => void;
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string) => string };
    user: { id: string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
    Hooks?: HooksStub | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor takes an open source data object per the framework
    Actor?: (new (data?: Record<string, unknown>) => object) | undefined;
    CONST?: { TOKEN_DISPLAY_MODES: { OWNER_HOVER: number }; TOKEN_DISPOSITIONS: { NEUTRAL: number; HOSTILE: number } } | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; declare global cannot augment globalThis inside a vitest file without leaking
const stubs = globalThis as unknown as FoundryStubs;
const ORIGINAL = { foundry: stubs.foundry, game: stubs.game, Hooks: stubs.Hooks, Actor: stubs.Actor, CONST: stubs.CONST };

class FakeActor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.system is the DataModel slot; this stub overrides it per-instance
    declare system: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.items is a Collection; this stub overrides it per-instance
    declare items: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor accepts an open source data object per the framework
    constructor(public _data: Record<string, unknown> = {}) {
        Object.assign(this, _data);
    }
}

let hookListeners: Array<(payload: RerollHookPayload) => void> = [];
stubs.foundry = {
    applications: { api: buildApplicationV2Api(), handlebars: { renderTemplate: async () => Promise.resolve('') } },
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.Collection extends Map with arbitrary key/value types per the framework
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.Actor = FakeActor;
stubs.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 0 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0, HOSTILE: -1 } };
stubs.game = {
    i18n: { localize: (key: string): string => key, format: (key: string): string => key },
    user: { id: 'test' },
    settings: { get: (): boolean => false },
    wh40k: { log: (): void => {}, error: (): void => {} },
};
stubs.Hooks = {
    callAll: (_hook: string, payload: RerollHookPayload): boolean => {
        for (const fn of hookListeners) fn(payload);
        return true;
    },
    on: (): number => 0,
    once: (): number => 0,
    off: (): void => {},
};

const { WH40KBaseActor } = await import('../src/module/documents/base-actor.ts');

afterAll(() => {
    stubs.foundry = ORIGINAL.foundry;
    stubs.game = ORIGINAL.game;
    stubs.Hooks = ORIGINAL.Hooks;
    stubs.Actor = ORIGINAL.Actor;
    stubs.CONST = ORIGINAL.CONST;
});

type WH40KBaseActorInstance = InstanceType<typeof WH40KBaseActor>;

interface MockItem {
    isTalent: boolean;
    isTrait: boolean;
    id: string;
    name: string;
    system: { reroll?: RerollSpec };
}

function rerollSpec(overrides: Partial<RerollSpec> = {}): RerollSpec {
    return {
        enabled: true,
        modifier: 0,
        condition: 'failed',
        appliesTo: { mode: 'any', types: [], keys: [] },
        frequency: 'at-will',
        uses: 1,
        label: '',
        ...overrides,
    };
}

function makeActor(opts: { items?: MockItem[]; fate?: number; ledger?: Record<string, number> }): WH40KBaseActorInstance {
    const actor = Object.create(WH40KBaseActor.prototype) as WH40KBaseActorInstance;
    Object.assign(actor, {
        items: opts.items ?? [],
        system: { fate: { value: opts.fate ?? 0 } },
        getFlag: (_scope: string, _key: string): Record<string, number> => opts.ledger ?? {},
    });
    return actor;
}

function getOptions(actor: WH40KBaseActorInstance, ctx: { success: boolean; type: string; rollKey: string }): RerollOption[] {
    return actor.getRerollOptions(ctx);
}

beforeEach(() => {
    hookListeners = [];
});

describe('getRerollOptions', () => {
    it('surfaces an applicable talent re-roll as an item variant', () => {
        const item: MockItem = {
            isTalent: true,
            isTrait: false,
            id: 'keen',
            name: 'Keen Intuition',
            system: { reroll: rerollSpec({ appliesTo: { mode: 'keys', types: [], keys: ['awareness'] } }) },
        };
        const opts = getOptions(makeActor({ items: [item] }), { success: false, type: 'Skill', rollKey: 'awareness' });
        const keen = opts.find((o) => o.kind === 'item');
        expect(keen).toBeDefined();
        expect(keen?.label).toBe('Keen Intuition');
        expect(keen?.id).toBe('keen:at-will');
        expect(keen?.disabled).toBe(false);
    });

    it('omits a talent re-roll that does not apply to the test key', () => {
        const item: MockItem = {
            isTalent: true,
            isTrait: false,
            id: 'keen',
            name: 'Keen Intuition',
            system: { reroll: rerollSpec({ appliesTo: { mode: 'keys', types: [], keys: ['awareness'] } }) },
        };
        const opts = getOptions(makeActor({ items: [item] }), { success: false, type: 'Skill', rollKey: 'dodge' });
        expect(opts.some((o) => o.kind === 'item')).toBe(false);
    });

    it('marks a windowed re-roll disabled when its uses are exhausted', () => {
        const item: MockItem = {
            isTalent: true,
            isTrait: false,
            id: 'second-wind',
            name: 'Second Wind',
            system: { reroll: rerollSpec({ frequency: 'per-encounter', uses: 1 }) },
        };
        const opts = getOptions(makeActor({ items: [item], ledger: { 'second-wind:per-encounter': 1 } }), { success: false, type: 'Skill', rollKey: 'dodge' });
        const variant = opts.find((o) => o.id === 'second-wind:per-encounter');
        expect(variant?.disabled).toBe(true);
    });

    it('includes the global Fate variant last when the actor has fate', () => {
        const opts = getOptions(makeActor({ fate: 2 }), { success: false, type: 'Skill', rollKey: 'dodge' });
        expect(opts.at(-1)?.kind).toBe('fate');
    });

    it('omits the Fate variant when the actor has no fate', () => {
        const opts = getOptions(makeActor({ fate: 0 }), { success: false, type: 'Skill', rollKey: 'dodge' });
        expect(opts.some((o) => o.kind === 'fate')).toBe(false);
    });

    it('lets a wh40k.collectRerollOptions listener contribute a variant', () => {
        hookListeners.push((payload) => {
            payload.options.push({
                id: 'mod:x',
                kind: 'external',
                label: 'Module Re-roll',
                modifier: 0,
                source: 'Mod',
                disabled: false,
                frequency: 'at-will',
            });
        });
        const opts = getOptions(makeActor({}), { success: false, type: 'Skill', rollKey: 'dodge' });
        expect(opts.some((o) => o.id === 'mod:x' && o.kind === 'external')).toBe(true);
    });
});
