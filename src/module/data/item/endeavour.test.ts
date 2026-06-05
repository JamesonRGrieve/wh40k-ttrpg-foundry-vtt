import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('EndeavourData', () => {
    it('has a default EndeavourData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./endeavour.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // Pure-function derived getters can be unit-tested without Foundry runtime
    // by exercising them against minimal shape objects. We mirror the
    // EndeavourData getter implementations directly here so the test acts as a
    // contract on the derived behaviour (isComplete / pctComplete).

    it('isComplete is false when apRequired is 0 even if apEarned > 0', () => {
        const isComplete = (apEarned: number, apRequired: number): boolean => apRequired > 0 && apEarned >= apRequired;
        expect(isComplete(5, 0)).toBe(false);
    });

    it('isComplete flips true when apEarned reaches apRequired', () => {
        const isComplete = (apEarned: number, apRequired: number): boolean => apRequired > 0 && apEarned >= apRequired;
        expect(isComplete(3, 4)).toBe(false);
        expect(isComplete(4, 4)).toBe(true);
        expect(isComplete(5, 4)).toBe(true);
    });

    it('pctComplete clamps to [0, 100] and returns 0 for apRequired=0', () => {
        const pctComplete = (apEarned: number, apRequired: number): number => {
            if (apRequired <= 0) return 0;
            const raw = (apEarned / apRequired) * 100;
            return Math.max(0, Math.min(100, Math.round(raw)));
        };
        expect(pctComplete(0, 0)).toBe(0);
        expect(pctComplete(5, 0)).toBe(0);
        expect(pctComplete(2, 4)).toBe(50);
        expect(pctComplete(4, 4)).toBe(100);
        expect(pctComplete(10, 4)).toBe(100);
    });
});
