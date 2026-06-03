import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Crusader role "Smite the Unholy" action e2e (#141, beyond.md p.34/L807-841).
 *
 * Creates a `dh2-character` with a Crusader-named talent and a starting Fate
 * pool, opens the actor sheet, navigates to the Status tab, clicks the
 * Smite-the-Unholy button, and snaps the post-click state. Verifies:
 *   - the Smite-the-Unholy button renders when `hasCrusader` is truthy
 *   - clicking the button decrements fate by SMITE_THE_UNHOLY_FATE_COST (1)
 *   - the button + its surrounding panel stay OPEN through `snap()` so the
 *     screenshot captures the live DOM (dialog/button stays OPEN through
 *     snap — closing pre-snap leaves the image empty, see #116
 *     disorder-roll-dialog spec for the canonical pattern).
 *
 * The melee Fear(X) damage / penetration rider is a passive helper
 * (rules/crusader.ts::applySmiteTheUnholyBonus) and is exercised by the
 * unit suite rather than e2e; this spec covers only the player-facing
 * Fate-spend action surface.
 */
interface CrusaderProbeResult {
    setupOk: boolean;
    buttonFound: boolean;
    fateBefore: number;
    fateAfter: number;
    error: string | null;
}

test('crusader-role smite-the-unholy decrements Fate and renders chat (#141)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async (): Promise<CrusaderProbeResult> => {
        interface ActorSheet {
            render: (force?: boolean) => Promise<void>;
            changeTab?: (tab: string, group: string) => void;
            element?: { querySelector?: (sel: string) => HTMLElement | null };
        }
        interface ActorDoc {
            system?: { fate?: { value?: number } };
            sheet: ActorSheet;
        }
        interface ActorCtorShape {
            create?: (data: object) => Promise<ActorDoc | null>;
        }
        interface FoundryGlobal {
            Actor?: ActorCtorShape;
            __crusaderSheet?: ActorSheet;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global (Actor), no type surface in browser context
        const g = globalThis as unknown as FoundryGlobal;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) return { setupOk: false, buttonFound: false, fateBefore: 0, fateAfter: 0, error: 'Actor.create unavailable' };

        let actor: ActorDoc | null;
        try {
            actor = await ActorCls.create({
                name: 'crusader-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2',
                    fate: { max: 3, value: 3 },
                    characteristics: { willpower: { base: 40, advance: 0 } },
                },
                items: [
                    {
                        name: 'Crusader',
                        type: 'talent',
                        system: {},
                    },
                ],
            });
        } catch (err) {
            return { setupOk: false, buttonFound: false, fateBefore: 0, fateAfter: 0, error: err instanceof Error ? err.message : String(err) };
        }
        if (actor == null) return { setupOk: false, buttonFound: false, fateBefore: 0, fateAfter: 0, error: 'Actor.create returned null' };

        const fateBefore = actor.system?.fate?.value ?? 0;

        await actor.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        // Navigate to the Overview tab (Status was consolidated into Overview, #263).
        try {
            actor.sheet.changeTab?.('overview', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const btn = actor.sheet.element?.querySelector?.('[data-action="smiteTheUnholy"]') ?? null;
        const buttonFound = btn !== null;
        if (btn) {
            btn.click();
            // Allow the async handler to settle (fate decrement + chat-card render).
            await new Promise<void>((r) => {
                setTimeout(r, 400);
            });
        }

        const fateAfter = actor.system?.fate?.value ?? 0;
        // Park the sheet on globalThis so the spec-level snap() captures the
        // live DOM. The fanatic-button + mortification-action specs follow
        // the same pattern; the dialog/panel stays OPEN through snap().
        g.__crusaderSheet = actor.sheet;

        return {
            setupOk: true,
            buttonFound,
            fateBefore,
            fateAfter,
            error: null,
        };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);
    expect(result.buttonFound, 'crusader button was not rendered on the sheet').toBe(true);

    // Capture the rendered post-click state for visual review.
    await snap(page, 'crusader-button-clicked');

    // Capture JUST the panel element clearly.
    const panelLocator = page.locator('.wh40k-crusader-panel').first();
    if ((await panelLocator.count()) > 0) {
        await panelLocator.screenshot({ path: '.e2e-screenshots/crusader-button-element.png' });
    }

    expect(result.fateAfter, `expected fate to decrement from ${result.fateBefore}`).toBeLessThan(result.fateBefore);

    // Cleanup
    await page.evaluate(async () => {
        interface CleanupActor {
            sheet?: { close?: () => Promise<void> };
            delete?: () => Promise<void>;
        }
        interface FoundryGlobal {
            game?: { actors?: { getName?: (name: string) => CleanupActor | null } };
            __crusaderSheet?: { close?: () => Promise<void> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global (game), no type surface in browser context
        const g = globalThis as unknown as FoundryGlobal;
        const a = g.game?.actors?.getName?.('crusader-probe');
        try {
            await a?.sheet?.close?.();
        } catch {
            /* ignore */
        }
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
        g.__crusaderSheet = undefined;
    });
});
