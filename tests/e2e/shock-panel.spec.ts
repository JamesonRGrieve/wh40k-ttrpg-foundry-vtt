import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Minimal browser-side shapes for the untyped Foundry V14 globals used in
 * this probe. Foundry ships no types into the Playwright `page.evaluate`
 * surface, so these stand in for that framework boundary.
 */
interface FoundrySheet {
    render: (force: boolean) => Promise<void>;
    changeTab?: (tab: string, group: string) => void;
    element?: { querySelector?: (selector: string) => Element | null };
}
interface FoundryProbeActor {
    sheet: FoundrySheet;
    delete?: () => Promise<void>;
}
interface FoundryGlobal {
    Actor: { create?: (data: object) => Promise<FoundryProbeActor | null> };
    game?: { actors?: { getName?: (name: string) => FoundryProbeActor | undefined } };
}

interface ShockResult {
    setupOk: boolean;
    valueText: string;
    hasButton: boolean;
    error: string | null;
}

/**
 * Shock panel visual regression (#66).
 *
 * Creates a `dh2-character` with `system.shock.value=3`, opens the actor
 * sheet, navigates to the Status tab, snaps the rendered panel, and
 * asserts the current Shock value text is in the DOM (a missing value
 * would indicate the partial preload regressed or the DH2 gate misfired).
 *
 * Captures a sheet-element screenshot via `page.locator('.application').screenshot(...)`
 * AS WELL AS the standard `snap(page, label)` so the panel is visible
 * on its own in the artifact directory.
 */
test('shock-panel renders value/Snap-Out for dh2 actors (#66)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async (): Promise<ShockResult> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.Actor surface
        const ActorGbl = (globalThis as unknown as FoundryGlobal).Actor;
        if (ActorGbl.create == null) return { setupOk: false, valueText: '', hasButton: false, error: 'Actor.create unavailable' };

        let actor: FoundryProbeActor | null;
        try {
            actor = await ActorGbl.create({
                name: 'shock-panel-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2',
                    shock: { value: 3, max: 10 },
                },
            });
        } catch (err) {
            return { setupOk: false, valueText: '', hasButton: false, error: err instanceof Error ? err.message : String(err) };
        }
        if (actor == null) return { setupOk: false, valueText: '', hasButton: false, error: 'Actor.create returned null' };

        await actor.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        try {
            actor.sheet.changeTab?.('status', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const valueEl = actor.sheet.element?.querySelector?.('.wh40k-shock-value');
        const valueText = valueEl?.textContent.trim() ?? '';
        const hasButton = Boolean(actor.sheet.element?.querySelector?.('.wh40k-shock-snap-btn'));
        return { setupOk: true, valueText, hasButton, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    // Standard library snap — captures the active application element.
    await snap(page, 'shock-panel-render');

    // Sheet-element capture — guarantees the panel is on-screen in the PNG
    // even if the application-detection cascade in screenshot.ts changes.
    try {
        const appLoc = page.locator('.application[data-application-part]').last();
        if ((await appLoc.count()) > 0) {
            await appLoc.screenshot({ path: '.e2e-screenshots/shock-panel-render__sheet-element.png' });
        }
    } catch {
        /* non-fatal — primary snap already wrote a PNG */
    }

    expect(result.valueText, `expected .wh40k-shock-value to show '3'; got '${result.valueText}'`).toBe('3');
    expect(result.hasButton, 'expected .wh40k-shock-snap-btn to be in the panel DOM').toBe(true);

    // Cleanup
    await page.evaluate(async (): Promise<void> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.game surface
        const gameGlobal = (globalThis as unknown as FoundryGlobal).game;
        const a = gameGlobal?.actors?.getName?.('shock-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
