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
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const Actor = g.Actor as { create?: (data: object) => Promise<{ id?: string; sheet?: { render: (force?: boolean) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> }; createEmbeddedDocuments?: (collection: string, data: unknown[]) => Promise<unknown[]> } | null> } | undefined;
                if (!Actor?.create) return { error: 'Actor.create unavailable' };

                let actorId: string | null = null;
                let sheetRendered = false;
                let badgeFound = false;
                let labelText: string | null = null;
                let error: string | null = null;

                try {
                    const actor = await Actor.create({
                        name: 'probe-daemonic-npc',
                        type: 'dh2-npc',
                        system: { gameSystem: 'dh2e' },
                    });
                    if (!actor) return { error: 'Actor.create returned null' };
                    actorId = actor.id ?? null;

                    if (typeof actor.createEmbeddedDocuments === 'function') {
                        await actor.createEmbeddedDocuments('Item', [
                            { name: 'Daemonic', type: 'trait' },
                        ]);
                    }

                    const sheet = actor.sheet;
                    if (!sheet) return { actorId, error: 'actor.sheet undefined' };
                    await sheet.render(true);
                    await new Promise((r) => setTimeout(r, 120));
                    sheetRendered = sheet.element instanceof HTMLElement;
                    if (sheetRendered && sheet.element) {
                        const badge = sheet.element.querySelector('.wh40k-daemonic-immunities-badge');
                        badgeFound = badge !== null;
                        labelText = badge?.querySelector('.wh40k-daemonic-immunities-badge__label')?.textContent?.trim() ?? null;
                    }
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return { actorId, sheetRendered, badgeFound, labelText, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
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
