import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Deathwatch Renown panel (#164).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/dw-renown-panel.hbs` URL, asserts the
 * rank readout matches the threshold from `RENOWN_THRESHOLDS`, the
 * progress bar is populated, and the Award / Loss action buttons
 * render with the correct `data-action` strings. Mirrors the shape
 * of `bc-alignment-advancement.spec.ts`.
 */
test.describe.serial('DwRenownPanel (Tier B)', () => {
    test('renders rank label matching threshold + progress bar + action buttons', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-renown-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let rankReadout = '';
                let rankAttr = '';
                let renownAttr = '';
                let progressPercent = 0;
                let hasProgressBar = false;
                let hasAwardButton = false;
                let hasLossButton = false;

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HbsLib = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string } | undefined;
                    if (typeof HbsLib?.compile !== 'function') {
                        return {
                            rendered,
                            rankReadout,
                            rankAttr,
                            renownAttr,
                            progressPercent,
                            hasProgressBar,
                            hasAwardButton,
                            hasLossButton,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HbsLib.compile(src);
                    // Renown 50 falls in the Distinguished band (40..59 per RAW
                    // TABLE 5-2). Bar fills 50% of the 40-to-60 window.
                    const html = tpl({
                        renownPanel: {
                            value: 50,
                            rank: 'distinguished',
                            rankLabel: 'Distinguished',
                            nextRank: 'famed',
                            nextRankLabel: 'Famed',
                            rankMin: 40,
                            nextRankMin: 60,
                            progressPercent: 50,
                        },
                    });
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via
                    // tailwind.config.js `important: '.wh40k-rpg'`; without an
                    // ancestor with that class every tw-* class is dropped.
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'dw';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '360px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        const rankSpan = host.querySelector('.wh40k-dw-renown-rank');
                        rankReadout = rankSpan?.textContent?.trim() ?? '';
                        rankAttr = rankSpan?.getAttribute('data-rank') ?? '';
                        renownAttr = host.querySelector('section.wh40k-dw-renown-panel')?.getAttribute('data-dw-renown') ?? '';
                        const fill = host.querySelector('.wh40k-dw-renown-progress-fill');
                        hasProgressBar = fill !== null;
                        progressPercent = parseInt(fill?.getAttribute('data-progress') ?? '0', 10);
                        hasAwardButton = host.querySelector('button.wh40k-dw-renown-award-btn[data-action="dwRenownAward"]') !== null;
                        hasLossButton = host.querySelector('button.wh40k-dw-renown-loss-btn[data-action="dwRenownLoss"]') !== null;
                    }

                    // Anchor the rendered DOM so snap() captures live pixels.
                    (globalThis as any).__dwRenownPanelHost = host;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    rankReadout,
                    rankAttr,
                    renownAttr,
                    progressPercent,
                    hasProgressBar,
                    hasAwardButton,
                    hasLossButton,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-renown-panel');

            // Tear down so the host doesn't leak into the next serial test.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwRenownPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwRenownPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            // Renown 50 must resolve to the Distinguished band (RAW TABLE 5-2).
            expect(result.rankAttr, 'rank data attr should be "distinguished"').toBe('distinguished');
            expect(result.rankReadout, 'rank label should be "Distinguished"').toBe('Distinguished');
            expect(result.renownAttr, 'renown value should round-trip onto the section').toBe('50');
            expect(result.hasProgressBar, 'progress bar fill element should render').toBe(true);
            expect(result.progressPercent, 'progress should be 50% within the Distinguished band').toBe(50);
            expect(result.hasAwardButton, 'award button with data-action="dwRenownAward" should render').toBe(true);
            expect(result.hasLossButton, 'loss button with data-action="dwRenownLoss" should render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwRenownPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
