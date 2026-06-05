import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { recoverCohesion } from '../rules/dw-cohesion.ts';
import type { NotifyFn } from './action-host.ts';
import { type DwCohesionActionHost, dwCohesionChallenge, dwCohesionRally, dwCohesionRecoverObjective } from './dw-cohesion-actions.ts';

/**
 * Behavior coverage for the Deathwatch Cohesion action handlers (#313 refactor
 * shipped without tests). Each handler is bound via `.call(host)` against a stub
 * host; the pure rules (recoverCohesion / cohesionChallenge) run for real, while
 * chat (postChatCard) and i18n are stubbed. Pins: which actions persist, which
 * short-circuit with a notification, and that the chat card is posted.
 */

vi.mock('../rolls/roll-helpers.ts', () => ({ postChatCard: vi.fn() }));

interface CohesionSystem {
    cohesionMax: number;
    cohesionCurrent: number;
    cohesionLostThisTurn: number;
    rallied: boolean;
}

function makeHost(system: Partial<CohesionSystem> = {}): {
    host: DwCohesionActionHost;
    update: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
} {
    const update = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn<NotifyFn>();
    const host: DwCohesionActionHost = {
        actor: {
            id: 'kt1',
            name: 'Kill-team Talon',
            system: { cohesionMax: 5, cohesionCurrent: 3, cohesionLostThisTurn: 0, rallied: false, ...system },
            update,
        },
        _notify: notify,
    };
    return { host, update, notify };
}

const evt = (): Event => new Event('click');
const tgt = (): HTMLElement => document.createElement('button');

describe('dw-cohesion action handlers (#313)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string): string => k, format: (k: string): string => k } });
        vi.stubGlobal('foundry', {
            applications: { handlebars: { renderTemplate: vi.fn<() => Promise<string>>().mockResolvedValue('<div></div>') } },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    describe('dwCohesionRally', () => {
        it('sets the rallied flag and posts a chat card when not yet rallied', async () => {
            const { host, update, notify } = makeHost({ rallied: false });
            await dwCohesionRally.call(host, evt(), tgt());
            expect(update).toHaveBeenCalledWith({ 'system.rallied': true });
            expect(vi.mocked(postChatCard)).toHaveBeenCalledTimes(1);
            expect(notify).not.toHaveBeenCalled();
        });

        it('short-circuits with an info toast (no update) when already rallied', async () => {
            const { host, update, notify } = makeHost({ rallied: true });
            await dwCohesionRally.call(host, evt(), tgt());
            expect(notify).toHaveBeenCalledWith('info', 'WH40K.DW.Cohesion.Rally.Success');
            expect(update).not.toHaveBeenCalled();
            expect(vi.mocked(postChatCard)).not.toHaveBeenCalled();
        });
    });

    describe('dwCohesionRecoverObjective', () => {
        it('persists the recovered Cohesion and posts a card when below max', async () => {
            const { host, update } = makeHost({ cohesionCurrent: 2, cohesionMax: 5 });
            const expected = recoverCohesion(2, 5, 'objective');
            await dwCohesionRecoverObjective.call(host, evt(), tgt());
            expect(update).toHaveBeenCalledWith({ 'system.cohesionCurrent': expected.newCohesion });
            expect(vi.mocked(postChatCard)).toHaveBeenCalledTimes(1);
        });

        it('short-circuits with an info toast (no update) when already at max', async () => {
            const { host, update, notify } = makeHost({ cohesionCurrent: 5, cohesionMax: 5 });
            await dwCohesionRecoverObjective.call(host, evt(), tgt());
            expect(notify).toHaveBeenCalledWith('info', 'WH40K.DW.Cohesion.Recovered');
            expect(update).not.toHaveBeenCalled();
        });
    });

    describe('dwCohesionChallenge', () => {
        it('posts a result card without mutating the actor', async () => {
            const { host, update } = makeHost({ cohesionCurrent: 4 });
            await dwCohesionChallenge.call(host, evt(), tgt());
            expect(vi.mocked(postChatCard)).toHaveBeenCalledTimes(1);
            expect(update).not.toHaveBeenCalled();
        });
    });
});
