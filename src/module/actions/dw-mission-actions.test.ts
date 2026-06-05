import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DwActiveMissionData } from '../data/actor/mixins/dw-mission-template.ts';
import type { NotifyFn } from './action-host.ts';
import { type DwMissionActionHost, dwToggleComplication, dwToggleObjective } from './dw-mission-actions.ts';

/**
 * Behavior coverage for the Deathwatch mission toggle handlers (#313 / #169).
 * The toggles read the clicked element's data-id, mutate the matching entry,
 * and persist — no chat. Pins: status cycling, the unknown-id no-op, and the
 * no-active-mission warning.
 */

vi.mock('../rolls/roll-helpers.ts', () => ({ postChatCard: vi.fn() }));

function makeMission(): DwActiveMissionData {
    return {
        id: 'm1',
        name: 'Purge the Hive',
        rating: 'standard',
        objectives: [{ id: 'o1', description: 'Secure the relic', renownReward: 5, xpReward: 100, status: 'pending' }],
        complications: [{ id: 'c1', description: 'Ambushed', renownPenalty: 2, triggered: false }],
    };
}

function makeHost(activeMission: DwActiveMissionData | null): {
    host: DwMissionActionHost;
    update: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
} {
    const update = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn<NotifyFn>();
    const host: DwMissionActionHost = {
        actor: {
            id: 'bb1',
            name: 'Brother Cassius',
            system: { activeMission, renown: 10, cohesionCurrent: 3, cohesionMax: 5 },
            update,
        },
        _notify: notify,
    };
    return { host, update, notify };
}

function targetWith(attr: string, value: string): HTMLElement {
    const el = document.createElement('button');
    el.setAttribute(attr, value);
    return el;
}

describe('dw-mission toggle handlers (#313)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string): string => k, format: (k: string): string => k } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('dwToggleObjective cycles the matched objective pending → complete', async () => {
        const { host, update } = makeHost(makeMission());
        await dwToggleObjective.call(host, new Event('click'), targetWith('data-objective-id', 'o1'));
        expect(update).toHaveBeenCalledWith({
            'system.activeMission.objectives': [expect.objectContaining({ id: 'o1', status: 'complete' })],
        });
    });

    it('dwToggleObjective is a no-op for an unknown objective id', async () => {
        const { host, update } = makeHost(makeMission());
        await dwToggleObjective.call(host, new Event('click'), targetWith('data-objective-id', 'nope'));
        expect(update).not.toHaveBeenCalled();
    });

    it('dwToggleObjective warns and does not persist when no mission is active', async () => {
        const { host, update, notify } = makeHost(null);
        await dwToggleObjective.call(host, new Event('click'), targetWith('data-objective-id', 'o1'));
        expect(notify).toHaveBeenCalledWith('warning', 'WH40K.DW.Mission.None');
        expect(update).not.toHaveBeenCalled();
    });

    it('dwToggleComplication flips the matched complication trigger', async () => {
        const { host, update } = makeHost(makeMission());
        await dwToggleComplication.call(host, new Event('click'), targetWith('data-complication-id', 'c1'));
        expect(update).toHaveBeenCalledWith({
            'system.activeMission.complications': [expect.objectContaining({ id: 'c1', triggered: true })],
        });
    });
});
