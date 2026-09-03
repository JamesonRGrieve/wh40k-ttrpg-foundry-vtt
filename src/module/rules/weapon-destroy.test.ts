import { describe, expect, it } from 'vitest';
import { shouldDestroyOnCriticalFail } from './weapon-destroy.ts';

describe('shouldDestroyOnCriticalFail', () => {
    it('destroys a destroyOnCriticalFail weapon on an unmodified 00 (rollTotal 100)', () => {
        expect(shouldDestroyOnCriticalFail({ rollTotal: 100, hasDestroyQuality: true })).toBe(true);
    });

    it('does not destroy on any other roll, even a bad one', () => {
        for (const rollTotal of [1, 50, 91, 96, 99]) {
            expect(shouldDestroyOnCriticalFail({ rollTotal, hasDestroyQuality: true })).toBe(false);
        }
    });

    it('never destroys a weapon without the quality, even on 00', () => {
        expect(shouldDestroyOnCriticalFail({ rollTotal: 100, hasDestroyQuality: false })).toBe(false);
    });
});
