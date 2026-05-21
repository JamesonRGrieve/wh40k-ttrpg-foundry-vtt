import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the DW Kill-team Cohesion panel (#162 —
 * core.md §"COHESION", p.9351).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/dw-cohesion-panel.hbs` URL, asserts the
 * pool readout, the three data-action buttons, and the disabled-rally
 * state surface, then snaps the result. Mirrors the
 * bc-alignment-advancement.spec.ts panel-render pattern.
 */
test.describe.serial('DwCohesionPanel (Tier B)', () => {
    test('renders pool + rally/recover/challenge buttons and snaps', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-cohesion-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let readout = '';
                let hasRallyButton = false;
                let hasRecoverButton = false;
                let hasChallengeButton = false;
                let rallyDisabled = false;
                let recoverDisabled = false;
                let currentAttr = '';
                let maxAttr = '';

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HandlebarsLib = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof HandlebarsLib.compile !== 'function') {
                        return {
                            rendered,
                            readout,
                            hasRallyButton,
                            hasRecoverButton,
                            hasChallengeButton,
                            rallyDisabled,
                            recoverDisabled,
                            currentAttr,
                            maxAttr,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsLib.compile(src);
                    // Mid-fight state: pool partially depleted, already rallied
                    // this turn (rally button disabled), recovery still
                    // available (current < max).
                    const html = tpl({
                        cohesionPanel: {
                            current: 3,
                            max: 6,
                            lostThisTurn: 1,
                            rallied: true,
                            canRally: false,
                            canRecover: true,
                        },
                    });
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via
                    // tailwind.config.js `important: '.wh40k-rpg'`; without an
                    // ancestor with that class every tw-* class is dropped.
                    // See CLAUDE.md "Check the .wh40k-rpg ancestor".
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
                        const section = host.querySelector('section.wh40k-dw-cohesion-panel');
                        const readoutEl = host.querySelector('.wh40k-dw-cohesion-readout');
                        readout = (readoutEl?.textContent ?? '').trim().replace(/\s+/g, ' ');
                        const rallyBtn = host.querySelector<HTMLButtonElement>('button[data-action="dwCohesionRally"]');
                        const recoverBtn = host.querySelector<HTMLButtonElement>('button[data-action="dwCohesionRecoverObjective"]');
                        const challengeBtn = host.querySelector<HTMLButtonElement>('button[data-action="dwCohesionChallenge"]');
                        hasRallyButton = rallyBtn !== null;
                        hasRecoverButton = recoverBtn !== null;
                        hasChallengeButton = challengeBtn !== null;
                        rallyDisabled = rallyBtn?.disabled === true;
                        recoverDisabled = recoverBtn?.disabled === true;
                        currentAttr = section?.getAttribute('data-dw-cohesion-current') ?? '';
                        maxAttr = section?.getAttribute('data-dw-cohesion-max') ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM.
                    (globalThis as any).__dwCohesionPanelHost = host;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    readout,
                    hasRallyButton,
                    hasRecoverButton,
                    hasChallengeButton,
                    rallyDisabled,
                    recoverDisabled,
                    currentAttr,
                    maxAttr,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-cohesion-panel');

            // Tear down so the next serial test starts clean.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwCohesionPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwCohesionPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.readout, 'pool readout should be "3 / 6"').toBe('3 / 6');
            expect(result.hasRallyButton, 'rally button should render').toBe(true);
            expect(result.hasRecoverButton, 'recover-objective button should render').toBe(true);
            expect(result.hasChallengeButton, 'cohesion-challenge button should render').toBe(true);
            expect(result.rallyDisabled, 'rally button should be disabled when already rallied').toBe(true);
            expect(result.recoverDisabled, 'recover button should be enabled when current < max').toBe(false);
            expect(result.currentAttr, 'current data attr should round-trip').toBe('3');
            expect(result.maxAttr, 'max data attr should round-trip').toBe('6');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwCohesionPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
