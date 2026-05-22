import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the *fifth* batch of pure-logic modules under
 * `src/module/rules/*` — the tactical / registry resolvers (aim,
 * altitude, attack-specials, explication, medicae-mechadendrite,
 * combat-actions, daemon-weapon, daemonhost) that none of the prior
 * rules-*.spec.ts batches touch. Several of these modules ship NO
 * vitest unit test, so they were at 0% coverage on every surface
 * before this spec landed. This spec dynamic-imports each module and
 * drives its side-effect-free entry points / registry exports against
 * synthetic inputs so the v8 coverage capture lights up every export.
 *
 * Each flow records `rule-tactical.flow::<name>`. Keys MUST match the
 * RULE_TACTICAL_FLOWS constant in scripts/e2e-coverage.mjs — that is
 * the coverage denominator and must agree with the recordCoverage keys
 * here.
 */

const RULE_TACTICAL_FLOWS = [
    'aim-modifiers',
    'aim-calculateBonus',
    'altitude-canChange',
    'altitude-profiles',
    'attack-specials-list',
    'attack-specials-names',
    'explication-breakthroughsCrossed',
    'explication-isComplete',
    'medicae-mechadendrite-data',
    'combat-actions-all',
    'daemon-weapon-profiles',
    'daemonhost-tiers',
] as const;

type FlowName = (typeof RULE_TACTICAL_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeRules(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            // Browser-side probe: each module under test is dynamic-imported at
            // runtime from the deployed system. Its export shape is supplied per
            // call site as the generic parameter to loadModule, so accesses are
            // narrowly typed without importing build-time types into the bundle.
            type ImportFailure = { __importError: string };
            type Loaded<T> = T | ImportFailure;
            const hasImportError = <T extends object>(mod: Loaded<T>): mod is ImportFailure => '__importError' in mod && typeof mod.__importError === 'string';

            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/rules`;
            const loadModule = async <T>(name: string): Promise<Loaded<T>> => {
                try {
                    return (await import(`${base}/${name}.js`)) as T;
                } catch (err) {
                    return { __importError: String(err instanceof Error ? err.message : String(err)) };
                }
            };
            const guarded = (name: FlowName, fn: () => boolean): void => {
                try {
                    record(name, fn(), null);
                } catch (err) {
                    record(name, false, String(err instanceof Error ? err.message : String(err)));
                }
            };
            const fail = (keys: readonly FlowName[], detail: string): void => {
                for (const k of keys) record(k, false, detail);
            };
            const isPopulatedObject = (v: object | null | undefined): boolean =>
                v !== null && v !== undefined && typeof v === 'object' && Object.keys(v).length > 0;

            // Per-module export shapes (only the surfaces this probe touches).
            interface AltitudeProfile {
                rangedAttackModifier: number;
            }
            interface AimModule {
                aimModifiers: () => Record<number, string>;
                calculateAimBonus: (rollData: { weapon?: { name: string }; power?: { name: string } }) => void;
            }
            interface AltitudeModule {
                canChangeAltitude: (from: string, to: string) => boolean;
                ALTITUDE_PROFILES: Record<string, AltitudeProfile | undefined>;
            }
            interface AttackSpecialsModule {
                attackSpecials: () => Array<{ name?: string; hasLevel?: boolean }>;
                attackSpecialsNames: () => string[];
            }
            interface ExplicationModule {
                breakthroughsCrossed: (o: { complexity: string; oldDoS: number; newDoS: number }) => number;
                isExplicationComplete: (o: { target: string; objective: string; complexity: string; accumulatedDoS: number }) => boolean;
                EXPLICATION_THRESHOLDS: Record<string, number>;
            }
            interface MedicaeModule {
                MEDICAE_MECHADENDRITE: object;
            }
            interface CombatActionsModule {
                allCombatActions: () => Array<{ name?: string }>;
            }
            interface DaemonWeaponModule {
                BINDING_STRENGTH_PROFILES: object;
                DAEMON_PERSONALITY_TRIGGERS: object;
            }
            interface DaemonhostModule {
                DAEMONHOST_TIERS: object;
            }

            // ---------- aim ----------
            const aim = await loadModule<AimModule>('aim');
            if (hasImportError(aim)) {
                fail(['aim-modifiers', 'aim-calculateBonus'], aim.__importError);
            } else {
                guarded('aim-modifiers', () => {
                    const m = aim.aimModifiers();
                    return isPopulatedObject(m) && m[10] === 'Half (+10)' && m[20] === 'Full (+20)';
                });
                guarded('aim-calculateBonus', () => {
                    // Side-effecting no-op over rollData; the coverage value
                    // is the call itself completing without throwing.
                    aim.calculateAimBonus({ weapon: { name: 'probe' } });
                    aim.calculateAimBonus({ power: { name: 'probe' } });
                    return true;
                });
            }

            // ---------- altitude ----------
            const altitude = await loadModule<AltitudeModule>('altitude');
            if (hasImportError(altitude)) {
                fail(['altitude-canChange', 'altitude-profiles'], altitude.__importError);
            } else {
                guarded('altitude-canChange', () => {
                    return (
                        altitude.canChangeAltitude('ground', 'ground') &&
                        altitude.canChangeAltitude('ground', 'low') &&
                        !altitude.canChangeAltitude('ground', 'orbital')
                    );
                });
                guarded('altitude-profiles', () => {
                    const p = altitude.ALTITUDE_PROFILES;
                    return isPopulatedObject(p) && p.ground?.rangedAttackModifier === 0 && p.orbital?.rangedAttackModifier === -60;
                });
            }

            // ---------- attack-specials ----------
            const attackSpecials = await loadModule<AttackSpecialsModule>('attack-specials');
            if (hasImportError(attackSpecials)) {
                fail(['attack-specials-list', 'attack-specials-names'], attackSpecials.__importError);
            } else {
                guarded('attack-specials-list', () => {
                    const list = attackSpecials.attackSpecials();
                    const first = list[0];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- list[0] is T|undefined under noUncheckedIndexedAccess (tsconfig.json); the eslint parser project (tsconfig.test.json) has it off, so the ?. it requires reads as unnecessary here.
                    return Array.isArray(list) && list.length > 0 && typeof first?.name === 'string' && typeof first.hasLevel === 'boolean';
                });
                guarded('attack-specials-names', () => {
                    const names = attackSpecials.attackSpecialsNames();
                    return Array.isArray(names) && names.includes('Accurate') && names.includes('Blast');
                });
            }

            // ---------- explication ----------
            const explication = await loadModule<ExplicationModule>('explication');
            if (hasImportError(explication)) {
                fail(['explication-breakthroughsCrossed', 'explication-isComplete'], explication.__importError);
            } else {
                guarded('explication-breakthroughsCrossed', () => {
                    const none = explication.breakthroughsCrossed({ complexity: 'standard', oldDoS: 0, newDoS: 0 });
                    const some = explication.breakthroughsCrossed({ complexity: 'standard', oldDoS: 0, newDoS: 25 });
                    return none === 0 && some >= 1 && explication.EXPLICATION_THRESHOLDS.standard === 25;
                });
                guarded('explication-isComplete', () => {
                    const done = explication.isExplicationComplete({ target: 't', objective: 'eradication', complexity: 'minor', accumulatedDoS: 999 });
                    const notDone = explication.isExplicationComplete({ target: 't', objective: 'eradication', complexity: 'minor', accumulatedDoS: 0 });
                    return done && !notDone;
                });
            }

            // ---------- medicae-mechadendrite ----------
            const medicae = await loadModule<MedicaeModule>('medicae-mechadendrite');
            if (hasImportError(medicae)) {
                fail(['medicae-mechadendrite-data'], medicae.__importError);
            } else {
                guarded('medicae-mechadendrite-data', () => isPopulatedObject(medicae.MEDICAE_MECHADENDRITE));
            }

            // ---------- combat-actions ----------
            const combatActions = await loadModule<CombatActionsModule>('combat-actions');
            if (hasImportError(combatActions)) {
                fail(['combat-actions-all'], combatActions.__importError);
            } else {
                guarded('combat-actions-all', () => {
                    const all = combatActions.allCombatActions();
                    const first = all[0];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- all[0] is T|undefined under noUncheckedIndexedAccess (tsconfig.json); the eslint parser project (tsconfig.test.json) has it off, so the ?. it requires reads as unnecessary here.
                    return Array.isArray(all) && all.length > 0 && typeof first?.name === 'string' && all.some((a) => a.name === 'Standard Attack');
                });
            }

            // ---------- daemon-weapon ----------
            const daemonWeapon = await loadModule<DaemonWeaponModule>('daemon-weapon');
            if (hasImportError(daemonWeapon)) {
                fail(['daemon-weapon-profiles'], daemonWeapon.__importError);
            } else {
                guarded(
                    'daemon-weapon-profiles',
                    () => isPopulatedObject(daemonWeapon.BINDING_STRENGTH_PROFILES) && isPopulatedObject(daemonWeapon.DAEMON_PERSONALITY_TRIGGERS),
                );
            }

            // ---------- daemonhost ----------
            const daemonhost = await loadModule<DaemonhostModule>('daemonhost');
            if (hasImportError(daemonhost)) {
                fail(['daemonhost-tiers'], daemonhost.__importError);
            } else {
                guarded('daemonhost-tiers', () => isPopulatedObject(daemonhost.DAEMONHOST_TIERS));
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rules pure-logic surface — batch 5 tactical (Tier B)', () => {
    test('every tactical / registry resolver returns the expected value without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rule-tactical.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of RULE_TACTICAL_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${RULE_TACTICAL_FLOWS.length} rules tactical flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
