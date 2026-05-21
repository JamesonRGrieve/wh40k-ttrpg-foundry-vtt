import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Possession Panel visual regression (#82 / #132 — beyond.md p.67-69,
 * L2095-2116).
 *
 * Creates a `dh2-character` with `system.possession.state='latent'`
 * (the contested state), opens the actor sheet, navigates to the Status
 * tab, snaps the rendered panel WITH THE SHEET STILL OPEN, and asserts
 * the panel + the two #132 Frenzy-test-loop action buttons
 * (possessionFrenzyTest / possessionMismanifest) are in the DOM (missing
 * buttons would indicate the partial preload regressed, the `latent`
 * gate misfired, or the template typo'd).
 */
test('possession-panel renders Frenzy-loop actions when state=latent (#132)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) return { setupOk: false, btnCount: 0, hasTitle: false, error: 'Actor.create unavailable' };

        let actor;
        try {
            actor = await ActorCls.create({
                name: 'possession-panel-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2e',
                    possession: { state: 'latent', unleashUsed: 0, unleashMax: 3 },
                },
            });
        } catch (err) {
            return { setupOk: false, btnCount: 0, hasTitle: false, error: err instanceof Error ? err.message : String(err) };
        }
        if (actor == null) return { setupOk: false, btnCount: 0, hasTitle: false, error: 'Actor.create returned null' };

        await actor.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        try {
            actor.sheet?.changeTab?.('status', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* fall back to whatever tab is open */
        }

        const root = actor.sheet?.element;
        const panel = root?.querySelector?.('.wh40k-possession-panel');
        const btnCount = panel != null ? panel.querySelectorAll('.wh40k-possession-frenzy-btn, .wh40k-possession-mismanifest-btn').length : 0;
        const hasTitle = Boolean(panel?.querySelector?.('h3'));
        return { setupOk: true, btnCount, hasTitle, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'possession-panel');

    try {
        const appLoc = page.locator('.application[data-application-part]').last();
        if ((await appLoc.count()) > 0) {
            await appLoc.screenshot({ path: '.e2e-screenshots/possession-panel__sheet-element.png' });
        }
    } catch {
        /* non-fatal — primary snap already wrote a PNG */
    }

    expect(result.btnCount, `expected 2 Frenzy-loop action buttons; got ${result.btnCount}`).toBe(2);
    expect(result.hasTitle, 'expected possession panel header (h3) to be in the DOM').toBe(true);

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const a = g.game?.actors?.getName?.('possession-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
