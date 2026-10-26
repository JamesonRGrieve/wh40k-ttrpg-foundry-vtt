import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Daemonic Immunities badge (GitHub #143).
 *
 * Creates a DH2 NPC actor with a Daemonic trait item, opens the sheet,
 * and asserts the crimson skull pill is present in the sidebar header.
 * Captures a screenshot of the rendered sheet for visual review.
 *
 * The badge is purely presentational. The engine-side rules tests live
 * in `src/module/rules/daemonic-immunities.test.ts`.
 */

test.describe.serial('Daemonic Immunities header badge (Tier B)', () => {
    test('renders the badge on an NPC sheet when the actor has the Daemonic trait', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            interface ActorSheet {
                // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 render returns Promise<this> with no shipped types
                render: (force?: boolean) => Promise<unknown>;
                element: HTMLElement | null;
                // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close returns Promise<this> with no shipped types
                close: () => Promise<unknown>;
            }
            interface ActorInstance {
                id?: string;
                sheet?: ActorSheet;
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry createEmbeddedDocuments accepts arbitrary Document data and returns Document[]
                createEmbeddedDocuments?: (collection: string, data: object[]) => Promise<unknown[]>;
            }
            interface FoundryActorGlobal {
                Actor?: { create?: (data: object) => Promise<ActorInstance | null> };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as FoundryActorGlobal;
            const ActorCls = g.Actor;
            if (!ActorCls?.create) return { error: 'Actor.create unavailable' };

            let actorId: string | null = null;
            let sheetRendered = false;
            let badgeFound = false;
            let labelText: string | null = null;
            let fitsWhole = false;
            let insidePortrait = false;
            let glyphs: string[] = [];
            let colors: { text: string; background: string } | null = null;
            let error: string | null = null;

            try {
                const actor = await ActorCls.create({
                    name: 'probe-daemonic-npc',
                    type: 'dh2-npc',
                    system: { gameSystem: 'dh2' },
                });
                if (!actor) return { error: 'Actor.create returned null' };
                actorId = actor.id ?? null;

                if (typeof actor.createEmbeddedDocuments === 'function') {
                    await actor.createEmbeddedDocuments('Item', [{ name: 'Daemonic (X)', type: 'trait', system: { identifier: 'daemonic' } }]);
                }

                const sheet = actor.sheet;
                if (!sheet) return { actorId, error: 'actor.sheet undefined' };
                await sheet.render(true);
                // Wait for the badge to render (the checks below report a miss).
                await globalThis.wh40kE2E.pollUntil(() => sheet.element?.querySelector('[data-wh40k-hook="daemonic-immunities-badge"]') != null);
                sheetRendered = sheet.element instanceof HTMLElement;
                if (sheetRendered && sheet.element) {
                    const badge = sheet.element.querySelector('[data-wh40k-hook="daemonic-immunities-badge"]');
                    badgeFound = badge !== null;
                    labelText = badge?.querySelector('[data-wh40k-hook="daemonic-immunities-badge__label"]')?.textContent.trim() ?? null;
                    if (badge instanceof HTMLElement) {
                        // #699: nothing in the pill is cut off, and it sits wholly on the portrait.
                        fitsWhole = badge.scrollWidth <= badge.clientWidth;
                        const portrait = badge.closest('[data-wh40k-hook="actor-portrait"]')?.getBoundingClientRect();
                        const pill = badge.getBoundingClientRect();
                        insidePortrait = portrait !== undefined && pill.left >= portrait.left && pill.right <= portrait.right && pill.bottom <= portrait.bottom;
                        glyphs = Array.from(badge.querySelectorAll<HTMLElement>('[data-immunity]')).map((glyph) => glyph.dataset['immunity'] ?? '');
                        const style = getComputedStyle(badge);
                        colors = { text: style.color, background: style.backgroundColor };
                    }
                }
            } catch (err) {
                error = String((err as Error).message);
            }

            return { actorId, sheetRendered, badgeFound, labelText, fitsWhole, insidePortrait, glyphs, colors, error };
        });

        expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.sheetRendered, 'NPC sheet did not render').toBe(true);
        expect(result.badgeFound, 'expected Daemonic Immunities badge on the sheet').toBe(true);
        expect(result.labelText, 'badge label should be the localized "Daemonic" string').toBe('Daemonic');
        // #699: the pill shows whole (no ellipsis), on the portrait, with its three immunity glyphs.
        expect(result.fitsWhole, 'the Daemonic pill is cut off').toBe(true);
        expect(result.insidePortrait, 'the Daemonic pill spills off the portrait').toBe(true);
        expect(result.glyphs).toEqual(['disease', 'poison', 'undying']);
        // #699: light-red text on a solid black pill (it was crimson on crimson).
        expect(result.colors).toEqual({ text: 'rgb(255, 90, 90)', background: 'rgb(0, 0, 0)' });

        await snap(page, 'daemonic-immunities-badge');
        recordCoverage('sheet.partial', 'DaemonicImmunitiesBadge');
    });
});
