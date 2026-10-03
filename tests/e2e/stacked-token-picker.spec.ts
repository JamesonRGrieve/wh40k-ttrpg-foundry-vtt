import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B — the stacked-token bust palette (#569).
 *
 * The pure geometry/ordering is unit-tested in stacked-token-picker.test.ts;
 * this verifies the canvas shell on a live scene: two tokens are placed at the
 * SAME spot (a stack), the `hoverToken` hook is fired, and the spec asserts the
 * bust palette appears with one entry per stacked token, then clicks a bust and
 * confirms that token becomes the controlled one. A screenshot of the open
 * palette is captured.
 */

interface SetupProbe {
    palettePresent: boolean;
    bustCount: number;
    tokenIds: string[];
    error: string | null;
}
interface SelectProbe {
    controlledId: string | null;
    clickedId: string | null;
    paletteDismissed: boolean;
    error: string | null;
}

async function setupStack(page: Page): Promise<SetupProbe> {
    return page.evaluate(async (): Promise<SetupProbe> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types in page.evaluate
        const g = globalThis as unknown as {
            Actor: { create: (d: object) => Promise<{ id: string; getTokenDocument: (d: object) => Promise<{ toObject: () => object }> }> };
            Scene: {
                create: (
                    d: object,
                ) => Promise<{ id: string; view: () => Promise<void>; createEmbeddedDocuments: (t: string, d: object[]) => Promise<Array<{ id: string }>> }>;
            };
            game: { paused: boolean; togglePause: (v: boolean) => void };
            canvas: { tokens?: { placeables: Array<{ id: string }> } };
            Hooks: { callAll: (hook: string, token: object, hovered: boolean) => void };
        };
        const fail = (error: string): SetupProbe => ({ palettePresent: false, bustCount: 0, tokenIds: [], error });
        try {
            const actor = await g.Actor.create({ name: 'stack probe', type: 'dh2-npc', img: 'icons/svg/mystery-man.svg' });
            const scene = await g.Scene.create({ name: 'stacked-picker probe', width: 1000, height: 1000 });
            const td = await actor.getTokenDocument({ x: 400, y: 400 });
            // Two tokens at the SAME position → a fully overlapping stack.
            await scene.createEmbeddedDocuments('Token', [td.toObject(), td.toObject()]);
            await scene.view();
            // Wait for the canvas to draw both stacked tokens (the check below reports a miss).
            await globalThis.wh40kE2E.pollUntil(() => (g.canvas.tokens?.placeables.length ?? 0) >= 2, globalThis.wh40kE2E.scaledMs(20_000));
            if (g.game.paused) g.game.togglePause(false);

            const placeables = g.canvas.tokens?.placeables ?? [];
            if (placeables.length < 2) return fail(`expected 2 placed tokens, got ${placeables.length}`);
            // Fire the hover hook the picker listens on, as Foundry does on real hover.
            g.Hooks.callAll('hoverToken', placeables[0], true);
            // Wait for the picker palette to open (the assertions report a miss).
            await globalThis.wh40kE2E.pollUntil(() => document.getElementById('wh40k-stacked-token-picker') !== null);

            const palette = document.getElementById('wh40k-stacked-token-picker');
            const busts = palette?.querySelectorAll('button[data-token-id]') ?? [];
            return {
                palettePresent: palette !== null,
                bustCount: busts.length,
                tokenIds: Array.from(busts).map((b) => b.getAttribute('data-token-id') ?? ''),
                error: null,
            };
        } catch (err) {
            return fail(err instanceof Error ? err.message : String(err));
        }
    });
}

async function clickBust(page: Page): Promise<SelectProbe> {
    return page.evaluate((): SelectProbe => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types in page.evaluate
        const g = globalThis as unknown as { canvas: { tokens?: { controlled: Array<{ id: string }> } } };
        try {
            const palette = document.getElementById('wh40k-stacked-token-picker');
            const bust = palette?.querySelector<HTMLButtonElement>('button[data-token-id]') ?? null;
            if (bust === null) return { controlledId: null, clickedId: null, paletteDismissed: false, error: 'no bust to click' };
            const clickedId = bust.getAttribute('data-token-id');
            bust.click();
            const controlled = g.canvas.tokens?.controlled ?? [];
            return {
                controlledId: controlled[0]?.id ?? null,
                clickedId,
                paletteDismissed: document.getElementById('wh40k-stacked-token-picker') === null,
                error: null,
            };
        } catch (err) {
            return { controlledId: null, clickedId: null, paletteDismissed: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
}

test('a stack of two tokens pops a two-bust palette, and clicking a bust selects that token (#569)', async ({ page }) => {
    await joinOrSkip(page);

    const setup = await setupStack(page);
    await page.screenshot({ path: 'test-results/stacked-token-picker.png' });

    expect(setup.error, `setup error: ${setup.error ?? ''}`).toBeNull();
    expect(setup.palettePresent, 'the bust palette should appear over a 2-token stack').toBe(true);
    expect(setup.bustCount, 'the palette should show one bust per stacked token').toBe(2);

    const select = await clickBust(page);
    expect(select.error, `select error: ${select.error ?? ''}`).toBeNull();
    expect(select.controlledId, 'clicking a bust should select that exact token').toBe(select.clickedId);
    expect(select.paletteDismissed, 'the palette dismisses on selection').toBe(true);
});
