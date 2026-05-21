import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Crew Population & Morale combat
 * economy (issue #189). Probes the starship document's
 * `applyHullDamage` / `cancelPriorTurnDamage` / `replenishBetweenCombat`
 * methods against a freshly-created RT starship actor, then snaps the
 * open sheet's Crew tab so the visual review captures the panel after
 * the state mutations have propagated.
 *
 * Mirrors `tests/e2e/disorder-roll-dialog.spec.ts` — JS-only probe
 * via `page.evaluate`, leaves the sheet open for `snap()`, tears it
 * down in a follow-up evaluate.
 */

test.describe.serial('Starship Crew/Morale economy (Tier B · issue #189)', () => {
    test('applyHullDamage decrements crew + morale and renders the Crew tab', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                interface StarshipCrew {
                    population?: number;
                    crewRating?: number;
                    morale?: { value?: number; max?: number };
                }
                interface StarshipSystem {
                    hullIntegrity?: { value?: number; max?: number };
                    crew?: StarshipCrew;
                }
                interface StarshipSheet {
                    render?: (opts: { force: boolean }) => Promise<void>;
                    close?: () => Promise<void>;
                    changeTab?: (tab: string, group: string) => void;
                    element?: { querySelector?: (sel: string) => Element | null } | null;
                }
                interface StarshipActor {
                    id?: string;
                    system?: StarshipSystem;
                    applyHullDamage?: (n: number) => Promise<void>;
                    cancelPriorTurnDamage?: () => Promise<void>;
                    replenishBetweenCombat?: () => Promise<void>;
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update accepts arbitrary partial-update payloads
                    update?: (data: Record<string, unknown>) => Promise<void>;
                    delete?: () => Promise<void>;
                    sheet?: StarshipSheet;
                }
                interface ActorClass {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.create accepts arbitrary creation data
                    create?: (data: Record<string, unknown>) => Promise<StarshipActor | null | undefined>;
                }
                interface FoundryGame {
                    combats?: { active?: { round?: number } | null };
                }
                interface FoundryGlobal {
                    Actor?: ActorClass;
                    game?: FoundryGame;
                    __c9starship?: StarshipActor | undefined;
                    __c9starshipDh?: StarshipActor | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const fg = globalThis as unknown as FoundryGlobal;

                let error: string | null = null;
                let actorCreated = false;
                let sheetRendered = false;
                let hullBefore = 0;
                let hullAfter = 0;
                let crewBefore = 0;
                let crewAfter = 0;
                let moraleBefore = 0;
                let moraleAfter = 0;
                let cancelRestored = false;
                let replenishedMorale = 0;
                let nonRtCrewUnchanged = false;

                try {
                    const ActorCls = fg.Actor;
                    if (typeof ActorCls?.create !== 'function') {
                        return {
                            actorCreated,
                            sheetRendered,
                            hullBefore,
                            hullAfter,
                            crewBefore,
                            crewAfter,
                            moraleBefore,
                            moraleAfter,
                            cancelRestored,
                            replenishedMorale,
                            nonRtCrewUnchanged,
                            error: 'Actor.create not available',
                        };
                    }

                    // Ephemeral RT starship — RT system gating drives the
                    // crew/morale tick.
                    const actor = await ActorCls.create({
                        name: 'Crew Economy Probe',
                        type: 'rt-starship',
                        system: {
                            gameSystem: 'rt',
                            hullIntegrity: { value: 35, max: 35 },
                            crew: { population: 100, crewRating: 30, morale: { value: 100, max: 100 } },
                        },
                    });
                    actorCreated = actor !== undefined && actor !== null;

                    hullBefore = Number(actor?.system?.hullIntegrity?.value ?? 0);
                    crewBefore = Number(actor?.system?.crew?.population ?? 0);
                    moraleBefore = Number(actor?.system?.crew?.morale?.value ?? 0);

                    // Drive the document method directly — this is what
                    // void-combat hits route through via `#fireShipWeapon`.
                    if (typeof actor?.applyHullDamage === 'function') {
                        await actor.applyHullDamage(5);
                    } else {
                        error = 'applyHullDamage missing from starship document';
                    }

                    hullAfter = Number(actor?.system?.hullIntegrity?.value ?? 0);
                    crewAfter = Number(actor?.system?.crew?.population ?? 0);
                    moraleAfter = Number(actor?.system?.crew?.morale?.value ?? 0);

                    // Stub the active combat round so cancelPriorTurnDamage
                    // sees a strictly-prior turn relative to the snapshot.
                    const foundryGame = fg.game;
                    const realActive = foundryGame?.combats?.active ?? null;
                    if (foundryGame?.combats != null) {
                        foundryGame.combats.active = { round: (foundryGame.combats.active?.round ?? 0) + 2 };
                    }
                    try {
                        if (typeof actor?.cancelPriorTurnDamage === 'function') {
                            await actor.cancelPriorTurnDamage();
                            cancelRestored =
                                Number(actor.system?.crew?.population ?? 0) === crewBefore && Number(actor.system?.crew?.morale?.value ?? 0) === moraleBefore;
                        }
                    } finally {
                        if (foundryGame?.combats != null) foundryGame.combats.active = realActive;
                    }

                    // Drop morale, then replenishBetweenCombat → morale back to max.
                    await actor?.update?.({ 'system.crew.morale.value': 25 });
                    if (typeof actor?.replenishBetweenCombat === 'function') {
                        await actor.replenishBetweenCombat();
                        replenishedMorale = Number(actor.system?.crew?.morale?.value ?? 0);
                    }

                    // Per-system gating: a non-RT hull should NOT have crew
                    // touched by applyHullDamage.
                    const dhActor = await ActorCls.create({
                        name: 'DH2 Hull Probe',
                        type: 'rt-starship',
                        system: {
                            gameSystem: 'dh2',
                            hullIntegrity: { value: 30, max: 30 },
                            crew: { population: 50, crewRating: 30, morale: { value: 50, max: 50 } },
                        },
                    });
                    if (typeof dhActor?.applyHullDamage === 'function') {
                        await dhActor.applyHullDamage(4);
                        nonRtCrewUnchanged =
                            Number(dhActor.system?.crew?.population ?? 0) === 50 &&
                            Number(dhActor.system?.crew?.morale?.value ?? 0) === 50 &&
                            Number(dhActor.system?.hullIntegrity?.value ?? 0) === 26;
                    }

                    // Open the RT actor's sheet so snap() captures the Crew tab.
                    if (actor?.sheet?.render !== undefined) {
                        await actor.sheet.render({ force: true });
                        // Activate the Crew tab so the screenshot captures it.
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, 120);
                        });
                        const sheetEl = actor.sheet.element;
                        if (sheetEl != null) {
                            const crewTab = sheetEl.querySelector?.('[data-tab="crew"]') ?? null;
                            const crewNav = sheetEl.querySelector?.('nav [data-tab="crew"]') ?? null;
                            if (crewNav != null && typeof actor.sheet.changeTab === 'function') {
                                try {
                                    actor.sheet.changeTab('crew', 'primary');
                                } catch {
                                    /* ignore */
                                }
                            }
                            sheetRendered = crewTab !== null;
                        }
                    }

                    // Leak the actor on globalThis so the spec's cleanup
                    // evaluate can delete it after snap().
                    fg.__c9starship = actor ?? undefined;
                    fg.__c9starshipDh = dhActor ?? undefined;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    actorCreated,
                    sheetRendered,
                    hullBefore,
                    hullAfter,
                    crewBefore,
                    crewAfter,
                    moraleBefore,
                    moraleAfter,
                    cancelRestored,
                    replenishedMorale,
                    nonRtCrewUnchanged,
                    error,
                };
            });

            // Snap the open sheet on the Crew tab. The sheet is left open
            // by the probe above so the capture sees the live DOM.
            await snap(page, 'starship-crew-morale-after-hit');

            // Tear down so the actor doesn't leak into the next serial test.
            await page.evaluate(async () => {
                interface StarshipSheet {
                    close?: () => Promise<void>;
                }
                interface StarshipActor {
                    delete?: () => Promise<void>;
                    sheet?: StarshipSheet;
                }
                interface FoundryGlobal {
                    __c9starship?: StarshipActor | undefined;
                    __c9starshipDh?: StarshipActor | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const fg = globalThis as unknown as FoundryGlobal;
                const a = fg.__c9starship;
                const dh = fg.__c9starshipDh;
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
                try {
                    await dh?.delete?.();
                } catch {
                    /* ignore */
                }
                fg.__c9starship = undefined;
                fg.__c9starshipDh = undefined;
            });

            expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.actorCreated, 'RT starship actor should be created').toBe(true);
            // Hull damage propagated.
            expect(result.hullAfter, 'hull should drop by exactly 5').toBe(result.hullBefore - 5);
            expect(result.crewAfter, 'crew population should drop by exactly 5').toBe(result.crewBefore - 5);
            expect(result.moraleAfter, 'morale should drop by exactly 5').toBe(result.moraleBefore - 5);
            // Cancel reverted the prior turn's losses.
            expect(result.cancelRestored, 'Hold Fast! / Triage cancel should restore crew + morale').toBe(true);
            // Replenish between combat brings morale back to max.
            expect(result.replenishedMorale, 'replenishBetweenCombat should refill morale to max').toBe(100);
            // Non-RT hull damage path leaves crew untouched.
            expect(result.nonRtCrewUnchanged, 'non-RT hull should take hull damage only').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('starship.applyHullDamage', 'CrewMoraleEconomy');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
