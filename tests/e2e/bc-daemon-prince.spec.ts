import { recordCoverage } from './lib/coverage-tracker';
import { countHooks, expectHooks } from './lib/hooks';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

interface DaemonPrinceProbeResult {
    notAscendedRendered: boolean;
    ascendedRendered: boolean;
    hasAscendButton: boolean;
    ascendButtonDisabled: boolean;
    hasThresholdReadout: boolean;
    hasOutcome: boolean;
    ascendedHasButton: boolean;
    ascendButtonClicked: boolean;
    error: string | null;
}

/**
 * Tier B coverage of the BC apotheosis panel (#182 — BC Core p267).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-daemon-prince-panel.hbs` URL, asserts
 * the not-yet-claimed state surfaces the Resolve button + requirement
 * readout + projected fate, then re-renders the claimed state to verify
 * the outcome text (and no button), and snaps both. The rendered DOM
 * stays anchored to a globalThis handle so snap() captures live pixels,
 * and is torn down after capture.
 */
test.describe.serial('BcDaemonPrincePanel (Tier B)', () => {
    test('renders claimed + not-claimed states, drives the resolve button, and snaps', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async (): Promise<DaemonPrinceProbeResult> => {
            interface DaemonPrincePanelContext {
                daemonPrincePanel: {
                    ascended: boolean;
                    ascendedAt: number | null;
                    alignmentAtAscension: string;
                    infamy: number;
                    corruption: number;
                    infamyThreshold: number;
                    corruptionThreshold: number;
                    canAscend: boolean;
                    isDaemonPrince: boolean;
                };
            }
            interface FoundryProbeGlobal {
                fetch: (u: string) => Promise<Response>;
                Handlebars: { compile: (s: string) => (ctx: DaemonPrincePanelContext) => string };
                __bcDaemonPrincePanelHost?: HTMLElement;
                __bcDaemonPrincePanelHostAscended?: HTMLElement;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals are runtime-only, no shipped types
            const g = globalThis as unknown as FoundryProbeGlobal;
            const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-daemon-prince-panel.hbs';
            const out: DaemonPrinceProbeResult = {
                notAscendedRendered: false,
                ascendedRendered: false,
                hasAscendButton: false,
                ascendButtonDisabled: true,
                hasThresholdReadout: false,
                hasOutcome: false,
                ascendedHasButton: true,
                ascendButtonClicked: false,
                error: null,
            };

            const mountHost = (html: string, side: 'left' | 'right'): HTMLElement => {
                const host = document.createElement('div');
                host.className = 'wh40k-rpg';
                host.dataset['wh40kSystem'] = 'bc';
                host.style.position = 'fixed';
                host.style.top = '40px';
                host.style[side] = '40px';
                host.style.width = '360px';
                host.style.zIndex = '99999';
                host.innerHTML = html;
                document.body.appendChild(host);
                return host;
            };

            try {
                const src = await (await g.fetch(templateUrl)).text();
                const HandlebarsLib = g.Handlebars;
                if (typeof HandlebarsLib.compile !== 'function') return { ...out, error: 'Handlebars not available on globalThis' };
                const tpl = HandlebarsLib.compile(src);

                // ---- Not yet claimed: Corruption reached 100 → button enabled ----
                const host = mountHost(
                    tpl({
                        daemonPrincePanel: {
                            ascended: false,
                            ascendedAt: null,
                            alignmentAtAscension: 'unaligned',
                            infamy: 100,
                            corruption: 100,
                            infamyThreshold: 100,
                            corruptionThreshold: 100,
                            canAscend: true,
                            isDaemonPrince: true,
                        },
                    }),
                    'right',
                );
                out.notAscendedRendered = host.firstElementChild instanceof HTMLElement;
                const ascendBtn = host.querySelector('button[data-wh40k-hook="bc-dp-ascend-btn"]');
                out.hasAscendButton = ascendBtn !== null;
                out.ascendButtonDisabled = ascendBtn instanceof HTMLButtonElement ? ascendBtn.disabled : true;
                out.hasThresholdReadout = host.querySelector('[data-wh40k-hook="bc-dp-thresholds"]') !== null;

                // The action handler is not bound outside a live sheet, so only
                // assert the click does not throw.
                if (ascendBtn instanceof HTMLButtonElement && !ascendBtn.disabled) {
                    ascendBtn.click();
                    out.ascendButtonClicked = true;
                }
                g.__bcDaemonPrincePanelHost = host;

                // ---- Claimed: Chaos Spawn outcome, no button ----
                const ascendedHost = mountHost(
                    tpl({
                        daemonPrincePanel: {
                            ascended: true,
                            ascendedAt: 7,
                            alignmentAtAscension: 'tzeentch',
                            infamy: 60,
                            corruption: 100,
                            infamyThreshold: 100,
                            corruptionThreshold: 100,
                            canAscend: false,
                            isDaemonPrince: false,
                        },
                    }),
                    'left',
                );
                out.ascendedRendered = ascendedHost.firstElementChild instanceof HTMLElement;
                out.hasOutcome = ascendedHost.querySelector('[data-wh40k-hook="bc-dp-outcome"]') !== null;
                out.ascendedHasButton = ascendedHost.querySelector('[data-wh40k-hook="bc-dp-ascend-btn"]') !== null;
                g.__bcDaemonPrincePanelHostAscended = ascendedHost;
            } catch (err) {
                out.error = err instanceof Error ? err.message : String(err);
            }
            return out;
        });

        const hookCounts = await countHooks(page);

        await snap(page, 'bc-daemon-prince-panel');

        // Panels captured; tear them down so they don't leak into the
        // next serial test's DOM.
        await page.evaluate(() => {
            interface PanelHostGlobal {
                __bcDaemonPrincePanelHost?: HTMLElement;
                __bcDaemonPrincePanelHostAscended?: HTMLElement;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals are runtime-only, no shipped types
            const g = globalThis as unknown as PanelHostGlobal;
            g.__bcDaemonPrincePanelHost?.remove();
            g.__bcDaemonPrincePanelHostAscended?.remove();
            g.__bcDaemonPrincePanelHost = undefined;
            g.__bcDaemonPrincePanelHostAscended = undefined;
        });

        expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.notAscendedRendered, 'not-claimed panel should render').toBe(true);
        expect(result.ascendedRendered, 'claimed panel should render').toBe(true);
        expectHooks(hookCounts, ['bc-dp-outcome', 'bc-dp-thresholds', 'bc-dp-ascend-btn']);
        expect(result.hasAscendButton, 'resolve button should render before the claim').toBe(true);
        expect(result.ascendButtonDisabled, 'resolve button should be enabled at 100 Corruption').toBe(false);
        expect(result.hasThresholdReadout, 'requirement readout should render before the claim').toBe(true);
        expect(result.hasOutcome, 'outcome text should render once claimed').toBe(true);
        expect(result.ascendedHasButton, 'no resolve button once claimed').toBe(false);
        expect(result.ascendButtonClicked, 'resolve button should be clickable').toBe(true);

        recordCoverage('panel.render', 'BcDaemonPrincePanel');
    });
});
