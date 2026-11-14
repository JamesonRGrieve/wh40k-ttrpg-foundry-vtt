import { afterEach, describe, expect, it, vi } from 'vitest';
import { hooksOn, onWorldSettingChange } from './hooks-on.ts';

interface RecordedRegistration {
    event: string;
    fn: (user: { id?: string }) => string | undefined;
    self: HooksStub;
}

interface HooksStub {
    on: (this: HooksStub, event: string, fn: RecordedRegistration['fn']) => number;
}

describe('hooksOn', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('registers the handler on Foundry Hooks by name and returns the hook id', () => {
        const calls: RecordedRegistration[] = [];
        const stub: HooksStub = {
            on(event, fn) {
                calls.push({ event, fn, self: this });
                return 42;
            },
        };
        vi.stubGlobal('Hooks', stub);
        const handler = (user: { id?: string }): string | undefined => user.id;

        expect(hooksOn('targetToken', handler)).toBe(42);
        expect(calls).toEqual([{ event: 'targetToken', fn: handler, self: stub }]);
    });
});

describe('onWorldSettingChange', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** Register through a recording Hooks stub, and fire one hook by name. */
    function withHooks(): { fire: (event: string, setting: { key?: string }) => void } {
        const handlers = new Map<string, Array<(setting: { key?: string }) => void>>();
        vi.stubGlobal('Hooks', {
            on: (event: string, fn: (setting: { key?: string }) => void) => {
                handlers.set(event, [...(handlers.get(event) ?? []), fn]);
                return handlers.size;
            },
        });
        return {
            fire: (event, setting) => {
                for (const fn of handlers.get(event) ?? []) fn(setting);
            },
        };
    }

    it("fires on a watched setting's first write, which creates its document, and on every later write", () => {
        const hooks = withHooks();
        const callback = vi.fn<() => void>();
        onWorldSettingChange(new Set(['wh40k-rpg.world-time-last-advance']), callback);
        hooks.fire('createSetting', { key: 'wh40k-rpg.world-time-last-advance' });
        hooks.fire('updateSetting', { key: 'wh40k-rpg.world-time-last-advance' });
        expect(callback).toHaveBeenCalledTimes(2);
    });

    it('ignores every other setting', () => {
        const hooks = withHooks();
        const callback = vi.fn<() => void>();
        onWorldSettingChange(new Set(['wh40k-rpg.world-time-last-advance']), callback);
        hooks.fire('createSetting', { key: 'core.time' });
        hooks.fire('updateSetting', {});
        expect(callback).not.toHaveBeenCalled();
    });
});
