import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postChatCard } from '../rolls/roll-helpers.ts';
import type { NotifyFn } from './action-host.ts';
import { type DwOathActionHost, dwReleaseOath } from './dw-oath-actions.ts';

/**
 * Behavior coverage for the Deathwatch oath release handler (#313 / #168). The
 * swear path is interactive (fromUuid + DialogV2 prompt) and left for a later
 * harness; the release path is pure: clear the pointer + post a card when an
 * oath is active, otherwise an info toast.
 */

vi.mock('../rolls/roll-helpers.ts', () => ({ postChatCard: vi.fn() }));

function makeHost(activeOathId: string | null): { host: DwOathActionHost; update: ReturnType<typeof vi.fn>; notify: ReturnType<typeof vi.fn> } {
    const update = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn<NotifyFn>();
    const host: DwOathActionHost = {
        actor: { id: 'bb1', name: 'Brother-Sergeant', system: { activeOathId, isLeader: true }, update },
        _notify: notify,
    };
    return { host, update, notify };
}

const evt = (): Event => new Event('click');
const tgt = (): HTMLElement => document.createElement('button');

describe('dwReleaseOath (#313)', () => {
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

    it('clears the active oath pointer and posts a release card', async () => {
        const { host, update } = makeHost('Compendium.wh40k-rpg.dw-oaths.Item.abc123');
        await dwReleaseOath.call(host, evt(), tgt());
        expect(update).toHaveBeenCalledWith({ 'system.activeOathId': null });
        expect(vi.mocked(postChatCard)).toHaveBeenCalledTimes(1);
    });

    it('short-circuits with an info toast (no update/chat) when no oath is active', async () => {
        const { host, update, notify } = makeHost(null);
        await dwReleaseOath.call(host, evt(), tgt());
        expect(notify).toHaveBeenCalledWith('info', 'WH40K.DW.Oath.Released');
        expect(update).not.toHaveBeenCalled();
        expect(vi.mocked(postChatCard)).not.toHaveBeenCalled();
    });
});
