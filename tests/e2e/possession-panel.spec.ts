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
        interface ActorSheet {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 sheet.render returns Promise<this> with no shipped types
            render: (force: boolean) => Promise<unknown>;
            changeTab?: (tab: string, group: string) => void;
            element?: HTMLElement | null;
        }
        interface ActorInstance {
            sheet: ActorSheet;
        }
        interface FoundryGlobal {
            Actor?: { create?: (data: object) => Promise<ActorInstance | null> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
        const g = globalThis as unknown as FoundryGlobal;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) return { setupOk: false, btnCount: 0, hasTitle: false, error: 'Actor.create unavailable' };

        let actor: ActorInstance | null;
        try {
            actor = await ActorCls.create({
                name: 'possession-panel-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2',
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
            actor.sheet.changeTab?.('overview', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* fall back to whatever tab is open */
        }

        const root = actor.sheet.element;
        const panel = root?.querySelector('.wh40k-possession-panel');
        const btnCount =
            panel !== null && panel !== undefined ? panel.querySelectorAll('.wh40k-possession-frenzy-btn, .wh40k-possession-mismanifest-btn').length : 0;
        const hasTitle = panel?.querySelector('h3') != null;
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
        interface ActorHandle {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.delete returns Promise<this> with no shipped types
            delete?: () => Promise<unknown>;
        }
        interface CleanupGlobal {
            game?: { actors?: { getName?: (name: string) => ActorHandle | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
        const g = globalThis as unknown as CleanupGlobal;
        const a = g.game?.actors?.getName?.('possession-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
