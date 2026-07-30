import { joinOrSkip } from './lib/join';
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
    await joinOrSkip(page, 'no Gamemaster user available in this test world');

    interface ProbeResult {
        setupOk: boolean;
        btnCount: number;
        hasTitle: boolean;
        error: string | null;
    }
    const result = await page.evaluate(async (): Promise<ProbeResult> => {
        interface ActorSheet {
            render: (force?: boolean) => Promise<void>;
            changeTab?: (tab: string, group: string) => void;
            element?: HTMLElement | null;
        }
        interface ActorDoc {
            sheet: ActorSheet;
        }
        interface ActorCtorShape {
            create?: (data: object) => Promise<ActorDoc | null>;
        }
        interface ProbeGlobal {
            Actor?: ActorCtorShape;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
        const g = globalThis as unknown as ProbeGlobal;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) return { setupOk: false, btnCount: 0, hasTitle: false, error: 'Actor.create unavailable' };

        let actor: ActorDoc | null;
        try {
            actor = await ActorCls.create({
                name: 'grapple-panel-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2' },
                flags: { wh40k: { grapple: { state: 'grappling' } } },
            });
        } catch (createErr) {
            return { setupOk: false, btnCount: 0, hasTitle: false, error: String((createErr as Error).message) };
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
        const panel = root?.querySelector('[data-wh40k-hook="grapple-panel"]') ?? null;
        const btnCount =
            panel !== null
                ? panel.querySelectorAll(
                      '[data-wh40k-hook="grapple-damage-btn"], [data-wh40k-hook="grapple-throw-btn"], [data-wh40k-hook="grapple-break-btn"], [data-wh40k-hook="grapple-stand-btn"], [data-wh40k-hook="grapple-move-btn"]',
                  ).length
                : 0;
        const hasTitle = Boolean(panel?.querySelector('h3'));
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
    await page.evaluate(async (): Promise<void> => {
        interface ActorDoc {
            delete?: () => Promise<void>;
        }
        interface ActorsCollection {
            getName?: (name: string) => ActorDoc | undefined;
        }
        interface CleanupGlobal {
            game?: { actors?: ActorsCollection };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
        const g = globalThis as unknown as CleanupGlobal;
        const a = g.game?.actors?.getName?.('grapple-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
