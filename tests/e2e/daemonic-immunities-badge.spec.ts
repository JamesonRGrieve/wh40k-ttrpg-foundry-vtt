import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
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
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
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
                        await actor.createEmbeddedDocuments('Item', [{ name: 'Daemonic', type: 'trait' }]);
                    }

                    const sheet = actor.sheet;
                    if (!sheet) return { actorId, error: 'actor.sheet undefined' };
                    await sheet.render(true);
                    await new Promise<void>((r) => {
                        setTimeout(r, 120);
                    });
                    sheetRendered = sheet.element instanceof HTMLElement;
                    if (sheetRendered && sheet.element) {
                        const badge = sheet.element.querySelector('.wh40k-daemonic-immunities-badge');
                        badgeFound = badge !== null;
                        labelText = badge?.querySelector('.wh40k-daemonic-immunities-badge__label')?.textContent.trim() ?? null;
                    }
                } catch (err) {
                    error = String((err as Error).message);
                }

                return { actorId, sheetRendered, badgeFound, labelText, error };
            });

            expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.sheetRendered, 'NPC sheet did not render').toBe(true);
            expect(result.badgeFound, 'expected Daemonic Immunities badge on the sheet').toBe(true);
            expect(result.labelText, 'badge label should be the localized "Daemonic" string').toBe('Daemonic');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            await snap(page, 'daemonic-immunities-badge');
            recordCoverage('sheet.partial', 'DaemonicImmunitiesBadge');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
