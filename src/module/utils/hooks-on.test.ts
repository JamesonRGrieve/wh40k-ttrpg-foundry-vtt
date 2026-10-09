import { afterEach, describe, expect, it, vi } from 'vitest';
import { hooksOn } from './hooks-on.ts';

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
