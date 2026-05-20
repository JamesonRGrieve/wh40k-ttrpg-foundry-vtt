import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Alignment / Infamy advancement panel (#173).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-alignment-panel.hbs` URL, asserts the
 * core advance-tally cells render and the psyker-lock + pending-flip
 * affordances surface, then snaps the result. Follows the
 * disorder-roll-dialog.spec.ts shape: the rendered DOM stays anchored
 * to a globalThis handle so snap() captures live pixels, and is torn
 * down after capture so the next test starts clean.
 */
test.describe.serial('BcAlignmentAdvancementPanel (Tier B)', () => {
    test('renders alignment tally + pending-flip + psyker-lock and snaps', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-alignment-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let tallyRows = 0;
                let hasPendingFlip = false;
                let hasPsykerLock = false;
                let hasInfamyButton = false;
                let currentAlignment = '';
                let derivedAlignment = '';

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const Handlebars = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof Handlebars?.compile !== 'function') {
                        return {
                            rendered,
                            tallyRows,
                            hasPendingFlip,
                            hasPsykerLock,
                            hasInfamyButton,
                            currentAlignment,
                            derivedAlignment,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = Handlebars.compile(src);
                    const html = tpl({
                        alignmentPanel: {
                            current: 'khorne',
                            derived: 'tzeentch',
                            tally: { khorne: 9, nurgle: 2, slaanesh: 0, tzeentch: 4 },
                            pendingFlip: true,
                            checkpoint: 20,
                            corruption: 28,
                            nextCheckpoint: 20,
                            recheckDue: true,
                            psykerLocked: true,
                            infamy: 35,
                            infamyCost: 500,
                            infamyCap: 40,
                            infamyIncrement: 5,
                        },
                    });
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via tailwind.config.js
                    // `important: '.wh40k-rpg'`; without an ancestor with that class
                    // every tw-* class is dropped. See CLAUDE.md
                    // "Check the .wh40k-rpg ancestor for ALL tw-* utilities".
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'bc';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '360px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        tallyRows = host.querySelectorAll('.wh40k-bc-tally-row').length;
                        hasPendingFlip = host.querySelector('.wh40k-bc-pending-flip') !== null;
                        hasPsykerLock = host.querySelector('.wh40k-bc-psyker-lock') !== null;
                        hasInfamyButton = host.querySelector('button.wh40k-bc-infamy-buy-btn') !== null;
                        currentAlignment = host.querySelector('.wh40k-bc-current-alignment')?.getAttribute('data-alignment') ?? '';
                        derivedAlignment = host.querySelector('section.wh40k-bc-alignment-panel')?.getAttribute('data-bc-derived-alignment') ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM. Tearing
                    // it down here would leave the screenshot empty.
                    (globalThis as any).__bcAlignmentPanelHost = host;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    tallyRows,
                    hasPendingFlip,
                    hasPsykerLock,
                    hasInfamyButton,
                    currentAlignment,
                    derivedAlignment,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'bc-alignment-advancement-panel');

            // Panel captured; tear it down so it doesn't leak into the next
            // serial test's DOM.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__bcAlignmentPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__bcAlignmentPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.tallyRows, 'expected four per-god tally rows').toBe(4);
            expect(result.hasPendingFlip, 'pending-flip banner should render when current !== derived').toBe(true);
            expect(result.hasPsykerLock, 'psyker-lock warning should render when psykerLocked=true').toBe(true);
            expect(result.hasInfamyButton, 'infamy advance button should render while below cap').toBe(true);
            expect(result.currentAlignment, 'current-alignment data attr should round-trip').toBe('khorne');
            expect(result.derivedAlignment, 'derived-alignment data attr should round-trip').toBe('tzeentch');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'BcAlignmentAdvancementPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
