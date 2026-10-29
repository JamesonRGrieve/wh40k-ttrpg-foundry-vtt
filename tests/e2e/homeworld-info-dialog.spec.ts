import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the home-world GM reference dialog.
 *
 * Opens the dialog for DH2 through its deployed module and asserts it reads the
 * line's home-world packs by their flags: one group per installed home-world
 * pack, at least one card per group, each card naming a characteristic line and
 * a named bonus, and a close action. Snapshots `homeworld-info-dialog-dh2`.
 */

interface ProbeResult {
    rendered: boolean;
    groupCount: number;
    cardCount: number;
    emptyGroups: number;
    cardsWithoutBonus: number;
    expectedGroups: number;
    hasCloseButton: boolean;
    appId: string | null;
    error: string | null;
}

test.describe.serial('HomeworldInfoDialog', () => {
    test('renders a card group per DH2 home-world pack, every card with its bonuses, and a close action', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async (): Promise<ProbeResult> => {
            interface DialogModule {
                openHomeworldInfoDialog: (line?: string) => void;
            }
            interface PackLite {
                documentName?: string;
                metadata?: { flags?: { 'wh40k-rpg'?: { line?: string; category?: string; homebrew?: boolean } } };
            }
            interface BrowserCtx {
                game?: { packs?: Iterable<PackLite> };
            }
            const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/homeworld-info-dialog.js';
            const out: ProbeResult = {
                rendered: false,
                groupCount: 0,
                cardCount: 0,
                emptyGroups: 0,
                cardsWithoutBonus: 0,
                expectedGroups: 0,
                hasCloseButton: false,
                appId: null,
                error: null,
            };
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
                const packs = [...((globalThis as unknown as BrowserCtx).game?.packs ?? [])];
                out.expectedGroups = packs.filter((pack) => {
                    const flags = pack.metadata?.flags?.['wh40k-rpg'];
                    return flags?.line === 'dh2' && flags.category === 'origins-homeworlds' && flags.homebrew !== true;
                }).length;
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of compiled JS module; shape declared via DialogModule
                const mod = (await import(moduleUrl)) as unknown as DialogModule;
                const inst = await wh40kOpenDialog('homeworld-info-dialog', () => {
                    mod.openHomeworldInfoDialog('dh2');
                });
                await globalThis.wh40kE2E.pollUntil(() => inst.element?.querySelector('[data-homeworld], [data-testid="hw-empty"]') != null);
                const root = inst.element;
                out.rendered = root instanceof HTMLElement;
                if (root !== null) {
                    const groups = [...root.querySelectorAll('[data-homeworld-group]')];
                    out.groupCount = groups.length;
                    out.emptyGroups = groups.filter((group) => group.querySelector('[data-homeworld]') === null).length;
                    const cards = [...root.querySelectorAll('[data-homeworld]')];
                    out.cardCount = cards.length;
                    out.cardsWithoutBonus = cards.filter((card) => card.querySelector('[data-testid="hw-ability"]') === null).length;
                    out.hasCloseButton = root.querySelector('[data-action="close"]') !== null;
                    out.appId = root.id;
                }
            } catch (err) {
                out.error = err instanceof Error ? err.message : String(err);
            }
            return out;
        });

        expect(result.appId, 'dialog did not open').not.toBeNull();
        await snap(page, 'homeworld-info-dialog-dh2', { selector: `#${result.appId ?? ''}`, closeWindows: true, keepWindow: result.appId ?? undefined });
        await clearScreenOverlays(page);

        expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'dialog did not render').toBe(true);
        expect(result.expectedGroups, 'expected DH2 home-world packs to be installed').toBeGreaterThan(0);
        expect(result.groupCount, 'one card group per DH2 home-world pack').toBe(result.expectedGroups);
        expect(result.emptyGroups, 'no group renders without cards').toBe(0);
        expect(result.cardCount).toBeGreaterThanOrEqual(result.expectedGroups);
        expect(result.cardsWithoutBonus, 'every home-world card shows its named bonus').toBe(0);
        expect(result.hasCloseButton, 'expected close action button').toBe(true);

        recordCoverage('dialog.render', 'HomeworldInfoDialog');
    });
});
