import type { Page } from '@playwright/test';

/**
 * Feed Foundry's dice these d100 faces in order, then restore the RNG once they
 * are drawn. A spec that depends on a roll's outcome pins it this way instead of
 * leaving it to chance (an 01 succeeds even against a target of 0).
 */
export async function fixD100(page: Page, faces: number[]): Promise<void> {
    await page.evaluate((queue) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `CONFIG.Dice` has no browser-side types
        const dice = (globalThis as unknown as { CONFIG: { Dice: { randomUniform: () => number } } }).CONFIG.Dice;
        const original = dice.randomUniform;
        const pending = [...queue];
        dice.randomUniform = (): number => {
            const face = pending.shift();
            if (pending.length === 0) dice.randomUniform = original;
            // Foundry maps a uniform u to the face ceil((1 − u) × faces) (DiceTerm#mapRandomFace).
            return face === undefined ? original() : 1 - (face - 0.5) / 100;
        };
    }, faces);
}
