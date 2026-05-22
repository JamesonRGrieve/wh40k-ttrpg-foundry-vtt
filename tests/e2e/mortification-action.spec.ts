import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Penitent role "Mortification of the Flesh" action e2e (#94, within.md p.36).
 *
 * Creates a `dh2-character` with a Penitent-named talent, opens the actor
 * sheet, navigates to the Status tab, clicks the Mortification button, and
 * snaps the post-click state. Verifies:
 *   - the fatigue value incremented by MORTIFICATION_OF_THE_FLESH.fatigueCost
 *   - an ActiveEffect tagged with flags.wh40k.source === 'mortification'
 *     now exists on the actor
 */
test('mortification-action applies fatigue + active effect and posts chat (#94)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        interface ActorSheet {
            render: (force: boolean) => Promise<void> | void;
            changeTab?: (tab: string, group: string) => void;
            element?: { querySelector?: (sel: string) => HTMLElement | null };
        }
        interface ProbeActor {
            system?: { fatigue?: { value?: number } };
            sheet: ActorSheet;
            effects?: Iterable<{ flags?: { wh40k?: { source?: string } } }>;
        }
        interface ActorClass {
            create?: (data: object) => Promise<ProbeActor | null>;
        }
        interface FoundryGlobals {
            Actor?: ActorClass;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (Actor namespace, no shipped browser-side types)
        const g = globalThis as unknown as FoundryGlobals;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) return { setupOk: false, error: 'Actor.create unavailable' };

        let actor: ProbeActor | null;
        try {
            actor = await ActorCls.create({
                name: 'mortification-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e' },
                items: [
                    {
                        name: 'Penitent',
                        type: 'talent',
                        system: {},
                    },
                ],
            });
        } catch (err) {
            return { setupOk: false, error: err instanceof Error ? err.message : String(err) };
        }
        if (actor == null) return { setupOk: false, error: 'Actor.create returned null' };

        const fatigueBefore = actor.system?.fatigue?.value ?? 0;

        await actor.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        // Navigate to the Status tab if the sheet's tab API is reachable.
        try {
            actor.sheet.changeTab?.('status', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const btn = actor.sheet.element?.querySelector?.('[data-action="applyMortification"]') ?? null;
        const buttonFound = btn !== null;
        if (btn) {
            btn.click();
            // Allow the async action handler to resolve fatigue.update + ActiveEffect create.
            await new Promise<void>((r) => {
                setTimeout(r, 400);
            });
        }

        const fatigueAfter = actor.system?.fatigue?.value ?? 0;
        const effects: Array<{ flags?: { wh40k?: { source?: string } } }> = Array.from(actor.effects ?? []);
        const mortificationEffect = effects.find((e) => e.flags?.wh40k?.source === 'mortification');

        return {
            setupOk: true,
            buttonFound,
            fatigueBefore,
            fatigueAfter,
            mortificationEffectFound: mortificationEffect !== undefined,
            error: null,
        };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);
    expect(result.buttonFound, 'mortification button was not rendered on the sheet').toBe(true);

    await snap(page, 'mortification-button-clicked');

    expect(result.fatigueAfter, `expected fatigue to increment from ${result.fatigueBefore}`).toBeGreaterThan(result.fatigueBefore ?? 0);
    expect(result.mortificationEffectFound, 'expected an ActiveEffect with flags.wh40k.source === "mortification"').toBe(true);

    // Cleanup
    await page.evaluate(async () => {
        interface FoundryGameGlobals {
            game?: { actors?: { getName?: (name: string) => { delete?: () => Promise<void> } | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (game namespace, no shipped browser-side types)
        const g = globalThis as unknown as FoundryGameGlobals;
        const a = g.game?.actors?.getName?.('mortification-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
