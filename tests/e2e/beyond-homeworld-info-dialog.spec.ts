import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Beyond Homeworld Info Dialog (GitHub #140).
 *
 * Instantiates the dialog via its deployed module URL, asserts that
 * each of the three home-world cards (Daemon World, Penal Colony,
 * Quarantine World) renders, and snaps the result.
 */

test.describe.serial('BeyondHomeworldInfoDialog (Tier B)', () => {
    test('renders all three home-world cards and snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/beyond-homeworld-info-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let cardCount = 0;
                let hasDaemonWorld = false;
                let hasPenalColony = false;
                let hasQuarantineWorld = false;
                let hasCorruptionRider = false;
                let hasSubtletyClampRider = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            cardCount,
                            hasDaemonWorld,
                            hasPenalColony,
                            hasQuarantineWorld,
                            hasCorruptionRider,
                            hasSubtletyClampRider,
                            error: 'default export not a constructor',
                        };
                    }
                    const inst = new Cls({});
                    try {
                        await inst.render({ force: true });
                        await new Promise<void>((r) => {
                            setTimeout(r, 80);
                        });
                    } catch (err) {
                        error = err instanceof Error ? err.message : String(err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const el = inst.element;
                        cardCount = el.querySelectorAll('[data-homeworld-id]').length;
                        hasDaemonWorld = el.querySelector('[data-homeworld-id="daemonWorld"]') !== null;
                        hasPenalColony = el.querySelector('[data-homeworld-id="penalColony"]') !== null;
                        hasQuarantineWorld = el.querySelector('[data-homeworld-id="quarantineWorld"]') !== null;
                        hasCorruptionRider = el.querySelector('[data-homeworld-id="daemonWorld"] [data-rider="corruption"]') !== null;
                        hasSubtletyClampRider = el.querySelector('[data-homeworld-id="quarantineWorld"] [data-rider="subtlety-clamp"]') !== null;
                    }
                    try {
                        await inst.close();
                    } catch {
                        /* ignore */
                    }
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    cardCount,
                    hasDaemonWorld,
                    hasPenalColony,
                    hasQuarantineWorld,
                    hasCorruptionRider,
                    hasSubtletyClampRider,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'beyond-homeworld-info-dialog');

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.cardCount, 'expected three home-world cards').toBe(3);
            expect(result.hasDaemonWorld, 'Daemon World card should render').toBe(true);
            expect(result.hasPenalColony, 'Penal Colony card should render').toBe(true);
            expect(result.hasQuarantineWorld, 'Quarantine World card should render').toBe(true);
            expect(result.hasCorruptionRider, 'Daemon World should surface the Corruption rider').toBe(true);
            expect(result.hasSubtletyClampRider, 'Quarantine World should surface the subtlety-clamp rider').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'BeyondHomeworldInfoDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
