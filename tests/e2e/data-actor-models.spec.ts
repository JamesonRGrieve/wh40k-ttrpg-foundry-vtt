import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the DATA_ACTOR_MODEL_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 *
 * Tier B coverage of the shared ACTOR DataModel layer that no other Tier B
 * spec drives. vehicle-starship.spec.ts covers vehicle.ts / starship.ts
 * derived getters; per-system-flows.spec.ts covers the per-system signature
 * SCALAR write paths (chaosAlignment, corruption/insanity, originPath
 * chapter/regiment, RT profitFactor/endeavour). Neither exercises the
 * CreatureTemplate / CharacterData derived-data math — the very surface the
 * co-located creature.test.ts explicitly defers ("TODO: prepareDerivedData
 * computes skill rank/trained/plus10/plus20/plus30").
 *
 * Source coverage targets (src/module/data/actor/):
 *   - templates/creature.ts:
 *       _prepareCharacteristics  (total = base + advance*5 + modifier - damage;
 *                                  bonus = floor(total/10); unnatural>=2
 *                                  multiplies the bonus)
 *       _prepareSkills           (effectiveRank = min(originRank+advance,4);
 *                                  trained/plus10/plus20/plus30 flags;
 *                                  current = baseValue + trainingBonus + bonus,
 *                                  with the usesAptitudes vs career-system
 *                                  untrained-baseValue divergence)
 *       _prepareMovement         (baseMove = AB + size - 4; half/full/charge/
 *                                  run multipliers; leap/jump/lifting from SB)
 *       _prepareFatigue          (fatigue.max derives from Toughness Bonus
 *                                  when stored max <= 0)
 *       _preparePsy / isPsyker   (currentRating = rating - sustained)
 *       getRollData              (data[short], data[short+'B'], data.pr)
 *   - character.ts (via bases/character-base.ts + the thin concrete
 *     <system>-character.ts wrappers — all of which are pure
 *     `static gameSystem` subclasses, so a single per-system create flows
 *     through every one):
 *       _prepareExperience       (available = total - used)
 *       corruptionLevel getter   (<30 none / <60 tainted / <90 corrupted /
 *                                  else lost)
 *       insanityDegrees getter   (floor(insanity/10))
 *       subtlety / influence schema round-trip + the 0..100 influence clamp
 *
 * Per-system cross-products: the untrained skill baseValue diverges by
 * `SystemConfig.usesAptitudes` — aptitude systems (bc, dh2, ow, im) use
 * `charTotal - 20`; career systems (dh1, dw, rt) use `floor(charTotal/2)`.
 * Both branches are driven with a real per-system actor so the
 * gameSystem-dispatch path in _prepareSkills is exercised for every line.
 *
 * Strategy mirrors weapon-attack.spec.ts exactly: one page.evaluate
 * round-trip, per-call withTimeout, a cleanups[] registry drained in a
 * finally block, collect-failures-then-assert.
 */

const DATA_ACTOR_MODEL_FLOWS = [
    'characteristic-total-and-bonus::dh2',
    'characteristic-total-and-bonus::im',
    'characteristic-unnatural-multiplies-bonus::dh2',
    'characteristic-damage-subtracts::dh2',
    'skill-rank-flags::dh2',
    'skill-current-aptitude-untrained::dh2',
    'skill-current-aptitude-untrained::bc',
    'skill-current-aptitude-untrained::ow',
    'skill-current-aptitude-untrained::im',
    'skill-current-career-untrained::rt',
    'skill-current-career-untrained::dh1',
    'skill-current-career-untrained::dw',
    'skill-trained-uses-full-characteristic::dh2',
    'movement-derives-from-ab-and-size::dh2',
    'lifting-and-leap-from-strength-bonus::dh2',
    'fatigue-max-from-toughness-bonus::dh2',
    'psy-current-rating-and-isPsyker::dh2',
    'experience-available-derived::dh2',
    'wounds-fate-resources-roundtrip::dh2',
    'corruption-level-and-insanity-degrees::dh1',
    'subtlety-and-influence-roundtrip::dh2',
    'influence-clamps-to-percentile-ceiling::dh2',
    'roll-data-exposes-characteristic-keys::dh2',
] as const;

type FlowName = (typeof DATA_ACTOR_MODEL_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeActorModelFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async (flows: readonly string[]): Promise<{ flowsFired: Record<string, boolean>; flowNotes: Record<string, string> }> => {
                // Browser-side probe shapes. Foundry's runtime classes are not
                // typed in this spec; describe only the surface the probe touches.
                interface Characteristic {
                    total?: number;
                    bonus?: number;
                }
                interface Skill {
                    rank?: number;
                    trained?: boolean;
                    plus10?: boolean;
                    plus20?: boolean;
                    plus30?: boolean;
                    current?: number;
                }
                interface ProbeSystem {
                    characteristics?: Record<string, Characteristic>;
                    skills?: Record<string, Skill>;
                    movement?: { half?: number; full?: number; charge?: number; run?: number; leapHorizontal?: number; jump?: number };
                    lifting?: { lift?: number; push?: number };
                    fatigue?: { max?: number };
                    psy?: { currentRating?: number };
                    isPsyker?: boolean;
                    experience?: { available?: number };
                    wounds?: { max?: number; value?: number; critical?: number };
                    fate?: { max?: number; value?: number; threshold?: number };
                    corruptionLevel?: string;
                    insanityDegrees?: number;
                    subtlety?: { value?: number; max?: number };
                    influence?: number;
                }
                interface ProbeActor {
                    id?: string;
                    system?: ProbeSystem;
                    getRollData?: () => Record<string, number | string | boolean>;
                    delete?: () => Promise<void>;
                }
                interface ActorConstructor {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.create accepts a free-form document-creation payload (documented Record boundary in CLAUDE.md "Casting policy")
                    create?: (data: Record<string, unknown>) => Promise<ProbeActor | null>;
                }
                interface GameGlobal {
                    actors?: { get?: (id: string) => ProbeActor | undefined };
                }
                interface FoundryGlobal {
                    Actor?: ActorConstructor;
                    game?: GameGlobal;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's globalThis (Actor, game) is runtime-only and untyped in this spec
                const g = globalThis as unknown as FoundryGlobal;
                const ActorCls = g.Actor;
                const gameGlobal = g.game;

                const fired: Record<string, boolean> = {};
                const notes: Record<string, string> = {};
                for (const f of flows) fired[f] = false;

                if (ActorCls?.create == null) {
                    return {
                        flowsFired: fired,
                        flowNotes: { 'characteristic-total-and-bonus::dh2': 'Actor.create unavailable' },
                    };
                }

                // 5s per-call timeout so a blocking server write can't hang the
                // spec (mirrors weapon-attack.spec.ts).
                const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                    let timer: ReturnType<typeof setTimeout> | null = null;
                    const timeout = new Promise<T>((_, reject) => {
                        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                    });
                    try {
                        return await Promise.race([p, timeout]);
                    } finally {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- timer is set synchronously in the Promise executor; TS control-flow cannot track closure assignments
                        if (timer !== null) clearTimeout(timer);
                    }
                };

                const cleanups: Array<() => Promise<void>> = [];

                // Create one PC actor for the given system + initial system data.
                // Returns the live actor (re-fetched from game.actors so derived
                // data is fully prepared) or null.
                const createPc = async (
                    type: string,
                    gameSystem: string,
                    // eslint-disable-next-line no-restricted-syntax -- boundary: forwarded into Foundry's Actor.create document-creation payload (documented Record boundary in CLAUDE.md "Casting policy")
                    system: Record<string, unknown>,
                ): Promise<ProbeActor | null> => {
                    const create = ActorCls.create;
                    if (create == null) return null;
                    const created = await withTimeout(
                        create({ name: `data-actor-model-${gameSystem}`, type, system: { gameSystem, ...system } }),
                        5_000,
                        `${type} Actor.create`,
                    );
                    if (created?.id != null) {
                        const createdId = created.id;
                        cleanups.push(async () => {
                            try {
                                await gameGlobal?.actors?.get?.(createdId)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        // Yield a tick so the create write flushes before we read
                        // derived data (mirrors weapon-attack.spec.ts comment).
                        await new Promise((r) => {
                            setTimeout(r, 100);
                        });
                        return gameGlobal?.actors?.get?.(createdId) ?? created;
                    }
                    return null;
                };

                const note = (flow: string, msg: string): void => {
                    notes[flow] = msg;
                };

                // Each derived-data assertion is an independent probe. They are
                // extracted into named inner async helpers (called in sequence
                // below) so this callback's cyclomatic complexity stays low.
                // Every helper closes over `createPc`, `fired`, `note`, and
                // `withTimeout` from this callback scope.

                /* ============================================================
                 * Characteristic total + bonus (dh2 and im homologation).
                 * total = base + advance*5 + modifier - damage
                 * bonus = floor(total / 10)
                 * weaponSkill: base 30, advance 2, modifier 5  → total 45,
                 *   bonus 4. agility: base 38 → total 38, bonus 3.
                 * ============================================================ */
                const probeCharacteristicTotalAndBonus = async (): Promise<void> => {
                    for (const sys of [
                        { system: 'dh2', type: 'dh2-character', flow: 'characteristic-total-and-bonus::dh2' },
                        { system: 'im', type: 'im-character', flow: 'characteristic-total-and-bonus::im' },
                    ] as const) {
                        try {
                            const pc = await createPc(sys.type, sys.system, {
                                characteristics: {
                                    weaponSkill: { base: 30, advance: 2, modifier: 5 },
                                    agility: { base: 38 },
                                },
                            });
                            if (pc == null) {
                                note(sys.flow, `${sys.type} create returned null`);
                            } else {
                                const ws = pc.system?.characteristics?.weaponSkill;
                                const ag = pc.system?.characteristics?.agility;
                                const wsTotal = ws?.total ?? -1;
                                const wsBonus = ws?.bonus ?? -1;
                                const agTotal = ag?.total ?? -1;
                                const agBonus = ag?.bonus ?? -1;
                                if (wsTotal === 45 && wsBonus === 4 && agTotal === 38 && agBonus === 3) {
                                    fired[sys.flow] = true;
                                } else {
                                    note(sys.flow, `expected WS total=45 bonus=4 / Ag total=38 bonus=3, got WS ${wsTotal}/${wsBonus} Ag ${agTotal}/${agBonus}`);
                                }
                            }
                        } catch (err) {
                            note(sys.flow, `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }
                };

                /* ============================================================
                 * Unnatural multiplies the bonus. strength base 50 → total
                 * 50, baseModifier 5. unnatural 2 → bonus = 5 * 2 = 10.
                 * ============================================================ */
                const probeUnnaturalMultipliesBonus = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { strength: { base: 50, unnatural: 2 } },
                        });
                        if (pc == null) {
                            note('characteristic-unnatural-multiplies-bonus::dh2', 'create returned null');
                        } else {
                            const s = pc.system?.characteristics?.strength;
                            const total = s?.total ?? -1;
                            const bonus = s?.bonus ?? -1;
                            if (total === 50 && bonus === 10) {
                                fired['characteristic-unnatural-multiplies-bonus::dh2'] = true;
                            } else {
                                note('characteristic-unnatural-multiplies-bonus::dh2', `expected total=50 bonus=10 (5*2), got total=${total} bonus=${bonus}`);
                            }
                        }
                    } catch (err) {
                        note('characteristic-unnatural-multiplies-bonus::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Recoverable characteristic damage subtracts from total.
                 * toughness base 40, damage 7 → total 33, bonus floor(33/10)=3.
                 * ============================================================ */
                const probeDamageSubtracts = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { toughness: { base: 40, damage: 7 } },
                        });
                        if (pc == null) {
                            note('characteristic-damage-subtracts::dh2', 'create returned null');
                        } else {
                            const t = pc.system?.characteristics?.toughness;
                            const total = t?.total ?? -1;
                            const bonus = t?.bonus ?? -1;
                            if (total === 33 && bonus === 3) {
                                fired['characteristic-damage-subtracts::dh2'] = true;
                            } else {
                                note('characteristic-damage-subtracts::dh2', `expected total=33 (40-7) bonus=3, got total=${total} bonus=${bonus}`);
                            }
                        }
                    } catch (err) {
                        note('characteristic-damage-subtracts::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Skill rank → boolean flags. With no origin-path items,
                 * originRank = 0, so effectiveRank = min(advance, 4).
                 * dodge.advance = 3 → rank 3 → trained & plus10 & plus20 true,
                 * plus30 false.
                 * ============================================================ */
                const probeSkillRankFlags = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            skills: { dodge: { advance: 3 } },
                        });
                        if (pc == null) {
                            note('skill-rank-flags::dh2', 'create returned null');
                        } else {
                            const d = pc.system?.skills?.dodge;
                            const rank = d?.rank ?? -1;
                            const ok = rank === 3 && d?.trained === true && d.plus10 === true && d.plus20 === true && d.plus30 === false;
                            if (ok) {
                                fired['skill-rank-flags::dh2'] = true;
                            } else {
                                note(
                                    'skill-rank-flags::dh2',
                                    `expected rank=3 trained/plus10/plus20=true plus30=false, got rank=${rank} t=${String(d?.trained)} p10=${String(
                                        d?.plus10,
                                    )} p20=${String(d?.plus20)} p30=${String(d?.plus30)}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('skill-rank-flags::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Untrained skill baseValue divergence by system.
                 *   Aptitude systems (bc, dh2, ow, im): untrained skill
                 *     current = charTotal - 20.
                 *   Career systems (dh1, dw, rt): untrained skill current
                 *     = floor(charTotal / 2).
                 * dodge is an Ag-keyed skill in every system. Set agility
                 * base = 40 (total 40, no advance on the skill so it is
                 * untrained: rank 0). Aptitude → current 20; career → 20 as
                 * well at total 40, so use agility base = 45 to disambiguate:
                 *   aptitude: 45 - 20 = 25
                 *   career:   floor(45 / 2) = 22
                 * trainingBonus = 0 (rank 0) and skill.bonus = 0.
                 * ============================================================ */
                const probeAptitudeUntrained = async (): Promise<void> => {
                    const aptitudeSystems = [
                        { system: 'dh2', type: 'dh2-character', flow: 'skill-current-aptitude-untrained::dh2' },
                        { system: 'bc', type: 'bc-character', flow: 'skill-current-aptitude-untrained::bc' },
                        { system: 'ow', type: 'ow-character', flow: 'skill-current-aptitude-untrained::ow' },
                        { system: 'im', type: 'im-character', flow: 'skill-current-aptitude-untrained::im' },
                    ] as const;
                    for (const sys of aptitudeSystems) {
                        try {
                            const pc = await createPc(sys.type, sys.system, {
                                characteristics: { agility: { base: 45 } },
                            });
                            if (pc == null) {
                                note(sys.flow, `${sys.type} create returned null`);
                            } else {
                                const dodge = pc.system?.skills?.dodge;
                                const current = dodge?.current ?? -999;
                                const rank = dodge?.rank ?? -1;
                                if (rank === 0 && current === 25) {
                                    fired[sys.flow] = true;
                                } else {
                                    note(sys.flow, `expected untrained dodge current=25 (45-20) rank=0, got current=${current} rank=${rank}`);
                                }
                            }
                        } catch (err) {
                            note(sys.flow, `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }
                };

                const probeCareerUntrained = async (): Promise<void> => {
                    const careerSystems = [
                        { system: 'rt', type: 'rt-character', flow: 'skill-current-career-untrained::rt' },
                        { system: 'dh1', type: 'dh1-character', flow: 'skill-current-career-untrained::dh1' },
                        { system: 'dw', type: 'dw-character', flow: 'skill-current-career-untrained::dw' },
                    ] as const;
                    for (const sys of careerSystems) {
                        try {
                            const pc = await createPc(sys.type, sys.system, {
                                characteristics: { agility: { base: 45 } },
                            });
                            if (pc == null) {
                                note(sys.flow, `${sys.type} create returned null`);
                            } else {
                                const dodge = pc.system?.skills?.dodge;
                                const current = dodge?.current ?? -999;
                                const rank = dodge?.rank ?? -1;
                                // floor(45 / 2) = 22
                                if (rank === 0 && current === 22) {
                                    fired[sys.flow] = true;
                                } else {
                                    note(sys.flow, `expected untrained dodge current=22 (floor(45/2)) rank=0, got current=${current} rank=${rank}`);
                                }
                            }
                        } catch (err) {
                            note(sys.flow, `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }
                };

                /* ============================================================
                 * A trained skill uses the full characteristic total (not the
                 * untrained reduction), plus the per-rank training bonus.
                 * dodge.advance = 2 → rank 2, agility base 40 → total 40.
                 * baseValue = charTotal = 40 (rank > 0), trainingBonus = 10
                 * (rank 2) → current = 50.
                 * ============================================================ */
                const probeTrainedUsesFullCharacteristic = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { agility: { base: 40 } },
                            skills: { dodge: { advance: 2 } },
                        });
                        if (pc == null) {
                            note('skill-trained-uses-full-characteristic::dh2', 'create returned null');
                        } else {
                            const dodge = pc.system?.skills?.dodge;
                            const current = dodge?.current ?? -999;
                            const rank = dodge?.rank ?? -1;
                            if (rank === 2 && current === 50) {
                                fired['skill-trained-uses-full-characteristic::dh2'] = true;
                            } else {
                                note(
                                    'skill-trained-uses-full-characteristic::dh2',
                                    `expected rank=2 current=50 (40 charTotal + 10 trainingBonus), got rank=${rank} current=${current}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('skill-trained-uses-full-characteristic::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Movement derives from Agility Bonus + size.
                 * agility base 40 → AB 4. size 4 → baseMove = 4 + 4 - 4 = 4.
                 * half 4, full 8, charge 12, run 24.
                 * ============================================================ */
                const probeMovement = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { agility: { base: 40 } },
                            size: 4,
                        });
                        if (pc == null) {
                            note('movement-derives-from-ab-and-size::dh2', 'create returned null');
                        } else {
                            const m = pc.system?.movement;
                            const ok = m?.half === 4 && m.full === 8 && m.charge === 12 && m.run === 24;
                            if (ok) {
                                fired['movement-derives-from-ab-and-size::dh2'] = true;
                            } else {
                                note(
                                    'movement-derives-from-ab-and-size::dh2',
                                    `expected half/full/charge/run = 4/8/12/24, got ${m?.half}/${m?.full}/${m?.charge}/${m?.run}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('movement-derives-from-ab-and-size::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Leap / jump / lifting derive from Strength Bonus.
                 * strength base 40 → SB 4. leapHorizontal = SB = 4;
                 * jump = SB*20 = 80; lifting.lift = SB*9 = 36;
                 * lifting.push = SB*18 = 72.
                 * ============================================================ */
                const probeLiftingAndLeap = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { strength: { base: 40 } },
                        });
                        if (pc == null) {
                            note('lifting-and-leap-from-strength-bonus::dh2', 'create returned null');
                        } else {
                            const mv = pc.system?.movement;
                            const lift = pc.system?.lifting;
                            const ok = mv?.leapHorizontal === 4 && mv.jump === 80 && lift?.lift === 36 && lift.push === 72;
                            if (ok) {
                                fired['lifting-and-leap-from-strength-bonus::dh2'] = true;
                            } else {
                                note(
                                    'lifting-and-leap-from-strength-bonus::dh2',
                                    `expected leapH=4 jump=80 lift=36 push=72, got leapH=${mv?.leapHorizontal} jump=${mv?.jump} lift=${lift?.lift} push=${lift?.push}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('lifting-and-leap-from-strength-bonus::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Fatigue max derives from Toughness Bonus when stored max
                 * is 0 (the schema default). toughness base 45 → TB 4 →
                 * fatigue.max = 4.
                 * ============================================================ */
                const probeFatigue = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { toughness: { base: 45 } },
                        });
                        if (pc == null) {
                            note('fatigue-max-from-toughness-bonus::dh2', 'create returned null');
                        } else {
                            const fatigueMax = pc.system?.fatigue?.max ?? -1;
                            if (fatigueMax === 4) {
                                fired['fatigue-max-from-toughness-bonus::dh2'] = true;
                            } else {
                                note('fatigue-max-from-toughness-bonus::dh2', `expected fatigue.max=4 (TB of toughness 45), got ${fatigueMax}`);
                            }
                        }
                    } catch (err) {
                        note('fatigue-max-from-toughness-bonus::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Psy current rating + isPsyker. rating 4, sustained 1 →
                 * currentRating = 3; isPsyker true (rating > 0).
                 * ============================================================ */
                const probePsy = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            psy: { rating: 4, sustained: 1 },
                        });
                        if (pc == null) {
                            note('psy-current-rating-and-isPsyker::dh2', 'create returned null');
                        } else {
                            const currentRating = pc.system?.psy?.currentRating ?? -999;
                            const isPsyker = pc.system?.isPsyker ?? false;
                            if (currentRating === 3 && isPsyker) {
                                fired['psy-current-rating-and-isPsyker::dh2'] = true;
                            } else {
                                note(
                                    'psy-current-rating-and-isPsyker::dh2',
                                    `expected currentRating=3 isPsyker=true, got currentRating=${currentRating} isPsyker=${String(isPsyker)}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('psy-current-rating-and-isPsyker::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Experience available = total - used.
                 * total 1000, used 350 → available 650.
                 * ============================================================ */
                const probeExperience = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            experience: { total: 1000, used: 350 },
                        });
                        if (pc == null) {
                            note('experience-available-derived::dh2', 'create returned null');
                        } else {
                            const available = pc.system?.experience?.available ?? -999;
                            if (available === 650) {
                                fired['experience-available-derived::dh2'] = true;
                            } else {
                                note('experience-available-derived::dh2', `expected available=650 (1000-350), got ${available}`);
                            }
                        }
                    } catch (err) {
                        note('experience-available-derived::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Wounds / fate / fate.threshold round-trip through the
                 * woundsField / fate SchemaField. With no origin-path wound
                 * formula, _computeWoundsMax leaves the stored max intact.
                 * ============================================================ */
                const probeWoundsFate = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            wounds: { max: 14, value: 9, critical: 2 },
                            fate: { max: 3, value: 2, threshold: 1 },
                        });
                        if (pc == null) {
                            note('wounds-fate-resources-roundtrip::dh2', 'create returned null');
                        } else {
                            const w = pc.system?.wounds;
                            const f = pc.system?.fate;
                            const ok = w?.max === 14 && w.value === 9 && w.critical === 2 && f?.max === 3 && f.value === 2 && f.threshold === 1;
                            if (ok) {
                                fired['wounds-fate-resources-roundtrip::dh2'] = true;
                            } else {
                                note(
                                    'wounds-fate-resources-roundtrip::dh2',
                                    `expected wounds 14/9/2 fate 3/2/1, got wounds ${w?.max}/${w?.value}/${w?.critical} fate ${f?.max}/${f?.value}/${f?.threshold}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('wounds-fate-resources-roundtrip::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * corruptionLevel + insanityDegrees getters (CharacterData).
                 * Driven on a DH1 character (the canonical corruption/insanity
                 * system, complementing per-system-flows.spec.ts which only
                 * asserts the raw scalar persists). corruption 65 → 'corrupted'
                 * (>=60, <90); insanity 34 → insanityDegrees floor(34/10)=3.
                 * ============================================================ */
                const probeCorruptionAndInsanity = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh1-character', 'dh1', {
                            corruption: 65,
                            insanity: 34,
                        });
                        if (pc == null) {
                            note('corruption-level-and-insanity-degrees::dh1', 'create returned null');
                        } else {
                            const level = pc.system?.corruptionLevel ?? null;
                            const degrees = pc.system?.insanityDegrees ?? -1;
                            if (level === 'corrupted' && degrees === 3) {
                                fired['corruption-level-and-insanity-degrees::dh1'] = true;
                            } else {
                                note(
                                    'corruption-level-and-insanity-degrees::dh1',
                                    `expected corruptionLevel='corrupted' insanityDegrees=3, got level=${level} degrees=${degrees}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('corruption-level-and-insanity-degrees::dh1', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Subtlety + influence SchemaField round-trip.
                 * subtlety { value 40, max 80 }, influence 55 all persist
                 * (none clamped — within range).
                 * ============================================================ */
                const probeSubtletyAndInfluence = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            subtlety: { value: 40, max: 80 },
                            influence: 55,
                        });
                        if (pc == null) {
                            note('subtlety-and-influence-roundtrip::dh2', 'create returned null');
                        } else {
                            const sub = pc.system?.subtlety;
                            const inf = pc.system?.influence ?? -1;
                            if (sub?.value === 40 && sub.max === 80 && inf === 55) {
                                fired['subtlety-and-influence-roundtrip::dh2'] = true;
                            } else {
                                note(
                                    'subtlety-and-influence-roundtrip::dh2',
                                    `expected subtlety 40/80 influence 55, got subtlety ${sub?.value}/${sub?.max} influence ${inf}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('subtlety-and-influence-roundtrip::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * Influence clamps to the 0..100 percentile ceiling
                 * (NumberField max: 100). Writing 150 must come back as 100.
                 * ============================================================ */
                const probeInfluenceClamp = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            influence: 150,
                        });
                        if (pc == null) {
                            note('influence-clamps-to-percentile-ceiling::dh2', 'create returned null');
                        } else {
                            const inf = pc.system?.influence ?? -1;
                            if (inf === 100) {
                                fired['influence-clamps-to-percentile-ceiling::dh2'] = true;
                            } else {
                                note('influence-clamps-to-percentile-ceiling::dh2', `expected influence clamped to 100, got ${inf}`);
                            }
                        }
                    } catch (err) {
                        note('influence-clamps-to-percentile-ceiling::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                /* ============================================================
                 * getRollData exposes characteristic short keys, the
                 * <short>B bonus key, and `pr` (psy rating).
                 * weaponSkill base 40 → WS total 40, bonus 4. psy.rating 5.
                 * data.WS = 40, data.WSB = 4, data.weaponSkill = 40,
                 * data.pr = 5.
                 * ============================================================ */
                const probeRollData = async (): Promise<void> => {
                    try {
                        const pc = await createPc('dh2-character', 'dh2', {
                            characteristics: { weaponSkill: { base: 40 } },
                            psy: { rating: 5 },
                        });
                        if (pc == null) {
                            note('roll-data-exposes-characteristic-keys::dh2', 'create returned null');
                        } else if (typeof pc.getRollData !== 'function') {
                            note('roll-data-exposes-characteristic-keys::dh2', 'actor.getRollData missing');
                        } else {
                            const getRollData = pc.getRollData;
                            const data = await withTimeout(Promise.resolve(getRollData()), 5_000, 'getRollData');
                            const ws = data['WS'];
                            const wsb = data['WSB'];
                            const full = data['weaponSkill'];
                            const pr = data['pr'];
                            if (ws === 40 && wsb === 4 && full === 40 && pr === 5) {
                                fired['roll-data-exposes-characteristic-keys::dh2'] = true;
                            } else {
                                note(
                                    'roll-data-exposes-characteristic-keys::dh2',
                                    `expected WS=40 WSB=4 weaponSkill=40 pr=5, got WS=${String(ws)} WSB=${String(wsb)} weaponSkill=${String(full)} pr=${String(
                                        pr,
                                    )}`,
                                );
                            }
                        }
                    } catch (err) {
                        note('roll-data-exposes-characteristic-keys::dh2', `flow threw: ${err instanceof Error ? err.message : String(err)}`);
                    }
                };

                try {
                    await probeCharacteristicTotalAndBonus();
                    await probeUnnaturalMultipliesBonus();
                    await probeDamageSubtracts();
                    await probeSkillRankFlags();
                    await probeAptitudeUntrained();
                    await probeCareerUntrained();
                    await probeTrainedUsesFullCharacteristic();
                    await probeMovement();
                    await probeLiftingAndLeap();
                    await probeFatigue();
                    await probePsy();
                    await probeExperience();
                    await probeWoundsFate();
                    await probeCorruptionAndInsanity();
                    await probeSubtletyAndInfluence();
                    await probeInfluenceClamp();
                    await probeRollData();
                } finally {
                    for (const fn of cleanups) {
                        try {
                            await fn();
                        } catch {
                            /* ignore */
                        }
                    }
                }

                return { flowsFired: fired, flowNotes: notes };
            },
            DATA_ACTOR_MODEL_FLOWS,
        );

        return {
            flowsFired: result.flowsFired,
            flowNotes: result.flowNotes,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('actor DataModel derived-data pipeline (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('creature/character schema round-trips and derived data computes across game systems', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeActorModelFlows(page);

        const failures: string[] = [];
        for (const flow of DATA_ACTOR_MODEL_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('data-actor-model.flow', flow);
            } else {
                const detail = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${detail}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${DATA_ACTOR_MODEL_FLOWS.length} actor-model probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
