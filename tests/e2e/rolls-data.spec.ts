import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the roll-data plumbing in `src/module/rolls/*` and
 * the d100 roll dispatcher in `src/module/dice/d100-roll.ts`. These
 * modules were largely uncovered before this spec because the
 * weapon-attack / roll-methods specs route through Actor methods that
 * never reach them in headless mode (no canvas, no token selection, no
 * chat-card post-render).
 *
 * Modules exercised (pre-spec line / fn coverage):
 *   - `assign-damage-data.ts` (25.4% / 0%) — `AssignDamageData`
 *     constructor + `update()` (location-armour resolution branch) +
 *     `finalize()` (full reduction → wounds/critical/fatigue allocator
 *     branch matrix).
 *   - `force-field-data.ts` (28.2% / 0%) — `ForceFieldData` constructor
 *     + `craftsmanshipToOverload()` (every choice in the switch) +
 *     `finalize()` (rolls 1d100, evaluates success/overload thresholds).
 *   - `d100-roll.ts` (51.7% / 9.5%) — `D100Roll.test()` static entry
 *     point with a known formula so the chat-template render branch is
 *     exercised end-to-end.
 *
 * Each flow records under `roll-data.flow`. Keys MUST match the
 * ROLL_DATA_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const ROLL_DATA_FLOWS = [
    'assign-damage-constructor',
    'assign-damage-update-armour-resolved',
    'assign-damage-finalize-reduces-wounds',
    'assign-damage-finalize-empty-wounds-criticals',
    'assign-damage-finalize-fatigue',
    'force-field-constructor',
    'force-field-craftsmanship-overload',
    'force-field-finalize',
    'd100-roll-test',
] as const;

type FlowName = (typeof ROLL_DATA_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeRollsData(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            // Browser-side probe: the modules under test are dynamic-imported at
            // runtime from the deployed system, so their shapes are declared here
            // rather than imported from src/ (which would pull build-time types
            // into a page.evaluate bundle that has no module resolution).
            interface FakeActorSystem {
                armour?: Record<string, { value: number; toughnessBonus: number }>;
                wounds?: { value: number; critical: number };
                fatigue?: { value: number };
            }
            interface FakeActor {
                system: FakeActorSystem;
                hasTalent?: () => boolean;
                update: () => Promise<void>;
                createEmbeddedDocuments?: () => Promise<never[]>;
            }
            interface AssignDamageInstance {
                armour: number;
                tb: number;
                hasDamage: boolean;
                damageTaken: number;
                hasCriticalDamage: boolean;
                criticalDamageTaken: number;
                hasFatigueDamage: boolean;
                fatigueTaken: number;
                update: () => void;
                finalize: () => Promise<void>;
            }
            interface AssignDamageOptions {
                location: string;
                damageType: string;
                totalDamage: number;
                totalPenetration: number;
                totalFatigue: number;
            }
            interface AssignDamageCtor {
                new (actor: FakeActor, options: AssignDamageOptions): AssignDamageInstance;
            }
            interface ForceFieldInstance {
                protectionRating: number;
                overloadRating: number;
                success: boolean;
                roll: { total: number } | null;
                craftsmanshipToOverload: (craftsmanship: string) => number;
                finalize: () => Promise<void>;
            }
            interface FakeForceFieldSystem {
                protectionRating: number;
                craftsmanship: string;
            }
            interface FakeForceField {
                system: FakeForceFieldSystem;
                update: (data: Partial<{ system: Partial<FakeForceFieldSystem> }>) => Promise<FakeForceField>;
            }
            interface ForceFieldCtor {
                new (actor: FakeActor, item: FakeForceField): ForceFieldInstance;
            }
            interface D100RollResult {
                total?: number;
            }
            interface D100RollClass {
                test: (options: { target: number; flavor: string; fastForward: boolean }) => Promise<D100RollResult | null>;
            }

            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module`;

            // ---------- assign-damage-data ----------
            async function probeAssignDamage(): Promise<void> {
                let assignMod: { AssignDamageData: AssignDamageCtor } | null = null;
                try {
                    assignMod = (await import(`${base}/rolls/assign-damage-data.js`)) as { AssignDamageData: AssignDamageCtor };
                } catch (err) {
                    for (const f of ROLL_DATA_FLOWS.filter((k) => k.startsWith('assign-damage-')))
                        record(f, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                    assignMod = null;
                }
                if (assignMod != null) {
                    const { AssignDamageData } = assignMod;
                    const buildActor = (woundsValue: number): FakeActor => ({
                        system: {
                            armour: {
                                BODY: { value: 5, toughnessBonus: 3 },
                                HEAD: { value: 3, toughnessBonus: 3 },
                            },
                            wounds: { value: woundsValue, critical: 0 },
                            fatigue: { value: 0 },
                        },
                        hasTalent: () => false,
                        update: async () => {
                            await Promise.resolve();
                        },
                        createEmbeddedDocuments: async () => {
                            await Promise.resolve();
                            return [];
                        },
                    });

                    // ctor
                    try {
                        const ad = new AssignDamageData(buildActor(10), {
                            location: 'BODY',
                            damageType: 'impact',
                            totalDamage: 0,
                            totalPenetration: 0,
                            totalFatigue: 0,
                        });
                        record('assign-damage-constructor', ad instanceof AssignDamageData, null);
                    } catch (err) {
                        record('assign-damage-constructor', false, err instanceof Error ? err.message : String(err));
                    }

                    // update — drives the location-armour lookup loop branch.
                    try {
                        const ad = new AssignDamageData(buildActor(10), {
                            location: 'BODY',
                            damageType: 'impact',
                            totalDamage: 10,
                            totalPenetration: 0,
                            totalFatigue: 0,
                        });
                        ad.update();
                        record('assign-damage-update-armour-resolved', ad.armour === 5 && ad.tb === 3, `armour=${ad.armour} tb=${ad.tb}`);
                    } catch (err) {
                        record('assign-damage-update-armour-resolved', false, err instanceof Error ? err.message : String(err));
                    }

                    // finalize — wounds reduced when damage > armour+tb but ≤ wounds.
                    try {
                        const ad = new AssignDamageData(buildActor(10), {
                            location: 'BODY',
                            damageType: 'impact',
                            totalDamage: 12,
                            totalPenetration: 0,
                            totalFatigue: 0,
                        });
                        ad.update();
                        await ad.finalize();
                        // 12 damage - (5 armour + 3 tb) = 4 damage; actor has 10 wounds → all 4 to wounds.
                        record(
                            'assign-damage-finalize-reduces-wounds',
                            ad.hasDamage && ad.damageTaken === 4,
                            `damageTaken=${ad.damageTaken} hasDamage=${ad.hasDamage}`,
                        );
                    } catch (err) {
                        record('assign-damage-finalize-reduces-wounds', false, err instanceof Error ? err.message : String(err));
                    }

                    // finalize — wounds already 0 routes through the "critical"
                    // branch.
                    try {
                        const ad = new AssignDamageData(buildActor(0), {
                            location: 'BODY',
                            damageType: 'impact',
                            totalDamage: 12,
                            totalPenetration: 0,
                            totalFatigue: 0,
                        });
                        ad.update();
                        await ad.finalize();
                        record(
                            'assign-damage-finalize-empty-wounds-criticals',
                            ad.hasCriticalDamage && ad.criticalDamageTaken === 4,
                            `hasCrit=${ad.hasCriticalDamage} crit=${ad.criticalDamageTaken}`,
                        );
                    } catch (err) {
                        record('assign-damage-finalize-empty-wounds-criticals', false, err instanceof Error ? err.message : String(err));
                    }

                    // finalize — fatigue accumulator path.
                    try {
                        const ad = new AssignDamageData(buildActor(10), {
                            location: 'BODY',
                            damageType: 'impact',
                            totalDamage: 5,
                            totalPenetration: 0,
                            totalFatigue: 3,
                        });
                        ad.update();
                        await ad.finalize();
                        record(
                            'assign-damage-finalize-fatigue',
                            ad.hasFatigueDamage && ad.fatigueTaken === 3,
                            `hasFatigue=${ad.hasFatigueDamage} fatigueTaken=${ad.fatigueTaken}`,
                        );
                    } catch (err) {
                        record('assign-damage-finalize-fatigue', false, err instanceof Error ? err.message : String(err));
                    }
                }
            }

            // ---------- force-field-data ----------
            async function probeForceField(): Promise<void> {
                let ffMod: { ForceFieldData: ForceFieldCtor } | null = null;
                try {
                    ffMod = (await import(`${base}/rolls/force-field-data.js`)) as { ForceFieldData: ForceFieldCtor };
                } catch (err) {
                    for (const f of ROLL_DATA_FLOWS.filter((k) => k.startsWith('force-field-')))
                        record(f, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                    ffMod = null;
                }
                if (ffMod != null) {
                    const { ForceFieldData } = ffMod;

                    const fakeActor: FakeActor = {
                        system: {},
                        update: async () => {
                            await Promise.resolve();
                        },
                    };
                    // fakeFFShared must be declared before buildFF so the closure captures the reference
                    // rather than the undefined value — reassigned below after buildFF is defined.
                    // eslint-disable-next-line prefer-const -- closure forward-reference requires let
                    let fakeFFShared: FakeForceField;
                    const buildFF = (craftsmanship: string, rating: number): FakeForceField => ({
                        system: { protectionRating: rating, craftsmanship },
                        update: async (data: Partial<{ system: Partial<FakeForceFieldSystem> }>) => {
                            await Promise.resolve();
                            return Object.assign({}, fakeFFShared, { system: { ...fakeFFShared.system, ...data.system } });
                        },
                    });
                    fakeFFShared = buildFF('Common', 40);

                    try {
                        const ff = new ForceFieldData(fakeActor, fakeFFShared);
                        record(
                            'force-field-constructor',
                            ff instanceof ForceFieldData && ff.protectionRating === 40 && ff.overloadRating === 10,
                            `pr=${ff.protectionRating} or=${ff.overloadRating}`,
                        );
                    } catch (err) {
                        record('force-field-constructor', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        // Exercise every craftsmanship branch.
                        const ff = new ForceFieldData(fakeActor, buildFF('Common', 30));
                        const poor = ff.craftsmanshipToOverload('Poor');
                        const common = ff.craftsmanshipToOverload('Common');
                        const good = ff.craftsmanshipToOverload('Good');
                        const dflt = ff.craftsmanshipToOverload('Best');
                        const ok = poor === 15 && common === 10 && good === 5 && dflt === 1;
                        record('force-field-craftsmanship-overload', ok, `poor=${poor} common=${common} good=${good} default=${dflt}`);
                    } catch (err) {
                        record('force-field-craftsmanship-overload', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        const ff = new ForceFieldData(fakeActor, buildFF('Common', 100));
                        await ff.finalize();
                        // With protectionRating=100, success should be true (roll ≤ 100).
                        record('force-field-finalize', ff.success && ff.roll !== null, `success=${ff.success} roll=${ff.roll?.total}`);
                    } catch (err) {
                        record('force-field-finalize', false, err instanceof Error ? err.message : String(err));
                    }
                }
            }

            // ---------- d100-roll ----------
            async function probeD100Roll(): Promise<void> {
                let d100Mod: { default?: D100RollClass; D100Roll?: D100RollClass } | null = null;
                try {
                    d100Mod = (await import(`${base}/dice/d100-roll.js`)) as { default?: D100RollClass; D100Roll?: D100RollClass };
                } catch (err) {
                    record('d100-roll-test', false, `import: ${err instanceof Error ? err.message : String(err)}`);
                    d100Mod = null;
                }
                if (d100Mod != null) {
                    try {
                        // D100Roll.test() runs a simple d100 check + posts to chat.
                        // Suppress any dialog opening by passing fastForward.
                        const D100Roll = d100Mod.default ?? d100Mod.D100Roll;
                        if (typeof D100Roll?.test !== 'function') {
                            record('d100-roll-test', false, `D100Roll.test missing (keys: ${Object.keys(d100Mod).join(',')})`);
                        } else {
                            const result = await D100Roll.test({ target: 50, flavor: 'rolls-data-probe', fastForward: true });
                            // Accept any non-throwing result (null is fine — chat may
                            // not post in headless). The coverage win is the path
                            // executed up to the chat-create boundary.
                            record('d100-roll-test', true, `result type=${typeof result}`);
                        }
                    } catch (err) {
                        record('d100-roll-test', false, err instanceof Error ? err.message : String(err));
                    }
                }
            }

            await probeAssignDamage();
            await probeForceField();
            await probeD100Roll();

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rolls / dice data classes (Tier B)', () => {
    test('every rolls/* + d100-roll surface returns without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRollsData(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('roll-data.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of ROLL_DATA_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${ROLL_DATA_FLOWS.length} rolls-data flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
