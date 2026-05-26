import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Dark Pact tracker panel visual regression (#84).
 *
 * Creates a `dh2-character` with two entries in `system.pacts` (one
 * discovered with disposition +2 and lapsed payment, one undiscovered with
 * disposition -1 and current payment), opens the actor sheet, and snaps
 * the rendered status tab.
 *
 * Asserts the panel renders at least one `.wh40k-dark-pact-row` so a
 * template / preload regression that drops the panel surfaces as a test
 * failure rather than a silent visual diff.
 */
test('dark-pact-panel renders rows for actors with active pacts (#84)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async (): Promise<{ setupOk: boolean; rowCount: number; error: string | null }> => {
        interface SheetShape {
            render: (force?: boolean) => Promise<void>;
            changeTab?: (tab: string, group: string) => void;
            element?: { querySelectorAll?: (selector: string) => { length: number } | null } | null;
        }
        interface ActorDoc {
            sheet: SheetShape;
            delete?: () => Promise<void>;
        }
        interface PactEntry {
            pactUuid: string;
            discovered: boolean;
            disposition: number;
            paymentCurrent: boolean;
        }
        interface ActorCreateData {
            name: string;
            type: string;
            system: { gameSystem: string; pacts: PactEntry[] };
        }
        interface ActorClassShape {
            create?: (data: ActorCreateData) => Promise<ActorDoc | null>;
        }
        interface ActorCollection {
            getName?: (name: string) => ActorDoc | undefined;
        }
        interface GameObject {
            actors?: ActorCollection;
        }
        interface FoundryGlobal {
            Actor: ActorClassShape;
            game: GameObject;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, game) have no shipped types in this browser-side probe
        const g = globalThis as unknown as FoundryGlobal;
        const ActorCls = g.Actor;
        if (ActorCls.create == null) return { setupOk: false, rowCount: 0, error: 'Actor.create unavailable' };

        let actor: ActorDoc | null;
        try {
            actor = await ActorCls.create({
                name: 'dark-pact-panel-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2',
                    pacts: [
                        {
                            pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfHungerForKnowledge',
                            discovered: true,
                            disposition: 2,
                            paymentCurrent: false,
                        },
                        {
                            pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfBlackSilence',
                            discovered: false,
                            disposition: -1,
                            paymentCurrent: true,
                        },
                    ],
                },
            });
        } catch (err) {
            return { setupOk: false, rowCount: 0, error: err instanceof Error ? err.message : String(err) };
        }
        if (actor == null) return { setupOk: false, rowCount: 0, error: 'Actor.create returned null' };

        const createdActor = actor;
        await createdActor.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        // Navigate to the Status tab if the sheet's tab API is reachable.
        try {
            createdActor.sheet.changeTab?.('status', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* sheets without changeTab fall back to whatever tab is open */
        }

        const rows = createdActor.sheet.element?.querySelectorAll?.('.wh40k-dark-pact-row');
        const rowCount = rows?.length ?? 0;
        return { setupOk: true, rowCount, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'dark-pact-panel-with-pacts');

    expect(result.rowCount, `expected at least one .wh40k-dark-pact-row; got ${result.rowCount}`).toBeGreaterThanOrEqual(2);

    // Cleanup
    await page.evaluate(async (): Promise<void> => {
        interface CleanupActor {
            delete?: () => Promise<void>;
        }
        interface FoundryGlobal {
            game?: { actors?: { getName?: (name: string) => CleanupActor | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game) have no shipped types in this browser-side probe
        const g = globalThis as unknown as FoundryGlobal;
        const a = g.game?.actors?.getName?.('dark-pact-panel-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
