import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Warband Subtlety panel visual regression (#87).
 *
 * Creates a `dh2-character` with `system.subtlety.value=45`, opens the
 * actor sheet, navigates to the Status tab, snaps the rendered panel,
 * and asserts the current Subtlety value text is in the DOM (a missing
 * value would indicate the partial preload regressed or the DH2 gate
 * misfired).
 */
test('subtlety-panel renders value/max readout for dh2 actors (#87)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) return { setupOk: false, valueText: '', error: 'Actor.create unavailable' };

        let actor;
        try {
            actor = await Actor.create({
                name: 'subtlety-panel-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2e',
                    subtlety: { value: 45, max: 100 },
                },
            });
        } catch (err) {
            return { setupOk: false, valueText: '', error: String((err as Error)?.message ?? err) };
        }
        if (!actor) return { setupOk: false, valueText: '', error: 'Actor.create returned null' };

        await actor.sheet.render(true);
        await new Promise((r) => setTimeout(r, 250));

        // Navigate to the Status tab if the sheet's tab API is reachable.
        try {
            actor.sheet?.changeTab?.('status', 'primary');
            await new Promise((r) => setTimeout(r, 150));
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const valueEl = actor.sheet?.element?.querySelector?.('.wh40k-subtlety-value');
        const valueText = valueEl?.textContent?.trim() ?? '';
        return { setupOk: true, valueText, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'subtlety-panel-render');

    expect(result.valueText, `expected .wh40k-subtlety-value to show '45'; got '${result.valueText}'`).toBe('45');

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const a = g.game?.actors?.getName?.('subtlety-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
