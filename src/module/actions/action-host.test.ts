import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { isActorOfSystem, postActionChat, reportFailure } from './action-host.ts';

vi.mock('../rolls/roll-helpers.ts', () => ({ postChatCard: vi.fn() }));

describe('isActorOfSystem (#313)', () => {
    it('prefers the sheet _resolveGameSystemId() when present', () => {
        const host = { actor: { system: {} }, _resolveGameSystemId: (): string => 'ow' };
        expect(isActorOfSystem(host, 'ow')).toBe(true);
        expect(isActorOfSystem(host, 'bc')).toBe(false);
    });

    it('falls back to actor.system.gameSystem when no resolver is bound', () => {
        const host = { actor: { system: { gameSystem: 'bc' } } };
        expect(isActorOfSystem(host, 'bc')).toBe(true);
        expect(isActorOfSystem(host, 'ow')).toBe(false);
    });

    it('returns false when neither source identifies the system', () => {
        expect(isActorOfSystem({ actor: { system: {} } }, 'dh2')).toBe(false);
    });

    it('uses the resolver even when system.gameSystem disagrees', () => {
        const host = { actor: { system: { gameSystem: 'bc' } }, _resolveGameSystemId: (): string => 'ow' };
        expect(isActorOfSystem(host, 'ow')).toBe(true);
        expect(isActorOfSystem(host, 'bc')).toBe(false);
    });
});

describe('reportFailure (#313)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('notifies a 5s error toast with "<label>: <message>" and logs the raw error', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const notify = vi.fn();
        const err = new Error('boom');
        reportFailure({ _notify: notify }, 'Swear Oath', err);
        expect(notify).toHaveBeenCalledWith('error', 'Swear Oath: boom', { duration: 5000 });
        expect(consoleError).toHaveBeenCalledWith('Swear Oath error:', err);
    });

    it('stringifies a non-Error throwable', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const notify = vi.fn();
        reportFailure({ _notify: notify }, 'Repair', 'cable severed');
        expect(notify).toHaveBeenCalledWith('error', 'Repair: cable severed', { duration: 5000 });
    });
});

describe('postActionChat (#313)', () => {
    const renderTemplateMock = vi.fn<(template: string, ctx: object) => Promise<string>>();

    beforeEach(() => {
        renderTemplateMock.mockResolvedValue('<div>card</div>');
        vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: renderTemplateMock } } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('renders the template with the context, then posts a card spoken by the host actor', async () => {
        const ctx = { gameSystem: 'dw', headerKey: 'WH40K.DW.Oath.Header' };
        await postActionChat('systems/wh40k-rpg/templates/chat/dw-oath-chat.hbs', ctx, { actor: { name: 'Brother Test' } });

        expect(renderTemplateMock).toHaveBeenCalledWith('systems/wh40k-rpg/templates/chat/dw-oath-chat.hbs', ctx);
        expect(vi.mocked(postChatCard)).toHaveBeenCalledWith('<div>card</div>', { speaker: { alias: 'Brother Test' } });
    });
});
