import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Visual regression spec for #63: the character-sheet Fate panel surfaces
 * `system.fate.threshold` as a "Burn Threshold" line when the value is > 0.
 *
 * Creates two probe actors — one with threshold=0 (line hidden) and one
 * with threshold=2 (line visible) — and snaps each. The PNGs land in
 * `.e2e-screenshots/` for visual review.
 *
 * The spec also asserts the DOM-level presence of the
 * `wh40k-fate-threshold` class so a CSS or template regression that
 * removes the line surfaces as a test failure, not just a visual diff.
 */
test('fate.threshold displays in fate-panel header when > 0 (#63)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) return { setupOk: false, withThresholdOk: false, withoutThresholdOk: false, error: 'Actor.create unavailable' };

        let withThreshold;
        let withoutThreshold;
        try {
            withThreshold = await Actor.create({
                name: 'fate-threshold-visible-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e', fate: { max: 5, value: 3, threshold: 2 } },
            });
            withoutThreshold = await Actor.create({
                name: 'fate-threshold-hidden-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e', fate: { max: 5, value: 3, threshold: 0 } },
            });
        } catch (err) {
            return { setupOk: false, withThresholdOk: false, withoutThresholdOk: false, error: String((err as Error)?.message ?? err) };
        }

        if (!withThreshold || !withoutThreshold) {
            return { setupOk: false, withThresholdOk: false, withoutThresholdOk: false, error: 'Actor.create returned null' };
        }

        await withThreshold.sheet.render(true);
        await new Promise((r) => setTimeout(r, 200));
        const visibleEl = withThreshold.sheet.element?.querySelector?.('.wh40k-fate-threshold');
        const visibleText = visibleEl?.textContent?.trim() ?? '';
        const withThresholdOk = visibleEl !== null && visibleEl !== undefined && /2/.test(visibleText);

        await withoutThreshold.sheet.render(true);
        await new Promise((r) => setTimeout(r, 200));
        const hiddenEl = withoutThreshold.sheet.element?.querySelector?.('.wh40k-fate-threshold');
        const withoutThresholdOk = hiddenEl === null || hiddenEl === undefined;

        return { setupOk: true, withThresholdOk, withoutThresholdOk, visibleText, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    // Snap the visible-threshold sheet first (re-render so screenshot matches).
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const actor = g.game?.actors?.getName?.('fate-threshold-visible-probe');
        if (actor?.sheet) {
            await actor.sheet.render(true);
            await new Promise((r) => setTimeout(r, 200));
        }
    });
    await snap(page, 'fate-panel-with-threshold');

    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const actor = g.game?.actors?.getName?.('fate-threshold-hidden-probe');
        if (actor?.sheet) {
            await actor.sheet.render(true);
            await new Promise((r) => setTimeout(r, 200));
        }
    });
    await snap(page, 'fate-panel-without-threshold');

    expect(result.withThresholdOk, `expected .wh40k-fate-threshold to render with "2"; got text="${(result as any).visibleText ?? ''}"`).toBe(true);
    expect(result.withoutThresholdOk, 'expected .wh40k-fate-threshold to be absent when threshold=0').toBe(true);

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const game = g.game;
        const a = game?.actors?.getName?.('fate-threshold-visible-probe');
        const b = game?.actors?.getName?.('fate-threshold-hidden-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
        try {
            await b?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
