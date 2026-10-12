/**
 * Malefic Daemonology Corruption on manifestation (DH2 Enemies Beyond p. 56):
 * a successful Malefic cast costs the psyker Corruption equal to the Psy Rating
 * used. `PsychicActionData` records the cost on the card when the result is
 * final, charges it with the cast's resources, and returns it when the cast is
 * refunded for a re-roll. Lines opt in through their game-system config.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

interface FoundryStub {
    applications: {
        api: ApplicationV2Api;
        handlebars: { renderTemplate: () => Promise<string> };
        ux: { TextEditor: { implementation: { enrichHTML: (html: string) => Promise<string> } } };
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined key/value types.
    utils: { Collection: new () => Map<unknown, unknown> };
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string) => string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as FoundryStubs;
const ORIGINAL = { foundry: stubs.foundry, game: stubs.game };

stubs.foundry = {
    applications: {
        api: buildApplicationV2Api(),
        handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') },
        ux: { TextEditor: { implementation: { enrichHTML: async (html: string): Promise<string> => Promise.resolve(html) } } },
    },
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.game = {
    i18n: { localize: (key: string): string => key, format: (key: string): string => key },
    settings: { get: (): boolean => false },
    wh40k: {
        log: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};

// Imports must come AFTER the stubs so module-init code finds the shims.
const { PsychicActionData } = await import('../src/module/rolls/action-data.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

/** A cast of a `discipline` power at Psy Rating `pr` by a psyker of `gameSystem` holding `corruption`. */
async function cast(opts: {
    gameSystem: string;
    discipline: string;
    pr: number;
    success: boolean;
    corruption: number;
}): Promise<{ action: InstanceType<typeof PsychicActionData>; update: ReturnType<typeof vi.fn> }> {
    const action = new PsychicActionData();
    const update = vi.fn().mockResolvedValue({});
    const actor = { system: { gameSystem: opts.gameSystem, corruption: opts.corruption }, update };
    // eslint-disable-next-line no-restricted-syntax -- boundary: a structural psyker stub standing in for the Foundry Actor document the roll data holds
    action.rollData.sourceActor = actor as unknown as typeof action.rollData.sourceActor;
    // eslint-disable-next-line no-restricted-syntax -- boundary: a structural power stub standing in for the Foundry Item document the roll data holds
    action.rollData.power = { system: { discipline: opts.discipline, description: { value: '' } } } as unknown as typeof action.rollData.power;
    action.rollData.pr = opts.pr;
    action.rollData.success = opts.success;
    await action.descriptionText();
    return { action, update };
}

describe('Malefic Corruption on a Psychic cast', () => {
    it('records the cost on the card and charges Corruption equal to the Psy Rating used', async () => {
        const { action, update } = await cast({ gameSystem: 'dh2', discipline: 'malefic', pr: 4, success: true, corruption: 12 });
        expect(JSON.stringify(action.effectOutput)).toContain('WH40K.ActionEffect.MaleficCorruption');
        await action.useResources();
        expect(update).toHaveBeenCalledWith({ 'system.corruption': 16 });
    });

    it('returns the Corruption when the cast is refunded for a re-roll', async () => {
        const { action, update } = await cast({ gameSystem: 'dh2', discipline: 'malefic', pr: 3, success: true, corruption: 20 });
        await action.refundResources();
        expect(update).toHaveBeenCalledWith({ 'system.corruption': 17 });
    });

    it('costs nothing for a failed cast or a non-Malefic power', async () => {
        for (const opts of [
            { discipline: 'malefic', success: false },
            { discipline: 'sanctic', success: true },
            { discipline: 'telepathy', success: true },
        ]) {
            // eslint-disable-next-line no-await-in-loop -- each case is an independent sequential cast
            const { action, update } = await cast({ gameSystem: 'dh2', pr: 4, corruption: 0, ...opts });
            // eslint-disable-next-line no-await-in-loop -- see above
            await action.useResources();
            expect(update).not.toHaveBeenCalled();
            expect(JSON.stringify(action.effectOutput)).not.toContain('MaleficCorruption');
        }
    });

    it('only charges on lines whose config opts in', async () => {
        for (const gameSystem of ['dh1', 'rt', 'bc', 'ow', 'dw', 'im']) {
            // eslint-disable-next-line no-await-in-loop -- each line is an independent sequential cast
            const { action, update } = await cast({ gameSystem, discipline: 'malefic', pr: 4, success: true, corruption: 0 });
            // eslint-disable-next-line no-await-in-loop -- see above
            await action.useResources();
            expect(update).not.toHaveBeenCalled();
        }
    });
});
