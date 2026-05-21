import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the DW Mission Oath panel (#168 — core.md Table
 * 7-16 §"OATHS", p.10165).
 *
 * Renders the Handlebars partial directly into the deployed Foundry
 * world via the `templates/actor/panel/dw-oath-panel.hbs` URL,
 * asserts the readout, the two data-action buttons, and the gated
 * disabled state surface, then snaps the result. Mirrors the
 * dw-cohesion.spec.ts panel-render pattern; running the Tier B
 * harness against a real actor would require the dw-oaths compendium
 * pack to land, which is out of scope for this round (#168 ships the
 * engine + UI + integration manifest; content is a follow-up).
 */
test.describe.serial('DwOathPanel (Tier B)', () => {
    test('renders Oath readout + swear/release buttons with leader-no-oath state and snaps', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-oath-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasSwearButton = false;
                let hasReleaseButton = false;
                let swearDisabled = false;
                let releaseDisabled = false;
                let activeAttr = '';
                let idAttr = '';
                let readout = '';

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HandlebarsInstance = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof HandlebarsInstance.compile !== 'function') {
                        return {
                            rendered,
                            hasSwearButton,
                            hasReleaseButton,
                            swearDisabled,
                            releaseDisabled,
                            activeAttr,
                            idAttr,
                            readout,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsInstance.compile(src);
                    // Leader, no Oath sworn — swear available, release disabled.
                    const html = tpl({
                        oathPanel: {
                            isLeader: true,
                            active: false,
                            activeOathId: null,
                            activeLabel: null,
                            canSwear: true,
                            canRelease: false,
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
                        const section = host.querySelector('section.wh40k-dw-oath-panel');
                        const swearBtn = host.querySelector<HTMLButtonElement>('button[data-action="dwSwearOath"]');
                        const releaseBtn = host.querySelector<HTMLButtonElement>('button[data-action="dwReleaseOath"]');
                        const readoutEl = host.querySelector('.wh40k-dw-oath-current');
                        hasSwearButton = swearBtn !== null;
                        hasReleaseButton = releaseBtn !== null;
                        swearDisabled = swearBtn?.disabled === true;
                        releaseDisabled = releaseBtn?.disabled === true;
                        activeAttr = section?.getAttribute('data-dw-oath-active') ?? '';
                        idAttr = section?.getAttribute('data-dw-oath-id') ?? '';
                        readout = readoutEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM.
                    (globalThis as any).__dwOathPanelHost = host;
                } catch (err) {
                    error = String((err as Error).message);
                }

                return {
                    rendered,
                    hasSwearButton,
                    hasReleaseButton,
                    swearDisabled,
                    releaseDisabled,
                    activeAttr,
                    idAttr,
                    readout,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-oath-panel');

            // Tear down so the next serial test starts clean.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwOathPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwOathPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.hasSwearButton, 'swear button should render').toBe(true);
            expect(result.hasReleaseButton, 'release button should render').toBe(true);
            expect(result.swearDisabled, 'swear button should be enabled (leader, no active oath)').toBe(false);
            expect(result.releaseDisabled, 'release button should be disabled (no active oath)').toBe(true);
            expect(result.activeAttr, 'data-dw-oath-active should be "false"').toBe('false');
            expect(result.idAttr, 'data-dw-oath-id should be empty when no Oath sworn').toBe('');
            expect(result.readout, 'readout should show an em-dash placeholder when no Oath sworn').toContain('—');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwOathPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
