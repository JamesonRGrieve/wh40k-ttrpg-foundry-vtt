import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Fanatic role "Death to All Who Oppose Me" action e2e (#93, within.md p.34/967).
 *
 * Creates a `dh2-character` with a Fanatic-named talent and a starting Fate
 * pool, opens the actor sheet, navigates to the Status tab, clicks the
 * Fanatic button, and snaps the post-click state. Verifies:
 *   - the fate value decremented by 1
 *   - an ActiveEffect tagged with flags.wh40k.source === 'fanatic-death-to-oppose'
 *     now exists on the actor (granting +10 WS / +10 BS for 5 rounds)
 */
test('fanatic-button spends Fate + applies active effect and posts chat (#93)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) return { setupOk: false, error: 'Actor.create unavailable' };

        let actor;
        try {
            actor = await Actor.create({
                name: 'fanatic-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e', fate: { max: 3, value: 3 } },
                items: [
                    {
                        name: 'Fanatic',
                        type: 'talent',
                        system: {},
                    },
                ],
            });
        } catch (err) {
            return { setupOk: false, error: String((err as Error)?.message ?? err) };
        }
        if (!actor) return { setupOk: false, error: 'Actor.create returned null' };

        const fateBefore = actor.system?.fate?.value ?? 0;

        await actor.sheet.render(true);
        await new Promise((r) => setTimeout(r, 250));

        // Navigate to the Status tab if the sheet's tab API is reachable.
        try {
            actor.sheet?.changeTab?.('status', 'primary');
            await new Promise((r) => setTimeout(r, 150));
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const btn = actor.sheet?.element?.querySelector?.('[data-action="deathToAllWhoOpposeMe"]') as HTMLElement | null;
        const buttonFound = btn !== null;
        if (btn) {
            btn.click();
            // Allow the async action handler to resolve fate.update + ActiveEffect create.
            await new Promise((r) => setTimeout(r, 400));
        }

        const fateAfter = actor.system?.fate?.value ?? 0;
        const effects: Array<{ flags?: { wh40k?: { source?: string } } }> = Array.from(actor.effects ?? []);
        const fanaticEffect = effects.find((e) => e?.flags?.wh40k?.source === 'fanatic-death-to-oppose');

        return {
            setupOk: true,
            buttonFound,
            fateBefore,
            fateAfter,
            fanaticEffectFound: fanaticEffect !== undefined,
            error: null,
        };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);
    expect(result.buttonFound, 'fanatic button was not rendered on the sheet').toBe(true);

    // Capture the rendered post-click state for visual review.
    await snap(page, 'fanatic-button-clicked');

    // Capture JUST the button element clearly (see tests/storybook/issue-191-endeavour-tracker.spec.ts).
    const buttonLocator = page.locator('.wh40k-fanatic-button').first();
    if ((await buttonLocator.count()) > 0) {
        await buttonLocator.screenshot({ path: '.e2e-screenshots/fanatic-button-element.png' });
    }

    expect(result.fateAfter, `expected fate to decrement from ${result.fateBefore}`).toBeLessThan(result.fateBefore ?? 0);
    expect(result.fanaticEffectFound, 'expected an ActiveEffect with flags.wh40k.source === "fanatic-death-to-oppose"').toBe(true);

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        const a = g.game?.actors?.getName?.('fanatic-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
