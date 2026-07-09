import type { Page } from '@playwright/test';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of a COMPLETE combat encounter as one continuous flow.
 *
 * The existing combat specs each exercise a single slice in isolation:
 *   - combat.spec.ts          — tracker lifecycle (initiative, turns, rounds)
 *                               with NO attacks/damage during the turn loop.
 *   - combat-attack-flow.spec — rollWeaponAttack wiring + WeaponActionData
 *                               branching, on standalone actors (no Combat).
 *   - weapon-attack.spec.ts   — weapon pipeline + npc.applyDamage → wounds,
 *                               on a standalone NPC (no Combat / turn context).
 *
 * This spec ties them together: two actors in a live Combat → roll initiative →
 * start the encounter → on each round the attacker strikes the defender →
 * wounds deplete → the defender dies (wounds 0 + critical accrual) → end combat.
 *
 * Headless constraints (intentional, documented):
 *   - The dialog-driven attack roll itself can't run headless — rollWeaponAttack
 *     routes through rollItem → the unified roll dialog, which waits for a user
 *     click and would hang. So the attack pipeline's WIRING is asserted
 *     (rollWeaponAttack is a function on the combatant) while the damage is
 *     applied deterministically via npc.applyDamage — the same approach
 *     weapon-attack.spec.ts uses for its armour-reduction assertion.
 *   - Combat is scene-less (matching combat.spec.ts): there are no canvas tokens,
 *     so game.user.targets-based targeting is out of scope; the defender
 *     combatant is the attack target by construction.
 *
 * Deterministic numbers: defender has WOUNDS_MAX wounds and no armour/toughness;
 * each strike applies DAMAGE_PER_HIT with armour+toughness ignored, so the
 * arithmetic is exact (6 → 4 → 2 → 0) and every step can assert the precise
 * wound total. Collect-failures-then-assert pattern matches combat.spec.ts.
 */

interface StepResult {
    step: string;
    success: boolean;
    note: string;
}

interface EncounterProbe {
    results: StepResult[];
    pageErrors: string[];
}

async function probeFullEncounter(page: Page): Promise<EncounterProbe> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async () => {
            // Browser-side probe shapes for the Foundry runtime globals. Only the
            // members this spec drives are declared; everything is optional so the
            // runtime-availability guards below stay meaningful.
            interface WoundsState {
                value: number;
                max: number;
                critical: number;
            }
            interface ActorDoc {
                id?: string;
                system?: { wounds?: WoundsState };
                rollWeaponAttack?: (weaponId: string) => Promise<void>;
                applyDamage?: (amount: number, location: string, options: { ignoreArmour?: boolean; ignoreToughness?: boolean }) => Promise<void>;
                delete?: () => Promise<void>;
            }
            interface ActorCreateData {
                name: string;
                type: string;
                system: { gameSystem: string; wounds?: WoundsState };
            }
            interface ActorStatic {
                create?: (data: ActorCreateData) => Promise<ActorDoc | null>;
            }
            interface CombatantDoc {
                id?: string;
            }
            interface CombatInstance {
                id?: string;
                round?: number;
                combatant?: { id?: string };
                createEmbeddedDocuments?: (type: string, data: Array<{ actorId: string }>) => Promise<CombatantDoc[]>;
                rollAll?: () => Promise<void>;
                startCombat?: () => Promise<void>;
                nextTurn?: () => Promise<void>;
                setInitiative?: (combatantId: string, value: number) => Promise<void>;
                endCombat?: () => Promise<void>;
                delete?: () => Promise<void>;
            }
            interface CombatStatic {
                create?: (data: Record<string, never>) => Promise<CombatInstance | null>;
            }
            interface GameGlobal {
                actors?: { get?: (id: string) => ActorDoc | undefined };
            }
            interface FoundryGlobal {
                Actor?: ActorStatic;
                Combat?: CombatStatic;
                game?: GameGlobal;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: globalThis is the Foundry V14 runtime global; no schema exists in this repo
            const g = globalThis as unknown as FoundryGlobal;
            const ActorGbl = g.Actor;
            const CombatGbl = g.Combat;
            const gameGbl = g.game;

            const WOUNDS_MAX = 6;
            const DAMAGE_PER_HIT = 2;

            const stepResults: Array<{ step: string; success: boolean; note: string }> = [];
            const step = async (name: string, fn: () => string | Promise<string>): Promise<void> => {
                try {
                    stepResults.push({ step: name, success: true, note: await fn() });
                } catch (err) {
                    stepResults.push({ step: name, success: false, note: err instanceof Error ? err.message : String(err) });
                }
            };

            // Several combat methods can hang in headless mode waiting for socket
            // events that never arrive; wrap each in a timeout so one stuck call
            // can't take the Foundry server (and downstream specs) down with it.
            const withTimeout = async <T>(p: Promise<T> | undefined, ms: number, label: string): Promise<T> => {
                if (p === undefined) throw new Error(`${label} is not available`);
                const handle = { timer: undefined as ReturnType<typeof setTimeout> | undefined };
                const timeout = new Promise<T>((_, reject) => {
                    handle.timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    clearTimeout(handle.timer);
                }
            };

            // Encounter state, populated as the steps run; downstream steps guard
            // on these so a failed prerequisite fails its dependents with a note.
            let attacker: ActorDoc | null = null;
            let attackerId = '';
            let defenderId = '';
            let combat: CombatInstance | null = null;
            let attackerCombatantId = '';
            let defenderCombatantId = '';

            // A single attacker strike: apply deterministic damage to the live
            // defender and return its remaining wounds. Sequential awaits (no loop).
            const strike = async (label: string): Promise<number> => {
                const liveDef = gameGbl?.actors?.get?.(defenderId);
                if (liveDef?.applyDamage == null) throw new Error('defender.applyDamage unavailable');
                await withTimeout(liveDef.applyDamage(DAMAGE_PER_HIT, 'body', { ignoreArmour: true, ignoreToughness: true }), 5_000, `applyDamage (${label})`);
                const fresh = gameGbl?.actors?.get?.(defenderId);
                return fresh?.system?.wounds?.value ?? -1;
            };

            // Advance a full round in a 2-combatant encounter: attacker turn →
            // defender turn → wraps to the next round. Sequential awaits (no loop).
            const advanceFullRound = async (): Promise<void> => {
                const c = combat;
                if (c?.nextTurn == null) throw new Error('combat.nextTurn unavailable');
                await withTimeout(c.nextTurn(), 5_000, 'nextTurn (to defender)');
                await withTimeout(c.nextTurn(), 5_000, 'nextTurn (to next round)');
            };

            // Read the closure-assigned combat without CFA narrowing it to null in
            // the outer finally scope below (assignments happen inside step callbacks).
            const currentCombat = (): CombatInstance | null => combat;

            try {
                await step('create-actors', async () => {
                    if (ActorGbl?.create == null) throw new Error('Actor.create unavailable');
                    const create = ActorGbl.create.bind(ActorGbl);
                    const atk = await withTimeout(
                        create({ name: 'full-encounter-attacker', type: 'dh2-character', system: { gameSystem: 'dh2' } }),
                        5_000,
                        'create attacker',
                    );
                    const def = await withTimeout(
                        create({
                            name: 'full-encounter-defender',
                            type: 'dh2-npc',
                            system: { gameSystem: 'dh2', wounds: { max: WOUNDS_MAX, value: WOUNDS_MAX, critical: 0 } },
                        }),
                        5_000,
                        'create defender',
                    );
                    if (atk?.id == null || def?.id == null) throw new Error('actor create returned null');
                    attacker = atk;
                    attackerId = atk.id;
                    defenderId = def.id;
                    return `attacker ${attackerId} (dh2-character), defender ${defenderId} (dh2-npc, ${WOUNDS_MAX} wounds)`;
                });

                await step('attack-pipeline-wired', () => {
                    if (typeof attacker?.rollWeaponAttack !== 'function') throw new Error('attacker.rollWeaponAttack is not a function');
                    return 'attacker exposes rollWeaponAttack (the dialog-driven roll itself is out of scope headless)';
                });

                await step('create-combat', async () => {
                    if (CombatGbl?.create == null) throw new Error('Combat.create unavailable');
                    const c = await withTimeout(CombatGbl.create({}), 5_000, 'Combat.create');
                    if (c?.id == null) throw new Error('Combat.create returned null');
                    combat = c;
                    return `scene-less combat ${c.id} created`;
                });

                await step('add-combatants', async () => {
                    const c = combat;
                    if (c?.createEmbeddedDocuments == null || attackerId === '' || defenderId === '') throw new Error('combat or actor ids missing');
                    const created = await withTimeout(
                        c.createEmbeddedDocuments('Combatant', [{ actorId: attackerId }, { actorId: defenderId }]),
                        5_000,
                        'createEmbeddedDocuments',
                    );
                    const ids = created.map((d) => d.id).filter((id): id is string => typeof id === 'string');
                    if (ids.length < 2) throw new Error(`expected 2 combatant ids, got ${ids.length}`);
                    const [a, b] = ids;
                    attackerCombatantId = a;
                    defenderCombatantId = b;
                    return 'added attacker + defender combatants';
                });

                await step('roll-initiative', async () => {
                    const c = combat;
                    if (c == null) throw new Error('combat missing');
                    // Exercise rollAll best-effort (may depend on sockets headless),
                    // then set deterministic initiative so the attacker acts first.
                    let rollAllNote = 'rollAll not a function';
                    try {
                        if (typeof c.rollAll === 'function') {
                            await withTimeout(c.rollAll(), 5_000, 'rollAll');
                            rollAllNote = 'rollAll ok';
                        }
                    } catch (err) {
                        rollAllNote = `rollAll non-fatal: ${err instanceof Error ? err.message : String(err)}`;
                    }
                    if (typeof c.setInitiative !== 'function') throw new Error('combat.setInitiative is not a function');
                    await withTimeout(c.setInitiative(attackerCombatantId, 20), 5_000, 'setInitiative (attacker)');
                    await withTimeout(c.setInitiative(defenderCombatantId, 10), 5_000, 'setInitiative (defender)');
                    return `${rollAllNote}; initiative set attacker=20 defender=10`;
                });

                await step('start-combat', async () => {
                    const c = combat;
                    if (c?.startCombat == null) throw new Error('combat.startCombat unavailable');
                    await withTimeout(c.startCombat(), 5_000, 'startCombat');
                    const round = c.round ?? 0;
                    if (round < 1) throw new Error(`expected round >= 1 after startCombat, got ${round}`);
                    return `encounter started at round ${round}`;
                });

                await step('turn-order', () => {
                    const c = combat;
                    if (c == null) throw new Error('combat missing');
                    const current = c.combatant?.id;
                    if (current !== attackerCombatantId)
                        throw new Error(`expected attacker (init 20) to act first, current combatant is ${current ?? 'undefined'}`);
                    return 'attacker acts first by initiative';
                });

                await step('round-1-strike', async () => {
                    const w = await strike('round 1');
                    const expected = WOUNDS_MAX - DAMAGE_PER_HIT;
                    if (w !== expected) throw new Error(`expected ${expected} wounds after strike 1, got ${w}`);
                    return `attacker strikes; defender wounds ${WOUNDS_MAX} → ${w}`;
                });

                await step('advance-to-round-2', async () => {
                    await advanceFullRound();
                    const r = combat?.round ?? 0;
                    if (r < 2) throw new Error(`expected round >= 2 after a full round, got ${r}`);
                    return `tracker advanced to round ${r}`;
                });

                await step('round-2-strike', async () => {
                    const w = await strike('round 2');
                    const expected = WOUNDS_MAX - 2 * DAMAGE_PER_HIT;
                    if (w !== expected) throw new Error(`expected ${expected} wounds after strike 2, got ${w}`);
                    return `defender wounds → ${w}`;
                });

                await step('advance-to-round-3', async () => {
                    await advanceFullRound();
                    const r = combat?.round ?? 0;
                    if (r < 3) throw new Error(`expected round >= 3 after two full rounds, got ${r}`);
                    return `tracker advanced to round ${r}`;
                });

                await step('round-3-killing-blow', async () => {
                    const w = await strike('killing blow');
                    if (w !== 0) throw new Error(`expected 0 wounds after the killing blow, got ${w}`);
                    return 'killing blow lands; defender wounds → 0';
                });

                await step('defender-death-state', () => {
                    const fresh = gameGbl?.actors?.get?.(defenderId);
                    const value = fresh?.system?.wounds?.value ?? -1;
                    const critical = fresh?.system?.wounds?.critical ?? -1;
                    if (value !== 0) throw new Error(`expected 0 wounds at death, got ${value}`);
                    if (critical <= 0) throw new Error(`expected critical wounds > 0 at death, got ${critical}`);
                    return `defender dead: wounds 0, critical ${critical}`;
                });

                await step('end-combat', async () => {
                    const c = combat;
                    // NB: Combat.endCombat() opens a modal DialogV2.confirm whose "yes"
                    // callback calls this.delete(); headless e2e has no one to confirm it,
                    // so it hangs (5s timeout). Drive the real end-of-encounter state
                    // change — deleting the combat — directly.
                    if (c?.delete == null) throw new Error('combat.delete unavailable');
                    await withTimeout(c.delete(), 5_000, 'end-combat');
                    return 'encounter ended';
                });
            } finally {
                // Best-effort cleanup so this spec leaves no state for downstream specs.
                try {
                    await currentCombat()?.delete?.();
                } catch {
                    /* ignore */
                }
                try {
                    await gameGbl?.actors?.get?.(attackerId)?.delete?.();
                } catch {
                    /* ignore */
                }
                try {
                    await gameGbl?.actors?.get?.(defenderId)?.delete?.();
                } catch {
                    /* ignore */
                }
            }

            return stepResults;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('combat full encounter (Tier B)', () => {
    // Cap total runtime — internal per-call timeouts mean we should never come
    // close, but a hung server would otherwise eat the global test timeout.
    test.setTimeout(180_000);
    test('plays an encounter end-to-end: tracker → initiative → strikes → wound depletion → death', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeFullEncounter(page);

        const failures = probe.results.filter((r) => !r.success).map((r) => `${r.step}: ${r.note}`);
        const passed = probe.results.length - failures.length;
        const errTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${probe.results.length} encounter steps failed (${passed} passed):\n  - ${failures.join('\n  - ')}${errTail}`,
        ).toEqual([]);
    });
});
