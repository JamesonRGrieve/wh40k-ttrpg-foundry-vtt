import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: the In-Universe Time widget stays below sheet windows (#639).
 *
 * The widget is an ApplicationV2 window docked top-left; Foundry raised it to
 * the front on every render and click, so it covered sheets opened near the
 * top-left and caught the clicks meant for them. A sheet is placed over the
 * widget; the widget is then re-rendered (as every clock advance does) and
 * clicked, and the sheet must still be on top and receive the click.
 */

const NAME = 'e2e-639-hud';
const WIDGET_ID = 'wh40k-world-time-widget';

interface ProbeActor {
    sheet: { id: string; render: (o: { force: boolean }) => Promise<void>; setPosition: (p: object) => void };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: { actors: { getName: (n: string) => ProbeActor | undefined }; time: { advance: (s: number) => Promise<number> } };
    foundry: { applications: { instances: Map<string, { render: (o: { force: boolean }) => Promise<void> }> } };
}

test.describe.serial('HUD widgets stay below windows (Tier B, #639)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.delete();
        }, NAME);
    });

    test('a sheet over the In-Universe Time widget stays on top and gets the click', async ({ page }) => {
        await joinOrSkip(page);
        const widget = page.locator(`#${WIDGET_ID}`);
        await expect(widget).toBeVisible();

        const sheetId = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
            const actor = await w.Actor.create({ name, type: 'dh2-character', system: { gameSystem: 'dh2' } });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            // Drag-equivalent: put the sheet's left half over the widget.
            actor.sheet.setPosition({ left: 200, top: 60 });
            return actor.sheet.id;
        }, NAME);

        // The widget re-renders on every clock advance, and the GM clicks it.
        await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.time.advance(60);
            await w.foundry.applications.instances.get(id)?.render({ force: true });
        }, WIDGET_ID);
        await widget.locator('.window-header').click({ position: { x: 20, y: 10 } });

        const layers = await page.evaluate(
            ({ widgetId, appId }) => {
                const z = (id: string): number => Number(getComputedStyle(document.getElementById(id) ?? document.body).zIndex);
                const box = document.getElementById(widgetId)?.getBoundingClientRect();
                const sheet = document.getElementById(appId)?.getBoundingClientRect();
                // A point inside both rectangles.
                const x = Math.max(box?.left ?? 0, sheet?.left ?? 0) + 20;
                const y = Math.max(box?.top ?? 0, sheet?.top ?? 0) + 80;
                const hit = document.elementFromPoint(x, y);
                return { widget: z(widgetId), sheet: z(appId), hitInSheet: hit?.closest(`#${appId}`) !== null };
            },
            { widgetId: WIDGET_ID, appId: sheetId },
        );
        expect(layers.widget).toBeLessThan(layers.sheet);
        expect(layers.hitInSheet, 'the overlap belongs to the sheet').toBe(true);
        await snap(page, 'hud-world-time-under-sheet', { clip: { x: 0, y: 0, width: 900, height: 560 } });
        recordCoverage('hud.layer', 'WorldTimeWidget');
    });
});
