import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Fanatic role "Death to All Who Oppose Me!" action e2e (#93, DH2 Enemies
 * Within p.34).
 *
 * Creates a `dh2-character` owning the Fanatic role (an originPath item with
 * `system.identifier: 'fanatic'`) and a starting Fate pool, opens the actor
 * sheet on the Overview tab, and clicks the Fanatic button with NO foe
 * targeted. Verifies:
 *   - the button renders for the role (matched by identifier, not name)
 *   - with no targeted foe the Fate spend is refused (Fate unchanged) and no
 *     encounter Hatred grant is created — the ability needs a current foe.
 */
test('fanatic-button renders for the role and refuses the spend without a target (#93)', async ({ page }) => {
    await joinOrSkip(page, 'no Gamemaster user available in this test world');

    interface ProbeResult {
        setupOk: boolean;
        buttonFound?: boolean;
        fateBefore?: number;
        fateAfter?: number;
        encounterGrantFound?: boolean;
        error: string | null;
    }
    const result = await page.evaluate(async (): Promise<ProbeResult> => {
        interface ActorItem {
            flags?: { 'wh40k-rpg'?: { encounterGrant?: boolean } };
        }
        interface ActorSheet {
            render: (force?: boolean) => Promise<void>;
            changeTab?: (tab: string, group: string) => void;
            element?: HTMLElement | null;
        }
        interface ActorDoc {
            sheet: ActorSheet;
            system?: { fate?: { value?: number } };
            items?: Iterable<ActorItem>;
        }
        interface ActorCtorShape {
            create?: (data: object) => Promise<ActorDoc | null>;
        }
        interface ProbeGlobal {
            Actor?: ActorCtorShape;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
        const g = globalThis as unknown as ProbeGlobal;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) return { setupOk: false, error: 'Actor.create unavailable' };

        let actor: ActorDoc | null;
        try {
            actor = await ActorCls.create({
                name: 'fanatic-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', fate: { max: 3, value: 3 } },
                items: [{ name: 'Fanatic', type: 'originPath', system: { identifier: 'fanatic' } }],
            });
        } catch (err) {
            return { setupOk: false, error: (err as Error).message };
        }
        if (actor == null) return { setupOk: false, error: 'Actor.create returned null' };

        const fateBefore = actor.system?.fate?.value ?? 0;
        const liveActor = actor;
        const { pollUntil, settle } = globalThis.wh40kE2E;

        await liveActor.sheet.render(true);
        await settle(250);

        // Navigate to the Overview tab (Status was consolidated into Overview, #263).
        const findButton = (): HTMLElement | null => liveActor.sheet.element?.querySelector<HTMLElement>('[data-action="deathToAllWhoOpposeMe"]') ?? null;
        try {
            liveActor.sheet.changeTab?.('overview', 'primary');
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }
        await pollUntil(() => findButton() !== null);

        const btn = findButton();
        const buttonFound = btn !== null;
        if (btn !== null) {
            btn.click();
            await settle(500);
        }

        const items = liveActor.items !== undefined ? Array.from(liveActor.items) : [];
        return {
            setupOk: true,
            buttonFound,
            fateBefore,
            fateAfter: liveActor.system?.fate?.value ?? 0,
            encounterGrantFound: items.some((i) => i.flags?.['wh40k-rpg']?.encounterGrant === true),
            error: null,
        };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);
    expect(result.buttonFound, 'fanatic button was not rendered on the sheet').toBe(true);

    // Capture the rendered post-click state for visual review.
    await snap(page, 'fanatic-button-clicked');

    // Capture JUST the button element clearly (see tests/storybook/issue-191-endeavour-tracker.spec.ts).
    const buttonLocator = page.locator('[data-wh40k-hook="fanatic-button"]').first();
    if ((await buttonLocator.count()) > 0) {
        await buttonLocator.screenshot({ path: '.e2e-screenshots/fanatic-button-element.png' });
    }

    expect(result.fateAfter, 'no Fate is spent without a targeted foe').toBe(result.fateBefore);
    expect(result.encounterGrantFound, 'no Hatred grant without a targeted foe').toBe(false);

    // Cleanup
    await page.evaluate(async (): Promise<void> => {
        interface ActorDoc {
            delete?: () => Promise<void>;
        }
        interface CleanupGlobal {
            game?: { actors?: { getName?: (name: string) => ActorDoc | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
        const g = globalThis as unknown as CleanupGlobal;
        const a = g.game?.actors?.getName?.('fanatic-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
