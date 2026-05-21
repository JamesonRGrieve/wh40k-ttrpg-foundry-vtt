import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Ship component / role modifier surface (#196).
 *
 * Creates a `rt-starship` actor with a base detection of 10 and armour of
 * 18, embeds a `shipComponent` carrying `+8 detection`, a `shipUpgrade`
 * carrying `+1 armour`, and a `shipRole` whose `shipBonuses` add
 * `+5 manoeuvrability`. Opens the actor sheet, navigates to the Components
 * tab, and asserts:
 *
 *   • the Build Summary panel root is in the DOM;
 *   • at least one row carries the post-modifier total;
 *   • the underlying applied-modifier rollup on the actor.system reports
 *     the expected per-stat totals (regression guard against the engine
 *     being skipped on render).
 *
 * Snap is taken WITH THE SHEET OPEN — cleanup runs after the snap.
 */
test('ship-component-modifiers apply to derived ship stats (#196)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        interface AppliedTotal {
            total?: number;
        }
        interface ShipSystem {
            appliedModifiers?: Record<string, AppliedTotal | undefined>;
        }
        interface ShipSheet {
            render?: (force?: boolean) => Promise<void>;
            changeTab?: (tab: string, group: string) => void;
            element?: HTMLElement | null;
        }
        interface ShipActor {
            sheet?: ShipSheet;
            system?: ShipSystem;
            prepareData?: () => void;
            delete?: () => Promise<void>;
        }
        interface ShipGlobals {
            Actor?: { create?: (data: object) => Promise<ShipActor | null> };
            __ship196ProbeActor?: ShipActor;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const g = globalThis as unknown as ShipGlobals;
        const ActorCls = g.Actor;
        if (ActorCls?.create === undefined) {
            return {
                setupOk: false,
                hasSummaryPanel: false,
                rowCount: 0,
                detectionTotal: 0,
                armourTotal: 0,
                manoeuvrabilityTotal: 0,
                error: 'Actor.create unavailable',
            };
        }

        let actor: ShipActor | null;
        try {
            actor = await ActorCls.create({
                name: 'ship-mod-probe',
                type: 'rt-starship',
                system: {
                    gameSystem: 'rt',
                    speed: 7,
                    manoeuvrability: 15,
                    detection: 10,
                    armour: 18,
                    voidShields: 1,
                    turretRating: 1,
                    hullIntegrity: { max: 60, value: 60 },
                    crew: { population: 100, crewRating: 30, morale: { max: 100, value: 100 } },
                    shipPoints: { spent: 0, budget: 40 },
                },
                items: [
                    {
                        name: 'Mark-201.b Auger Array',
                        type: 'shipComponent',
                        system: {
                            componentType: 'auger',
                            condition: 'functional',
                            essential: true,
                            modifiers: { detection: 8 },
                            shipPoints: 1,
                        },
                    },
                    {
                        name: 'Reinforced Bulkheads',
                        type: 'shipUpgrade',
                        system: {
                            modifiers: { armour: 1, hullIntegrity: 4 },
                            shipPoints: 2,
                        },
                    },
                    {
                        name: 'Helmsman',
                        type: 'shipRole',
                        system: {
                            shipBonuses: {
                                manoeuvrability: 5,
                                detection: 0,
                                ballisticSkill: 0,
                                crewRating: 0,
                            },
                        },
                    },
                ],
            });
        } catch (err) {
            return {
                setupOk: false,
                hasSummaryPanel: false,
                rowCount: 0,
                detectionTotal: 0,
                armourTotal: 0,
                manoeuvrabilityTotal: 0,
                error: err instanceof Error ? err.message : String(err),
            };
        }
        if (actor === null) {
            return {
                setupOk: false,
                hasSummaryPanel: false,
                rowCount: 0,
                detectionTotal: 0,
                armourTotal: 0,
                manoeuvrabilityTotal: 0,
                error: 'Actor.create returned null',
            };
        }

        // Force a fresh prepare pass so the freshly-embedded items are seen.
        try {
            actor.prepareData?.();
        } catch {
            /* prepareData may be a no-op on this implementation */
        }

        await actor.sheet?.render?.(true);
        await new Promise<void>((r) => {
            setTimeout(r, 400);
        });

        try {
            actor.sheet?.changeTab?.('components', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 250);
            });
        } catch {
            /* fall back to whatever tab is open */
        }

        const root = actor.sheet?.element;
        const panel = root?.querySelector('.wh40k-ship-build-summary-panel') ?? null;
        const rowCount = panel !== null ? panel.querySelectorAll('.wh40k-ship-build-summary__row').length : 0;

        const applied = actor.system?.appliedModifiers ?? {};
        const detectionTotal = applied['detection']?.total ?? 0;
        const armourTotal = applied['armour']?.total ?? 0;
        const manoeuvrabilityTotal = applied['manoeuvrability']?.total ?? 0;

        // Stash for post-snap cleanup; intentionally not deleted yet.
        g.__ship196ProbeActor = actor;

        return {
            setupOk: true,
            hasSummaryPanel: panel !== null,
            rowCount,
            detectionTotal,
            armourTotal,
            manoeuvrabilityTotal,
            error: null,
        };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'ship-component-modifiers');

    try {
        const appLoc = page.locator('.application[data-application-part]').last();
        if ((await appLoc.count()) > 0) {
            await appLoc.screenshot({ path: '.e2e-screenshots/ship-component-modifiers__sheet-element.png' });
        }
    } catch {
        /* non-fatal — primary snap already wrote a PNG */
    }

    expect(result.hasSummaryPanel, 'expected .wh40k-ship-build-summary-panel to be in the rendered sheet').toBe(true);
    expect(result.rowCount, `expected at least one build-summary row; got ${result.rowCount}`).toBeGreaterThan(0);
    // Component → detection modifier engine.
    expect(result.detectionTotal, 'auger array should apply +8 detection').toBe(8);
    // Upgrade → armour modifier engine.
    expect(result.armourTotal, 'reinforced bulkheads should apply +1 armour').toBe(1);
    // Role → manoeuvrability modifier engine.
    expect(result.manoeuvrabilityTotal, 'helmsman role should apply +5 manoeuvrability').toBe(5);

    // Cleanup AFTER snap + assertions
    await page.evaluate(async () => {
        interface CleanupActor {
            delete?: () => Promise<void>;
        }
        interface CleanupGlobals {
            __ship196ProbeActor?: CleanupActor;
            game?: { actors?: { getName?: (name: string) => CleanupActor | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const g = globalThis as unknown as CleanupGlobals;
        const a = g.__ship196ProbeActor ?? g.game?.actors?.getName?.('ship-mod-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
        g.__ship196ProbeActor = undefined;
    });
});
