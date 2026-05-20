import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Dark Pact tracker panel visual regression (#84).
 *
 * Creates a `dh2-character` with two entries in `system.pacts` (one
 * discovered with disposition +2 and lapsed payment, one undiscovered with
 * disposition -1 and current payment), opens the actor sheet, and snaps
 * the rendered status tab.
 *
 * Asserts the panel renders at least one `.wh40k-dark-pact-row` so a
 * template / preload regression that drops the panel surfaces as a test
 * failure rather than a silent visual diff.
 */
test('dark-pact-panel renders rows for actors with active pacts (#84)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) return { setupOk: false, rowCount: 0, error: 'Actor.create unavailable' };

        let actor;
        try {
            actor = await Actor.create({
                name: 'dark-pact-panel-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2e',
                    pacts: [
                        {
                            pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfHungerForKnowledge',
                            discovered: true,
                            disposition: 2,
                            paymentCurrent: false,
                        },
                        {
                            pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfBlackSilence',
                            discovered: false,
                            disposition: -1,
                            paymentCurrent: true,
                        },
                    ],
                },
            });
        } catch (err) {
            return { setupOk: false, rowCount: 0, error: String((err as Error)?.message ?? err) };
        }
        if (!actor) return { setupOk: false, rowCount: 0, error: 'Actor.create returned null' };

        await actor.sheet.render(true);
        await new Promise((r) => setTimeout(r, 250));

        // Navigate to the Status tab if the sheet's tab API is reachable.
        try {
            actor.sheet?.changeTab?.('status', 'primary');
            await new Promise((r) => setTimeout(r, 150));
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const rows = actor.sheet?.element?.querySelectorAll?.('.wh40k-dark-pact-row');
        const rowCount = rows?.length ?? 0;
        return { setupOk: true, rowCount, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'dark-pact-panel-with-pacts');

    expect(result.rowCount, `expected at least one .wh40k-dark-pact-row; got ${result.rowCount}`).toBeGreaterThanOrEqual(2);

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const a = g.game?.actors?.getName?.('dark-pact-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
