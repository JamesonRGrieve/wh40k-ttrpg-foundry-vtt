import { describe, expect, it, vi } from 'vitest';
import { documentActions, registerDocumentActionHandlers } from './document-actions.ts';

describe('document action slot', () => {
    it('hands back the handlers hooks-manager registered', async () => {
        const handlers = { performWeaponAttack: vi.fn(), performPsychicCast: vi.fn(), sendItemVocalizeChat: vi.fn(async () => Promise.resolve()) };
        registerDocumentActionHandlers(handlers);
        const actor = {};
        const weapon = {};
        documentActions().performWeaponAttack(actor, weapon);
        documentActions().performPsychicCast(actor, weapon);
        await documentActions().sendItemVocalizeChat({ name: 'Lasgun' });
        expect(handlers.performWeaponAttack).toHaveBeenCalledWith(actor, weapon);
        expect(handlers.performPsychicCast).toHaveBeenCalledWith(actor, weapon);
        expect(handlers.sendItemVocalizeChat).toHaveBeenCalledWith({ name: 'Lasgun' });
    });
});
