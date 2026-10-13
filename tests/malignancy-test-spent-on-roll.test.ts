/**
 * A rolled Malignancy Test leaves the owed queue (#67, 35092c9ab) — driven through
 * the unified roll dialog's simple-roll path, the one the sheet's button uses.
 *
 * Regression: the dialog resolved a simple (skill / characteristic) roll with
 * `_resolveSimpleActionHooks` (opposed + description) and posted it, but never
 * called `useResources` — only the weapon / psychic `performActionAndSendToChat`
 * did. `MalignancyTestActionData` spends its owed test in `useResources`, so on
 * real Foundry the queue stayed at 1 after the roll (Tier B malignancy.spec), and
 * a Fate re-roll (refund → `performActionAndSendToChat`) added a test back.
 * The unit tests called `useResources()` directly, so they could not see it.
 *
 * With the fix the ledger nets out across a Fate re-roll: the roll consumes, the
 * re-roll refunds then consumes again.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { installApplicationV2Stub } from '../src/module/testing/app-v2-stub.ts';

interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string) => string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface Stubs {
    game?: GameStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as Stubs;
const ORIGINAL_GAME = stubs.game;
installApplicationV2Stub();
stubs.game = {
    i18n: { localize: (key: string): string => key, format: (key: string): string => key },
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

// Imports must come AFTER the stubs so module-init code finds the shims.
const { MalignancyTestActionData } = await import('../src/module/rolls/action-data.ts');
const UnifiedRollDialog = (await import('../src/module/applications/prompts/unified-roll-dialog.ts')).default;

afterAll(() => {
    stubs.game = ORIGINAL_GAME;
});

/** A ledger that records each move of the owed-test queue. */
function makeLedger(): { moves: number[]; consume: () => Promise<void>; refund: () => Promise<void> } {
    const moves: number[] = [];
    return {
        moves,
        consume: async (): Promise<void> => {
            moves.push(-1);
            return Promise.resolve();
        },
        refund: async (): Promise<void> => {
            moves.push(1);
            return Promise.resolve();
        },
    };
}

describe('Malignancy Test through the unified roll dialog (#67)', () => {
    it('a resolved roll spends the owed test', async () => {
        const ledger = makeLedger();
        const action = new MalignancyTestActionData(ledger, 'dh2');
        action.rollData.success = true;
        const dialog = new UnifiedRollDialog(action);
        await dialog._resolveSimpleActionHooks();
        expect(ledger.moves).toEqual([-1]);
    });

    it('nets one spend across a Fate re-roll (roll, refund, re-run)', async () => {
        const ledger = makeLedger();
        const action = new MalignancyTestActionData(ledger, 'dh2');
        action.rollData.success = true;
        await new UnifiedRollDialog(action)._resolveSimpleActionHooks();
        // basic-action-manager._fateReroll: refundResources, then performActionAndSendToChat,
        // whose resolution step spends the resources again.
        await action.refundResources();
        await action.useResources();
        expect(ledger.moves).toEqual([-1, 1, -1]);
        expect(ledger.moves.reduce((sum, move) => sum + move, 0)).toBe(-1);
    });
});
