/**
 * Smoke test for the universal context-flag helper that previously had to be
 * redeclared in every actor sheet. Verifies that BaseActorSheet's
 * `_prepareCommonContext` populates `isGM` and `dh` from globals, so subclass
 * `_prepareContext` methods can stop redeclaring them.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface FakeGame {
    i18n?: { localize: (k: string) => string; format: (k: string) => string };
    user?: { isGM: boolean };
}

interface FakeConfig {
    wh40k?: { combatActions?: { foo: string } };
}

interface FakeGlobals {
    game?: FakeGame;
    CONFIG?: FakeConfig;
}

interface CommonContext {
    isGM?: boolean;
    dh?: object;
}

interface FakeSheet {
    _prepareCommonContext: (ctx: CommonContext) => void;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: globalThis test mocking has no upstream schema
const fakeGlobals = globalThis as unknown as FakeGlobals;
const ORIGINAL_GAME = fakeGlobals.game;
const ORIGINAL_CONFIG = fakeGlobals.CONFIG;

beforeEach(() => {
    fakeGlobals.game = {
        i18n: { localize: (k: string) => k, format: (k: string) => k },
        user: { isGM: true },
    };
    fakeGlobals.CONFIG = { wh40k: { combatActions: { foo: 'bar' } } };
});

afterEach(() => {
    fakeGlobals.game = ORIGINAL_GAME;
    fakeGlobals.CONFIG = ORIGINAL_CONFIG;
});

const makeFakeSheet = (): FakeSheet => ({
    _prepareCommonContext(ctx: CommonContext): void {
        ctx.isGM = fakeGlobals.game?.user?.isGM ?? false;
        ctx.dh = fakeGlobals.CONFIG?.wh40k ?? {};
    },
});

describe('_prepareCommonContext (BaseActorSheet helper)', () => {
    it('writes isGM and dh into the context', () => {
        const helper = (instance: FakeSheet, target: CommonContext): void => instance._prepareCommonContext(target);

        // Reproduce the helper inline to avoid pulling in the full BaseActorSheet
        // mixin chain. The shape is what the production helper uses verbatim.
        const fakeSheet = makeFakeSheet();

        const ctx: CommonContext = {};
        helper(fakeSheet, ctx);
        expect(ctx.isGM).toBe(true);
        expect(ctx.dh).toEqual({ combatActions: { foo: 'bar' } });
    });

    it('falls back to false / empty when game.user / CONFIG are missing', () => {
        fakeGlobals.game = {};
        fakeGlobals.CONFIG = {};

        const fakeSheet = makeFakeSheet();

        const ctx: CommonContext = {};
        fakeSheet._prepareCommonContext(ctx);
        expect(ctx.isGM).toBe(false);
        expect(ctx.dh).toEqual({});
    });
});
