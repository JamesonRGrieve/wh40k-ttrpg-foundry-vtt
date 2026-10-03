import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B — the GM portrait-pool control on the actor sheet (#567).
 *
 * Creates a dh2-npc that carries a portrait pool (default `img` + two variants),
 * renders its sheet as the GM, and asserts the overlaid re-roll / pin icons on the
 * portrait carry their `data-action`s (`rerollPortrait` / `togglePortraitPin`) —
 * i.e. the control that was schema + Document-API only is now visible on a pooled
 * actor. A screenshot of the open sheet is captured as visual proof.
 */

interface ControlProbe {
    rendered: boolean;
    hasReroll: boolean;
    hasPin: boolean;
    variantCount: number;
    error: string | null;
}

test('portrait-pool re-roll / pin control renders on a pooled actor sheet (#567)', async ({ page }) => {
    await joinOrSkip(page);

    const result = await page.evaluate(async (): Promise<ControlProbe> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types available in page.evaluate
        const win = globalThis as unknown as { Actor: { create: (data: object) => Promise<ActorProbe | null> } };
        interface ActorProbe {
            system: { portraits?: { variants?: object[] } };
            sheet?: { render: (force: boolean) => Promise<void>; element: HTMLElement | null };
        }
        const fail = (error: string): ControlProbe => ({ rendered: false, hasReroll: false, hasPin: false, variantCount: 0, error });

        try {
            const actor = await win.Actor.create({
                name: 'probe-pool-npc',
                type: 'dh2-npc',
                img: 'icons/svg/mystery-man.svg',
                system: {
                    gameSystem: 'dh2',
                    portraits: {
                        variants: [
                            { img: 'icons/svg/cowled.svg', tokenFrame: { cx: 0.5, cy: 0.3, zoom: 1 } },
                            { img: 'icons/svg/terror.svg', tokenFrame: { cx: 0.5, cy: 0.3, zoom: 1 } },
                        ],
                        pinned: null,
                    },
                },
            });
            if (actor === null) return fail('Actor.create returned null');
            const sheet = actor.sheet;
            if (sheet === undefined) return fail('actor has no sheet');
            await sheet.render(true);
            // Wait for the portrait-pool controls to render (the assertions report a miss).
            await globalThis.wh40kE2E.pollUntil(() => sheet.element?.querySelector('[data-action="rerollPortrait"]') != null);
            const el = sheet.element;
            if (!(el instanceof HTMLElement)) return fail('sheet did not render');
            const variants = actor.system.portraits?.variants;
            return {
                rendered: true,
                hasReroll: el.querySelector('[data-action="rerollPortrait"]') !== null,
                hasPin: el.querySelector('[data-action="togglePortraitPin"]') !== null,
                variantCount: Array.isArray(variants) ? variants.length : 0,
                error: null,
            };
        } catch (err) {
            return fail(err instanceof Error ? err.message : String(err));
        }
    });

    // Sheet is left open — capture it as visual proof of the control.
    await page.screenshot({ path: 'test-results/portrait-pool-control.png' });

    expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
    expect(result.rendered, 'the NPC sheet should render').toBe(true);
    expect(result.variantCount, 'the actor should carry its authored portrait pool').toBe(2);
    expect(result.hasReroll, 'the re-roll control should render on a pooled actor').toBe(true);
    expect(result.hasPin, 'the pin control should render on a pooled actor').toBe(true);
});
