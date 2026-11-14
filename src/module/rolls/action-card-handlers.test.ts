import { describe, expect, it, vi } from 'vitest';

/**
 * The handler slot ActionData posts its cards through (#714). Loaded fresh per
 * test so each starts with an empty slot.
 */
describe('action card handlers (#714)', () => {
    it('throws before the action manager registers, when no card can post anyway', async () => {
        vi.resetModules();
        const { actionCardHandlers } = await import('./action-card-handlers.ts');
        expect(() => actionCardHandlers()).toThrow(/before the action manager loaded/);
    });

    it('hands back what was registered', async () => {
        vi.resetModules();
        const { actionCardHandlers, registerActionCardHandlers } = await import('./action-card-handlers.ts');
        const handlers = { storeActionData: vi.fn(), postDamageCard: vi.fn(async () => Promise.resolve()) };
        registerActionCardHandlers(handlers);
        expect(actionCardHandlers()).toBe(handlers);
    });
});
