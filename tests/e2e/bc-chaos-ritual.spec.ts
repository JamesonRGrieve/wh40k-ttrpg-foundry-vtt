import { recordCoverage } from './lib/coverage-tracker';
import { countHooks, expectHooks } from './lib/hooks';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Chaos Ritual panel (#179).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-ritual-panel.hbs` URL, asserts the
 * Daemonic Mastery input + Perform Ritual button render, then snaps the
 * result. Mirrors the bc-psychic-strength.spec.ts shape: the rendered
 * DOM stays anchored to a globalThis handle so snap() captures live
 * pixels, and is torn down after capture so the next test starts clean.
 */
test.describe.serial('BcChaosRitualPanel (Tier B)', () => {
    test('renders Daemonic Mastery readout + Perform Ritual button and snaps', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-ritual-panel.hbs';
            let error: string | null = null;
            let rendered = false;
            let hasMasteryInput = false;
            let hasPerformButton = false;
            let masteryAttr = '';
            let masteryValue = '';

            try {
                interface HandlebarsCompile {
                    compile: (s: string) => (ctx: object) => string;
                }
                interface BcRitualGlobals {
                    fetch?: (u: string) => Promise<Response>;
                    Handlebars?: HandlebarsCompile;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const fg = globalThis as unknown as BcRitualGlobals;
                const fetchFn = fg.fetch;
                if (typeof fetchFn !== 'function') {
                    return {
                        rendered,
                        hasMasteryInput,
                        hasPerformButton,
                        masteryAttr,
                        masteryValue,
                        error: 'fetch not available on globalThis',
                    };
                }
                const src = await (await fetchFn(templateUrl)).text();
                const HBS = fg.Handlebars;
                if (HBS === undefined || typeof HBS.compile !== 'function') {
                    return {
                        rendered,
                        hasMasteryInput,
                        hasPerformButton,
                        masteryAttr,
                        masteryValue,
                        error: 'Handlebars not available on globalThis',
                    };
                }
                const tpl = HBS.compile(src);
                const html = tpl({ ritualPanel: { ritualMastery: 5 } });
                // A .wh40k-rpg host (Tailwind is scoped to it) painted with the sheet window surface.
                const host = globalThis.wh40kE2E.panelHost({ html, system: 'bc', width: 360 });
                rendered = host.firstElementChild instanceof HTMLElement;

                if (rendered) {
                    hasMasteryInput = host.querySelector('input[data-wh40k-hook="bc-ritual-mastery-input"]') !== null;
                    hasPerformButton = host.querySelector('button[data-wh40k-hook="bc-ritual-perform-btn"][data-action="bcPerformRitual"]') !== null;
                    masteryAttr = host.querySelector('section.wh40k-bc-ritual-panel')?.getAttribute('data-bc-ritual-mastery') ?? '';
                    masteryValue = host.querySelector<HTMLInputElement>('input[data-wh40k-hook="bc-ritual-mastery-input"]')?.value ?? '';
                }

                interface BcRitualHostGlobal {
                    __bcRitualPanelHost?: HTMLElement | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm host on globalThis for cross-eval cleanup
                (globalThis as unknown as BcRitualHostGlobal).__bcRitualPanelHost = host;
            } catch (err) {
                error = err instanceof Error ? err.message : String(err);
            }

            return {
                rendered,
                hasMasteryInput,
                hasPerformButton,
                masteryAttr,
                masteryValue,
                error,
            };
        });

        const hookCounts = await countHooks(page);

        await snap(page, 'bc-chaos-ritual-panel');

        await page.evaluate(() => {
            interface BcRitualHostGlobal {
                __bcRitualPanelHost?: HTMLElement | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: reading browser-realm host stashed on globalThis
            const fg = globalThis as unknown as BcRitualHostGlobal;
            const host = fg.__bcRitualPanelHost;
            try {
                host?.remove();
            } catch {
                /* ignore */
            }
            fg.__bcRitualPanelHost = undefined;
        });

        expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'panel did not render').toBe(true);
        expectHooks(hookCounts, ['bc-ritual-perform-btn', 'bc-ritual-mastery-input']);
        expect(result.hasMasteryInput, 'Daemonic Mastery input should render').toBe(true);
        expect(result.hasPerformButton, 'Perform Ritual button should render').toBe(true);
        expect(result.masteryAttr, 'mastery data attribute should round-trip').toBe('5');
        expect(result.masteryValue, 'mastery input value should round-trip').toBe('5');

        recordCoverage('panel.render', 'BcChaosRitualPanel');
    });

    test('Perform Ritual opens the dialog with every Kind select showing its whole label', async ({ page }) => {
        await joinOrSkip(page);
        const name = 'e2e-bc-ritual-dialog';
        const sheetId = await page.evaluate(async (actorName) => {
            interface DialogProbe {
                Actor: { create: (d: object) => Promise<{ sheet: { id: string; render: (o: { force: boolean }) => Promise<void> } } | null> };
                game: { actors: { getName: (n: string) => { delete: () => Promise<void> } | undefined } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as DialogProbe;
            await w.game.actors.getName(actorName)?.delete();
            const actor = await w.Actor.create({ name: actorName, type: 'bc-character', system: { gameSystem: 'bc', ritualMastery: 2 } });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            return actor.sheet.id;
        }, name);
        try {
            await page.locator(`#${sheetId} section.wh40k-bc-ritual-panel [data-action="bcPerformRitual"]`).click();
            const dialog = page.locator('dialog.application[open]', { has: page.locator('[data-wh40k-hook="bc-ritual-dialog"]') });
            await expect(dialog).toBeVisible();
            await dialog.locator('select[name="mod-kind-0"]').selectOption('component-reagent');
            await dialog.locator('select[name="mod-kind-1"]').selectOption('sanctified-ground');
            // No select clips its chosen label: the select is at least as wide as the label it shows.
            const clipped = await dialog.locator('select[name^="mod-kind-"]').evaluateAll((selects) =>
                (selects as HTMLSelectElement[])
                    .filter((s) => {
                        const probe = document.createElement('span');
                        probe.style.font = getComputedStyle(s).font;
                        probe.style.position = 'absolute';
                        probe.style.visibility = 'hidden';
                        probe.textContent = s.selectedOptions.item(0)?.textContent ?? '';
                        document.body.appendChild(probe);
                        const textWidth = probe.getBoundingClientRect().width;
                        probe.remove();
                        return s.clientWidth < textWidth + 16;
                    })
                    .map((s) => s.name),
            );
            expect(clipped).toEqual([]);
            // #634: the first field is labelled "Ritual" (not "Ritual Template ID"), and no row label wraps.
            await expect(dialog.locator('label', { has: page.locator('[name="templateId"]') })).toContainText('Ritual');
            await expect(dialog.locator('label', { has: page.locator('[name="templateId"]') })).not.toContainText('Template');
            const wrapped = await dialog.locator('[data-mod-row] label').evaluateAll((labels) =>
                labels
                    .filter((labelEl) => {
                        const style = getComputedStyle(labelEl);
                        const lineHeight = Number.isNaN(parseFloat(style.lineHeight)) ? parseFloat(style.fontSize) * 1.2 : parseFloat(style.lineHeight);
                        return labelEl.getBoundingClientRect().height > lineHeight * 1.5;
                    })
                    .map((labelEl) => labelEl.textContent.trim()),
            );
            expect(wrapped, 'row labels on two lines').toEqual([]);
            const dialogId = (await dialog.getAttribute('id')) ?? '';
            await snap(page, 'bc-ritual-dialog-kind-selects', { selector: `#${dialogId}` });
            await dialog.locator('button[data-action="close"], button[data-action="cancel"]').first().click();
        } finally {
            await page.evaluate(async (actorName) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as { game: { actors: { getName: (n: string) => { delete: () => Promise<void> } | undefined } } };
                await w.game.actors.getName(actorName)?.delete();
            }, name);
        }
        recordCoverage('dialog.render', 'BcChaosRitualDialog');
    });
});
