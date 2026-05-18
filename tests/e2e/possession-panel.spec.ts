import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Visual + DOM-presence regression spec for #82: the character-sheet
 * Possession panel surfaces `system.possession` when state !== 'none'.
 *
 * Creates a dh2-character with possession.state='latent' and unleashMax=3,
 * opens the sheet, asserts the `.wh40k-possession-panel` element exists
 * (and its counter shows 0/3), then snaps as `possession-panel-latent`.
 *
 * The snapshot lands in `.e2e-screenshots/` for visual review. The DOM
 * assertion guards against regressions that strip the panel via a missing
 * preload, a broken `neq` gate, or a template typo.
 */
test('possession-panel renders when state !== "none" (#82)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) {
            return { setupOk: false, panelPresent: false, counterText: '', error: 'Actor.create unavailable' };
        }

        let actor;
        try {
            actor = await Actor.create({
                name: 'possession-panel-latent-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2e',
                    possession: { state: 'latent', unleashUsed: 0, unleashMax: 3 },
                },
            });
        } catch (err) {
            return { setupOk: false, panelPresent: false, counterText: '', error: String((err as Error)?.message ?? err) };
        }

        if (!actor) {
            return { setupOk: false, panelPresent: false, counterText: '', error: 'Actor.create returned null' };
        }

        await actor.sheet.render(true);
        await new Promise((r) => setTimeout(r, 250));

        // Switch to the status tab — the panel lives there alongside corruption/insanity.
        try {
            actor.sheet.changeTab?.('status', 'primary');
        } catch {
            /* tab name varies by sheet variant; the panel may already be visible on overview */
        }
        await new Promise((r) => setTimeout(r, 200));

        const root = actor.sheet.element as HTMLElement | null;
        const panel = root?.querySelector?.('.wh40k-possession-panel') ?? null;
        const counterEl = root?.querySelector?.('.wh40k-possession-counter') ?? null;
        const counterText = counterEl?.textContent?.replace(/\s+/g, '').trim() ?? '';
        const panelPresent = panel !== null && panel !== undefined;

        return { setupOk: true, panelPresent, counterText, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'possession-panel-latent');

    expect(result.panelPresent, 'expected .wh40k-possession-panel to render when state="latent"').toBe(true);
    expect(result.counterText, `expected counter "0/3"; got "${result.counterText}"`).toContain('0');
    expect(result.counterText, `expected counter to include "3"; got "${result.counterText}"`).toContain('3');

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const a = g.game?.actors?.getName?.('possession-panel-latent-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
