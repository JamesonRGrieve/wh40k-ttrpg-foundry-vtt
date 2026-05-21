import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the DW Vehicle Crit / Repair panel (#170 —
 * rites.md §"DAMAGING VEHICLES", §"REPAIRING VEHICLES").
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/dw-vehicle-panel.hbs` URL, asserts the
 * Integrity + over-Integrity readouts and both action buttons render,
 * then snaps the result. Follows the bc-alignment-advancement.spec.ts
 * shape — the rendered DOM stays anchored to a globalThis handle so
 * snap() captures live pixels, and is torn down after capture so the
 * next test starts clean.
 */
test.describe.serial('DwVehicleCritPanel (Tier B)', () => {
    test('renders integrity + over-integrity readouts + both action buttons and snaps', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-vehicle-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasIntegrityRow = false;
                let hasOverRow = false;
                let hasCritButton = false;
                let hasRepairButton = false;
                let critButtonEnabled = false;
                let repairButtonEnabled = false;
                let integrityValue = '';
                let overValue = '';

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HandlebarsGlobal = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof HandlebarsGlobal.compile !== 'function') {
                        return {
                            rendered,
                            hasIntegrityRow,
                            hasOverRow,
                            hasCritButton,
                            hasRepairButton,
                            critButtonEnabled,
                            repairButtonEnabled,
                            integrityValue,
                            overValue,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsGlobal.compile(src);
                    const html = tpl({
                        vehiclePanel: {
                            integrity: 12,
                            overIntegrity: 4,
                            canRollCrit: true,
                            canRepair: true,
                        },
                    });
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via tailwind.config.js
                    // `important: '.wh40k-rpg'`; without an ancestor with that class
                    // every tw-* class is dropped. See CLAUDE.md
                    // "Check the .wh40k-rpg ancestor for ALL tw-* utilities".
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
                        hasIntegrityRow = host.querySelector('.wh40k-dw-vehicle-integrity-row') !== null;
                        hasOverRow = host.querySelector('.wh40k-dw-vehicle-over-row') !== null;
                        const critBtn = host.querySelector('button.wh40k-dw-vehicle-crit-btn');
                        const repairBtn = host.querySelector('button.wh40k-dw-vehicle-repair-btn');
                        hasCritButton = critBtn !== null;
                        hasRepairButton = repairBtn !== null;
                        critButtonEnabled = critBtn instanceof HTMLButtonElement && !critBtn.disabled;
                        repairButtonEnabled = repairBtn instanceof HTMLButtonElement && !repairBtn.disabled;
                        integrityValue = host.querySelector('.wh40k-dw-vehicle-integrity-value')?.textContent?.trim() ?? '';
                        overValue = host.querySelector('.wh40k-dw-vehicle-over-value')?.textContent?.trim() ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM.
                    (globalThis as any).__dwVehiclePanelHost = host;
                } catch (err) {
                    error = String((err as Error).message);
                }

                return {
                    rendered,
                    hasIntegrityRow,
                    hasOverRow,
                    hasCritButton,
                    hasRepairButton,
                    critButtonEnabled,
                    repairButtonEnabled,
                    integrityValue,
                    overValue,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-vehicle-crit-panel');

            // Panel captured; tear it down so it doesn't leak into the next
            // serial test's DOM.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwVehiclePanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwVehiclePanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.hasIntegrityRow, 'integrity row should render').toBe(true);
            expect(result.hasOverRow, 'over-integrity row should render').toBe(true);
            expect(result.hasCritButton, 'roll-crit button should render').toBe(true);
            expect(result.hasRepairButton, 'repair button should render').toBe(true);
            expect(result.critButtonEnabled, 'roll-crit button should be enabled when canRollCrit=true').toBe(true);
            expect(result.repairButtonEnabled, 'repair button should be enabled when canRepair=true').toBe(true);
            expect(result.integrityValue, 'integrity value should round-trip').toBe('12');
            expect(result.overValue, 'over-integrity value should round-trip').toBe('+4');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwVehicleCritPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
