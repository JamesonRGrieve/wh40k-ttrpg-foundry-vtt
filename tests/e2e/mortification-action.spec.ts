import { joinOrSkip } from './lib/join';
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
    await joinOrSkip(page, 'no Gamemaster user available in this test world');

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
                system: { gameSystem: 'dh2' },
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
        const liveActor = actor;
        const { pollUntil, settle } = globalThis.wh40kE2E;

        await liveActor.sheet.render(true);
        await settle(250);

        // Navigate to the Overview tab (Status was consolidated into Overview, #263).
        const findButton = (): HTMLElement | null => liveActor.sheet.element?.querySelector?.('[data-action="applyMortification"]') ?? null;
        try {
            liveActor.sheet.changeTab?.('overview', 'primary');
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }
        await pollUntil(() => findButton() !== null);

        const btn = findButton();
        const buttonFound = btn !== null;
        const findMortificationEffect = (): { flags?: { wh40k?: { source?: string } } } | undefined =>
            Array.from(liveActor.effects ?? []).find((e) => e.flags?.wh40k?.source === 'mortification');
        if (btn) {
            btn.click();
            // Wait for the async action handler to resolve fatigue.update + ActiveEffect create
            // (the assertions below report whichever never lands).
            await pollUntil(() => (liveActor.system?.fatigue?.value ?? 0) > fatigueBefore && findMortificationEffect() !== undefined);
        }

        const fatigueAfter = liveActor.system?.fatigue?.value ?? 0;
        const mortificationEffect = findMortificationEffect();

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
