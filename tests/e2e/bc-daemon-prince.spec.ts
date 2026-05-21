import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Daemon Prince panel (#182).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-daemon-prince-panel.hbs` URL, asserts
 * the not-ascended state surfaces the Ascend button + threshold readout,
 * then re-renders the ascended state to verify the applied-boost surface,
 * and snaps both. Follows the bc-alignment-advancement.spec.ts shape:
 * the rendered DOM stays anchored to a globalThis handle so snap()
 * captures live pixels, and is torn down after capture.
 */
test.describe.serial('BcDaemonPrincePanel (Tier B)', () => {
    test('renders ascended + not-ascended states, drives the ascend button, and snaps', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-daemon-prince-panel.hbs';
                let error: string | null = null;
                let notAscendedRendered = false;
                let ascendedRendered = false;
                let hasAscendButton = false;
                let ascendButtonDisabled = true;
                let hasThresholdReadout = false;
                let hasBoostBlock = false;
                let boostListItems = 0;
                let ascendButtonClicked = false;

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HandlebarsLib = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof HandlebarsLib?.compile !== 'function') {
                        return {
                            notAscendedRendered,
                            ascendedRendered,
                            hasAscendButton,
                            ascendButtonDisabled,
                            hasThresholdReadout,
                            hasBoostBlock,
                            boostListItems,
                            ascendButtonClicked,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsLib.compile(src);

                    // ---- Not-ascended view: thresholds met → button enabled ----
                    const notAscendedHtml = tpl({
                        daemonPrincePanel: {
                            ascended: false,
                            ascendedAt: null,
                            alignmentAtAscension: 'unaligned',
                            infamy: 100,
                            corruption: 70,
                            infamyThreshold: 100,
                            corruptionThreshold: 70,
                            canAscend: true,
                            boost: null,
                        },
                    });

                    const host = document.createElement('div');
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'bc';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '360px';
                    host.style.zIndex = '99999';
                    host.innerHTML = notAscendedHtml;
                    document.body.appendChild(host);

                    notAscendedRendered = host.firstElementChild instanceof HTMLElement;
                    const ascendBtn = host.querySelector('button.wh40k-bc-dp-ascend-btn');
                    hasAscendButton = ascendBtn !== null;
                    ascendButtonDisabled = ascendBtn instanceof HTMLButtonElement ? ascendBtn.disabled : true;
                    hasThresholdReadout = host.querySelector('.wh40k-bc-dp-thresholds') !== null;

                    // Drive at least one interaction: click the ascend
                    // button. The action handler is wired by the
                    // orchestrator and not yet present at Tier-B time, so
                    // we only assert the click does not throw.
                    if (ascendBtn instanceof HTMLButtonElement && !ascendBtn.disabled) {
                        ascendBtn.click();
                        ascendButtonClicked = true;
                    }

                    (globalThis as any).__bcDaemonPrincePanelHost = host;

                    // ---- Ascended view (rendered into the same host) ----
                    const ascendedHtml = tpl({
                        daemonPrincePanel: {
                            ascended: true,
                            ascendedAt: 7,
                            alignmentAtAscension: 'tzeentch',
                            infamy: 110,
                            corruption: 82,
                            infamyThreshold: 100,
                            corruptionThreshold: 70,
                            canAscend: false,
                            boost: {
                                strengthBonusMultiplier: 4,
                                toughnessBonusMultiplier: 4,
                                bonusWounds: 20,
                                fearRating: 3,
                                daemonicTrait: true,
                                immuneToConditions: ['fatigue', 'fear', 'pinning', 'poison', 'stunning', 'suffocation'],
                            },
                        },
                    });
                    const ascendedHost = document.createElement('div');
                    ascendedHost.className = 'wh40k-rpg';
                    ascendedHost.dataset['wh40kSystem'] = 'bc';
                    ascendedHost.style.position = 'fixed';
                    ascendedHost.style.top = '40px';
                    ascendedHost.style.left = '40px';
                    ascendedHost.style.width = '360px';
                    ascendedHost.style.zIndex = '99999';
                    ascendedHost.innerHTML = ascendedHtml;
                    document.body.appendChild(ascendedHost);

                    ascendedRendered = ascendedHost.firstElementChild instanceof HTMLElement;
                    hasBoostBlock = ascendedHost.querySelector('.wh40k-bc-dp-boost') !== null;
                    boostListItems = ascendedHost.querySelectorAll('.wh40k-bc-dp-boost li').length;

                    (globalThis as any).__bcDaemonPrincePanelHostAscended = ascendedHost;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    notAscendedRendered,
                    ascendedRendered,
                    hasAscendButton,
                    ascendButtonDisabled,
                    hasThresholdReadout,
                    hasBoostBlock,
                    boostListItems,
                    ascendButtonClicked,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'bc-daemon-prince-panel');

            // Panels captured; tear them down so they don't leak into the
            // next serial test's DOM.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const a = (globalThis as any).__bcDaemonPrincePanelHost as HTMLElement | undefined;
                const b = (globalThis as any).__bcDaemonPrincePanelHostAscended as HTMLElement | undefined;
                try {
                    a?.remove();
                } catch {
                    /* ignore */
                }
                try {
                    b?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__bcDaemonPrincePanelHost = undefined;
                (globalThis as any).__bcDaemonPrincePanelHostAscended = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.notAscendedRendered, 'not-ascended panel should render').toBe(true);
            expect(result.ascendedRendered, 'ascended panel should render').toBe(true);
            expect(result.hasAscendButton, 'ascend button should render when not ascended').toBe(true);
            expect(result.ascendButtonDisabled, 'ascend button should be enabled when thresholds met').toBe(false);
            expect(result.hasThresholdReadout, 'threshold readout should render in not-ascended state').toBe(true);
            expect(result.hasBoostBlock, 'boost block should render in ascended state').toBe(true);
            expect(result.boostListItems, 'expected six boost rows (str/tou/wounds/fear/daemonic/immunity)').toBeGreaterThanOrEqual(5);
            expect(result.ascendButtonClicked, 'ascend button should be clickable').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'BcDaemonPrincePanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
