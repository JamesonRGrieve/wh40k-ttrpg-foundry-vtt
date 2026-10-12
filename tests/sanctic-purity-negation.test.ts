/**
 * Sanctic Purity (#131, DH2 Enemies Beyond): a psyker holding the talent who
 * triggers Psychic Phenomena while manifesting a Sanctic Daemonology power may
 * spend a Fate point to negate it entirely. `ActionData.checkForPerils` offers
 * the spend; accepting it spends the Fate, posts the "Phenomena Negated" card,
 * and skips the Phenomena roll.
 */

import { afterAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type * as RollHelpers from '../src/module/rolls/roll-helpers.ts';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

vi.mock('../src/module/rolls/roll-helpers.ts', async (importOriginal) => {
    const original = await importOriginal<typeof RollHelpers>();
    return { ...original, emitChatFromTemplate: vi.fn().mockResolvedValue(undefined) };
});

interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: { renderTemplate: () => Promise<string> } };
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
    ChatMessage?: { getSpeaker: () => object } | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as FoundryStubs;
const ORIGINAL = { foundry: stubs.foundry, game: stubs.game, ChatMessage: stubs.ChatMessage };

stubs.foundry = {
    applications: { api: buildApplicationV2Api(), handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') } },
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.game = {
    i18n: { localize: (key: string): string => key, format: (key: string): string => key },
    // autoPsychicPhenomena on, so an un-negated Phenomena is rolled.
    settings: { get: (): boolean => true },
    wh40k: {
        log: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};
stubs.ChatMessage = { getSpeaker: (): object => ({}) };

// Imports must come AFTER the stubs so module-init code finds the shims.
const { PsychicActionData } = await import('../src/module/rolls/action-data.ts');
const { RollTableUtils } = await import('../src/module/utils/roll-table-utils.ts');
const ConfirmationDialog = (await import('../src/module/applications/dialogs/confirmation-dialog.ts')).default;
const { emitChatFromTemplate } = await import('../src/module/rolls/roll-helpers.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

const SANCTIC_PURITY = { type: 'talent', system: { identifier: 'sancticPurity' } };

/** A Phenomena-triggering (doubles, 33) cast of a `discipline` power by a psyker with `fate` and `items`. */
async function perils(opts: {
    discipline: string;
    fate: number;
    items: object[];
}): Promise<{ spendFate: ReturnType<typeof vi.fn>; action: InstanceType<typeof PsychicActionData> }> {
    const action = new PsychicActionData();
    const spendFate = vi.fn().mockResolvedValue(undefined);
    const actor = { name: 'Brother Castor', system: { gameSystem: 'dh2', psy: { rating: 3 }, fate: { value: opts.fate } }, items: opts.items, spendFate };
    // eslint-disable-next-line no-restricted-syntax -- boundary: a structural psyker stub standing in for the Foundry Actor document the roll data holds
    action.rollData.sourceActor = actor as unknown as typeof action.rollData.sourceActor;
    // eslint-disable-next-line no-restricted-syntax -- boundary: a structural power stub standing in for the Foundry Item document the roll data holds
    action.rollData.power = { system: { discipline: opts.discipline, phenomenaModifier: 0 } } as unknown as typeof action.rollData.power;
    action.rollData.pr = 3;
    action.rollData.success = true;
    // eslint-disable-next-line no-restricted-syntax -- boundary: a structural evaluated-Roll stub; checkForPerils reads only its total
    action.rollData.roll = { total: 33 } as unknown as typeof action.rollData.roll;
    await action.checkForPerils();
    return { spendFate, action };
}

describe('Sanctic Purity — Fate-negating Psychic Phenomena', () => {
    let rollPhenomena: MockInstance<typeof RollTableUtils.rollPsychicPhenomena>;
    let confirm: MockInstance<typeof ConfirmationDialog.confirm>;

    beforeEach(() => {
        vi.clearAllMocks();
        rollPhenomena = vi.spyOn(RollTableUtils, 'rollPsychicPhenomena').mockResolvedValue(null);
        confirm = vi.spyOn(ConfirmationDialog, 'confirm').mockResolvedValue(true);
    });

    it('spends a Fate point, posts the negated card and skips the Phenomena roll', async () => {
        const { spendFate, action } = await perils({ discipline: 'sanctic', fate: 2, items: [SANCTIC_PURITY] });
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(spendFate).toHaveBeenCalledTimes(1);
        expect(emitChatFromTemplate).toHaveBeenCalledWith(
            'systems/wh40k-rpg/templates/chat/sanctic-purity-negated-chat.hbs',
            expect.objectContaining({ fateBefore: 2, fateAfter: 1, fateCost: 1 }),
            expect.anything(),
        );
        expect(rollPhenomena).not.toHaveBeenCalled();
        expect(JSON.stringify(action.effectOutput)).toContain('WH40K.SancticPurity.NegatedChatBody');
    });

    it('rolls the Phenomena when the psyker declines the spend', async () => {
        confirm.mockResolvedValue(false);
        const { spendFate } = await perils({ discipline: 'sanctic', fate: 2, items: [SANCTIC_PURITY] });
        expect(spendFate).not.toHaveBeenCalled();
        expect(rollPhenomena).toHaveBeenCalledTimes(1);
    });

    it('offers nothing without the talent, without Fate, or for a non-Sanctic power', async () => {
        for (const opts of [
            { discipline: 'sanctic', fate: 2, items: [] },
            { discipline: 'sanctic', fate: 0, items: [SANCTIC_PURITY] },
            { discipline: 'malefic', fate: 2, items: [SANCTIC_PURITY] },
        ]) {
            // eslint-disable-next-line no-await-in-loop -- each case is an independent sequential cast
            await perils(opts);
        }
        expect(confirm).not.toHaveBeenCalled();
        expect(rollPhenomena).toHaveBeenCalledTimes(3);
    });
});
