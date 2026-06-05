import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postChatCard } from '../rolls/roll-helpers.ts';
import type { NotifyFn } from './action-host.ts';
import { type DwVehicleActionHost, dwVehicleRepair, dwVehicleRollCrit } from './dw-vehicle-actions.ts';

/**
 * Behavior coverage for the Deathwatch vehicle action handlers (#313 / #170).
 * Both post a chat card via the shared postActionChat path; the pure
 * rollVehicleCrit rule runs for real. Chat + i18n are stubbed, and the
 * render context is captured to pin `skipRoll` (rolled crit vs reminder card).
 */

vi.mock('../rolls/roll-helpers.ts', () => ({ postChatCard: vi.fn() }));

const renderTemplateMock = vi.fn<(template: string, ctx: { skipRoll?: boolean; gameSystem?: string }) => Promise<string>>();

function makeHost(overIntegrity = 4): { host: DwVehicleActionHost; update: ReturnType<typeof vi.fn>; notify: ReturnType<typeof vi.fn> } {
    const update = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn<NotifyFn>();
    const host: DwVehicleActionHost = {
        actor: { id: 'v1', name: 'Land Raider', system: { vehicleIntegrity: 30, overIntegrity }, update },
        _notify: notify,
    };
    return { host, update, notify };
}

const evt = (): Event => new Event('click');
const tgt = (): HTMLElement => document.createElement('button');

describe('dw-vehicle action handlers (#313)', () => {
    beforeEach(() => {
        renderTemplateMock.mockResolvedValue('<div></div>');
        vi.stubGlobal('game', { i18n: { localize: (k: string): string => k, format: (k: string): string => k } });
        vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: renderTemplateMock } } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('dwVehicleRollCrit posts a rolled crit card (skipRoll false)', async () => {
        const { host, notify } = makeHost(4);
        await dwVehicleRollCrit.call(host, evt(), tgt());
        expect(vi.mocked(postChatCard)).toHaveBeenCalledTimes(1);
        expect(renderTemplateMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skipRoll: false, gameSystem: 'dw' }));
        expect(notify).not.toHaveBeenCalled();
    });

    it('dwVehicleRepair posts a reminder card (skipRoll true)', async () => {
        const { host } = makeHost(2);
        await dwVehicleRepair.call(host, evt(), tgt());
        expect(vi.mocked(postChatCard)).toHaveBeenCalledTimes(1);
        expect(renderTemplateMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skipRoll: true }));
    });
});
