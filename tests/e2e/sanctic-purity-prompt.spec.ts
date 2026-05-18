import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Sanctic Purity / Emperor's Anathema
 * Fate-spend prompt (#131 — beyond.md L877–937).
 *
 * Builds a `dh2-character` carrying the Emperor's Anathema talent and
 * three Fate, instantiates `SancticPurityPrompt` against that actor,
 * and asserts the rendered DOM exposes the spend + decline actions
 * (the two real handles the Phenomena dispatch path will fire).
 * Captures a screenshot for visual regression via
 * `snap(page, 'sanctic-purity-prompt')`.
 */

test.describe.serial('SancticPurityPrompt (Tier B, #131)', () => {
    test('renders against a dh2 actor with Emperor\'s Anathema + Fate', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const Actor = g.Actor;
                if (!Actor?.create) {
                    return { setupOk: false, rendered: false, hasSpend: false, hasDecline: false, fateText: '', error: 'Actor.create unavailable' };
                }

                let actor;
                try {
                    actor = await Actor.create({
                        name: 'sanctic-purity-probe',
                        type: 'dh2-character',
                        system: {
                            gameSystem: 'dh2e',
                            fate: { value: 3, max: 5 },
                        },
                    });
                } catch (err) {
                    return { setupOk: false, rendered: false, hasSpend: false, hasDecline: false, fateText: '', error: String((err as Error)?.message ?? err) };
                }
                if (!actor) {
                    return { setupOk: false, rendered: false, hasSpend: false, hasDecline: false, fateText: '', error: 'Actor.create returned null' };
                }

                try {
                    if (typeof actor.createEmbeddedDocuments === 'function') {
                        await actor.createEmbeddedDocuments('Item', [
                            { name: "Emperor's Anathema", type: 'talent' },
                        ]);
                    }
                } catch {
                    /* If the talent can't be created (e.g. dh2-talent type variant), the predicate
                       falls through to false; the prompt still renders for the visual snap. */
                }

                let rendered = false;
                let hasSpend = false;
                let hasDecline = false;
                let fateText = '';
                let error: string | null = null;

                try {
                    const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/sanctic-purity-prompt.js';
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (options: { actor: unknown }): {
                            render: (force?: boolean) => Promise<unknown>;
                            element: HTMLElement | null;
                            close: () => Promise<unknown>;
                        };
                    };
                    if (typeof Cls !== 'function') {
                        return { setupOk: true, rendered, hasSpend, hasDecline, fateText, error: 'default export not a constructor' };
                    }
                    const inst = new Cls({ actor });
                    await inst.render(true);
                    await new Promise((r) => setTimeout(r, 80));
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        hasSpend = inst.element.querySelector('[data-action="spend"]') !== null;
                        hasDecline = inst.element.querySelector('[data-action="decline"]') !== null;
                        fateText = inst.element.textContent ?? '';
                    }
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return { setupOk: true, rendered, hasSpend, hasDecline, fateText, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);
            expect(result.error, `prompt probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'prompt did not render').toBe(true);
            expect(result.hasSpend, 'expected [data-action="spend"]').toBe(true);
            expect(result.hasDecline, 'expected [data-action="decline"]').toBe(true);
            // The Fate readout block surfaces "3 / 1" — at minimum the available count.
            expect(result.fateText).toContain('3');

            await snap(page, 'sanctic-purity-prompt');
        } finally {
            page.off('pageerror', listener);

            // Cleanup
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const g = globalThis as any;
                const a = g.game?.actors?.getName?.('sanctic-purity-probe');
                try {
                    await a?.delete?.();
                } catch {
                    /* ignore */
                }
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });
        }
    });
});
