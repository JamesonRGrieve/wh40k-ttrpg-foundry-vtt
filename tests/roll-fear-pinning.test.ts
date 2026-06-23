/**
 * Regression guard: `WH40KBaseActor.rollFearTest` / `rollPinningTest` /
 * `rollEscapePinningTest` must route their Willpower test through the UNIFIED
 * roll pipeline (`prepareUnifiedRoll`) with `type='Characteristic'`,
 * `rollKey='willpower'`, and the situational-modifier collector keyed on
 * `willpower` — that is what surfaces conditional Willpower talents/traits
 * (Resistance(Fear), Jaded, …) as selectable modifiers BEFORE the test resolves.
 *
 * We mock `prepareUnifiedRoll` to capture the ActionData each method builds,
 * then assert its rollData shape. The pure target math is covered separately by
 * `src/module/rules/fear.test.ts` and `src/module/rules/pinning.test.ts`.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

// --- Mock the unified-roll entry so methods can be inspected, not rendered. ---
// eslint-disable-next-line no-restricted-syntax -- boundary: prepareUnifiedRoll receives the opaque SimpleSkillData ActionData; the mock captures it as unknown and narrows in lastRollData()
const prepareUnifiedRoll = vi.fn<(data: unknown) => void>();
vi.mock('../src/module/applications/prompts/unified-roll-dialog.ts', () => ({
    prepareUnifiedRoll,
}));

// --- Stub Foundry globals before importing system modules (see ----------------
//     build-simple-skill-roll.test.ts for the rationale). -----------------------
interface FoundryHandlebarsStub {
    renderTemplate: () => Promise<string>;
}
interface FoundryUtilsStub {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined keys/values.
    Collection: new () => Map<unknown, unknown>;
}
interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: FoundryHandlebarsStub };
    utils: FoundryUtilsStub;
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string) => string };
    user: { id: string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface ConstStub {
    TOKEN_DISPLAY_MODES: { OWNER_HOVER: number };
    TOKEN_DISPOSITIONS: { NEUTRAL: number; HOSTILE: number };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor takes an open source data object per the framework.
    Actor?: (new (data?: Record<string, unknown>) => object) | undefined;
    CONST?: ConstStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the FoundryStubs shape; `declare global` cannot augment globalThis inside a vitest file without leaking.
const stubs = globalThis as unknown as FoundryStubs;
const ORIGINAL_FOUNDRY = stubs.foundry;
const ORIGINAL_GAME = stubs.game;
const ORIGINAL_ACTOR = stubs.Actor;
const ORIGINAL_CONST = stubs.CONST;

class FakeActor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.system is the DataModel slot; this stub overrides it per-instance.
    declare system: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor accepts an open source data object per the framework.
    constructor(public _data: Record<string, unknown> = {}) {
        Object.assign(this, _data);
    }
}

stubs.foundry = {
    applications: {
        api: buildApplicationV2Api(),
        handlebars: { renderTemplate: async () => Promise.resolve('') },
    },
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.Collection extends Map with arbitrary key/value types per the framework.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.Actor = FakeActor;
stubs.CONST = {
    TOKEN_DISPLAY_MODES: { OWNER_HOVER: 0 },
    TOKEN_DISPOSITIONS: { NEUTRAL: 0, HOSTILE: -1 },
};
stubs.game = {
    i18n: { localize: (key: string): string => key, format: (key: string): string => key },
    user: { id: 'test' },
    settings: { get: (): boolean => false },
    wh40k: { log: (): void => {}, error: (): void => {} },
};

const { WH40KBaseActor } = await import('../src/module/documents/base-actor.ts');

afterAll(() => {
    stubs.foundry = ORIGINAL_FOUNDRY;
    stubs.game = ORIGINAL_GAME;
    stubs.Actor = ORIGINAL_ACTOR;
    stubs.CONST = ORIGINAL_CONST;
});

type WH40KBaseActorInstance = InstanceType<typeof WH40KBaseActor>;

interface CapturedRollData {
    type: string;
    rollKey: string;
    baseTarget: number;
    modifiers: { modifier: number; situational?: number; [key: string]: number | undefined };
}

/** Build a bare actor whose `characteristics` getter returns a fixed Willpower total. */
function makeActor(willpowerTotal: number): WH40KBaseActorInstance {
    const actor = Object.create(WH40KBaseActor.prototype) as WH40KBaseActorInstance;
    Object.assign(actor, { system: { characteristics: { willpower: { total: willpowerTotal, label: 'Willpower' } } } });
    return actor;
}

/** Pull the rollData out of the SimpleSkillData passed to the last prepareUnifiedRoll call. */
function lastRollData(): CapturedRollData {
    const arg = prepareUnifiedRoll.mock.calls.at(-1)?.[0];
    // eslint-disable-next-line no-restricted-syntax -- boundary: prepareUnifiedRoll is mocked; its arg is the opaque SimpleSkillData, narrowed to the rollData fields under test.
    return (arg as { rollData: unknown }).rollData as CapturedRollData;
}

beforeEach(() => {
    prepareUnifiedRoll.mockClear();
});

describe('rollFearTest', () => {
    it('routes a Willpower characteristic test through unified with the Fear penalty as a named modifier', () => {
        makeActor(45).rollFearTest(2);
        expect(prepareUnifiedRoll).toHaveBeenCalledTimes(1);
        const rd = lastRollData();
        expect(rd.type).toBe('Characteristic');
        expect(rd.rollKey).toBe('willpower');
        expect(rd.baseTarget).toBe(45);
        // Fear (2) → −10 × 2 = −20, shown as a visible named modifier.
        expect(rd.modifiers['fear']).toBe(-20);
    });

    it('is a no-op at Fear rating 0 (no Fear trait)', () => {
        makeActor(45).rollFearTest(0);
        expect(prepareUnifiedRoll).not.toHaveBeenCalled();
    });
});

describe('rollPinningTest', () => {
    it('routes a Willpower test through unified at the composed target (WP + trigger)', () => {
        makeActor(40).rollPinningTest(0);
        const rd = lastRollData();
        expect(rd.type).toBe('Characteristic');
        expect(rd.rollKey).toBe('willpower');
        expect(rd.baseTarget).toBe(40);
    });

    it('folds the trigger modifier into the composed target', () => {
        makeActor(40).rollPinningTest(10);
        expect(lastRollData().baseTarget).toBe(50);
    });
});

describe('rollEscapePinningTest', () => {
    it('adds the +30 favourable bonus when in cover or not being shot at', () => {
        makeActor(40).rollEscapePinningTest({ inCover: true, notBeingShotAt: false });
        expect(lastRollData().baseTarget).toBe(70);
    });

    it('omits the bonus when neither favourable condition holds', () => {
        makeActor(40).rollEscapePinningTest({ inCover: false, notBeingShotAt: false });
        expect(lastRollData().baseTarget).toBe(40);
    });
});
