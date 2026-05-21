import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Grapple Controller Panel visual regression (#120 — core.md L10155-10180).
 *
 * Creates a `dh2-character` with `flags.wh40k.grapple.state='grappling'`,
 * opens the actor sheet, navigates to the Status tab, snaps the rendered
 * panel, and asserts the five action buttons are in the DOM (missing
 * buttons would indicate the partial preload regressed or the gate
 * misfired).
 */
test('grapple-controller-panel renders five actions when state=grappling (#120)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) return { setupOk: false, btnCount: 0, hasTitle: false, error: 'Actor.create unavailable' };

        let actor;
        try {
            actor = await Actor.create({
                name: 'grapple-panel-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e' },
                flags: { wh40k: { grapple: { state: 'grappling' } } },
            });
        } catch (createErr) {
            return { setupOk: false, btnCount: 0, hasTitle: false, error: String((createErr as Error).message) };
        }
        if (!actor) return { setupOk: false, btnCount: 0, hasTitle: false, error: 'Actor.create returned null' };

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
        const panel = root?.querySelector?.('.wh40k-grapple-panel');
        const btnCount = panel
            ? panel.querySelectorAll(
                  '.wh40k-grapple-damage-btn, .wh40k-grapple-throw-btn, .wh40k-grapple-break-btn, .wh40k-grapple-stand-btn, .wh40k-grapple-move-btn',
              ).length
            : 0;
        const hasTitle = Boolean(panel?.querySelector?.('h3'));
        return { setupOk: true, btnCount, hasTitle, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'grapple-controller-panel');

    try {
        const appLoc = page.locator('.application[data-application-part]').last();
        if ((await appLoc.count()) > 0) {
            await appLoc.screenshot({ path: '.e2e-screenshots/grapple-controller-panel__sheet-element.png' });
        }
    } catch {
        /* non-fatal — primary snap already wrote a PNG */
    }

    expect(result.btnCount, `expected 5 grapple action buttons; got ${result.btnCount}`).toBe(5);
    expect(result.hasTitle, 'expected grapple panel header (h3) to be in the DOM').toBe(true);

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const a = g.game?.actors?.getName?.('grapple-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
