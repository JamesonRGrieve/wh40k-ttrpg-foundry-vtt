import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of two utility modules at 0% function coverage
 * pre-spec — neither was reachable from any other Tier B test.
 *
 *   - `src/module/utils/prerequisite-validator.ts` (0% fn / 39.2% line)
 *     `checkPrerequisites` walks `Prerequisite[]` against an actor
 *     and returns per-failure reasons. Three prerequisite types
 *     (characteristic / skill / talent) each have valid + invalid
 *     branches. `parsePrerequisiteString` is a pure string→object
 *     parser used by advancement CSV ingest.
 *
 *   - `src/module/utils/roll-table-utils.ts` (0% fn / 45.2% line) —
 *     `RollTableUtils.findTableInCompendiums` + `rollTable` plus the
 *     domain wrappers (`rollPsychicPhenomena`, `rollPerilsOfTheWarp`,
 *     `rollMutation`, `rollMalignancy`, `rollNavigatorMutation`,
 *     `rollGiftOfTheGods`, `rollFearEffects`, `rollCriticalInjury`).
 *     Each looks up a compendium table by name and rolls; the test
 *     accepts a null return (table absent from the packed world)
 *     since the goal is coverage attribution, not roll outcome.
 *
 * Keep UTILS_VALIDATORS_FLOWS in sync with the equivalent constant
 * in scripts/e2e-coverage.mjs.
 */

const UTILS_VALIDATORS_FLOWS = [
    'prereq-parse-characteristic',
    'prereq-parse-skill',
    'prereq-parse-empty',
    'prereq-check-empty',
    'prereq-check-unmet-characteristic',
    'prereq-check-unmet-skill',
    'roll-table-findInCompendiums',
    'roll-table-rollPsychicPhenomena',
    'roll-table-rollPerilsOfTheWarp',
    'roll-table-rollMutation',
    'roll-table-rollMalignancy',
    'roll-table-rollNavigatorMutation',
    'roll-table-rollGiftOfTheGods',
    'roll-table-rollFearEffects',
    'roll-table-rollCriticalInjury',
] as const;

type FlowName = (typeof UTILS_VALIDATORS_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeUtilsValidators(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (pageErr: Error): void => {
        pageErrors.push(pageErr.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            interface ParsedPrereq {
                type?: string;
                key?: string;
                value?: number;
            }
            interface PrereqEntry {
                type: 'characteristic' | 'skill' | 'talent';
                key: string;
                value?: number;
            }
            interface PrereqCheckResult {
                valid?: boolean;
                unmet?: object[];
            }
            interface PrereqValidatorModule {
                parsePrerequisiteString?: (s: string) => ParsedPrereq | null;
                checkPrerequisites?: (actor: ProbeActor | undefined, prereqs: PrereqEntry[]) => PrereqCheckResult | undefined;
            }
            interface ProbeActor {
                id?: string;
                delete?: () => Promise<void>;
            }
            interface ActorClass {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.create accepts arbitrary creation data
                create?: (data: Record<string, unknown>) => Promise<ProbeActor | null | undefined>;
            }
            interface ActorsCollection {
                get?: (id: string) => ProbeActor | undefined;
            }
            interface RollOutcome {
                total?: number;
                results?: object[];
            }
            interface RollTableUtilsCls {
                findTableInCompendiums?: (name: string) => Promise<object | null>;
                rollPsychicPhenomena?: (actor: object, n: number) => Promise<RollOutcome | null>;
                rollPerilsOfTheWarp?: (actor: object) => Promise<RollOutcome | null>;
                rollMutation?: () => Promise<RollOutcome | null>;
                rollMalignancy?: () => Promise<RollOutcome | null>;
                rollNavigatorMutation?: () => Promise<RollOutcome | null>;
                rollGiftOfTheGods?: (arg: object | null) => Promise<RollOutcome | null>;
                rollFearEffects?: (a: number, b: number) => Promise<RollOutcome | null>;
                rollCriticalInjury?: (kind: string, loc: string, n: number) => Promise<RollOutcome | null>;
            }
            interface RollTableUtilsModule {
                RollTableUtils?: RollTableUtilsCls;
                default?: RollTableUtilsCls;
            }
            interface FoundryGlobal {
                Actor?: ActorClass;
                game?: { actors?: ActorsCollection };
            }

            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const fg = globalThis as unknown as FoundryGlobal;
            const ActorClassRef = fg.Actor;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/utils`;

            // ---------- prerequisite-validator ----------
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic ESM import of a runtime-only Foundry module
                const mod = (await import(`${base}/prerequisite-validator.js`)) as PrereqValidatorModule;

                try {
                    const parsed = mod.parsePrerequisiteString?.('Fel 30');
                    record(
                        'prereq-parse-characteristic',
                        parsed?.type === 'characteristic' && parsed.key === 'Fel' && parsed.value === 30,
                        `parsed=${JSON.stringify(parsed)}`,
                    );
                } catch (err) {
                    record('prereq-parse-characteristic', false, err instanceof Error ? err.message : String(err));
                }

                try {
                    const parsed = mod.parsePrerequisiteString?.('Command');
                    record('prereq-parse-skill', parsed?.type === 'skill' && parsed.key === 'Command', `parsed=${JSON.stringify(parsed)}`);
                } catch (err) {
                    record('prereq-parse-skill', false, err instanceof Error ? err.message : String(err));
                }

                try {
                    const parsed = mod.parsePrerequisiteString?.('   ');
                    record('prereq-parse-empty', parsed === null, `parsed=${JSON.stringify(parsed)}`);
                } catch (err) {
                    record('prereq-parse-empty', false, err instanceof Error ? err.message : String(err));
                }

                // Seed an actor with known characteristic + skill state.
                let actor: ProbeActor | null | undefined;
                try {
                    actor = await ActorClassRef?.create?.({
                        name: 'utils-validators-spec-actor',
                        type: 'dh2-character',
                        system: {
                            gameSystem: 'dh2',
                            characteristics: {
                                weaponSkill: { base: 30, advance: 0, modifier: 0 },
                                fellowship: { base: 25, advance: 0, modifier: 0 },
                            },
                        },
                    });
                } catch (err) {
                    for (const k of ['prereq-check-empty', 'prereq-check-unmet-characteristic', 'prereq-check-unmet-skill'] as const) {
                        record(k, false, `actor create: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }

                if (actor !== null && actor !== undefined) {
                    const liveActor = actor.id !== undefined ? fg.game?.actors?.get?.(actor.id) : undefined;

                    try {
                        const result = mod.checkPrerequisites?.(liveActor, []);
                        record(
                            'prereq-check-empty',
                            result?.valid === true && Array.isArray(result.unmet) && result.unmet.length === 0,
                            `result=${JSON.stringify(result)}`,
                        );
                    } catch (err) {
                        record('prereq-check-empty', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        // fellowship base is 25; require 40 → unmet.
                        const result = mod.checkPrerequisites?.(liveActor, [{ type: 'characteristic', key: 'fellowship', value: 40 }]);
                        record(
                            'prereq-check-unmet-characteristic',
                            result?.valid === false && Array.isArray(result.unmet) && result.unmet.length === 1,
                            `result=${JSON.stringify(result)}`,
                        );
                    } catch (err) {
                        record('prereq-check-unmet-characteristic', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        // No skill named 'Probe Imaginary Skill' → unmet.
                        const result = mod.checkPrerequisites?.(liveActor, [{ type: 'skill', key: 'Probe Imaginary Skill' }]);
                        record(
                            'prereq-check-unmet-skill',
                            result?.valid === false && Array.isArray(result.unmet) && result.unmet.length === 1,
                            `result=${JSON.stringify(result)}`,
                        );
                    } catch (err) {
                        record('prereq-check-unmet-skill', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        await actor.delete?.();
                    } catch {
                        /* ignore */
                    }
                }
            } catch (err) {
                for (const k of [
                    'prereq-parse-characteristic',
                    'prereq-parse-skill',
                    'prereq-parse-empty',
                    'prereq-check-empty',
                    'prereq-check-unmet-characteristic',
                    'prereq-check-unmet-skill',
                ] as const) {
                    record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            // ---------- roll-table-utils ----------
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic ESM import of a runtime-only Foundry module
                const mod = (await import(`${base}/roll-table-utils.js`)) as RollTableUtilsModule;
                const RTU: RollTableUtilsCls | undefined = mod.RollTableUtils ?? mod.default;
                if (typeof RTU?.findTableInCompendiums !== 'function') {
                    for (const k of UTILS_VALIDATORS_FLOWS.filter((f) => f.startsWith('roll-table-'))) record(k, false, 'RollTableUtils missing');
                } else {
                    // findInCompendiums — accept null (no matching table)
                    try {
                        const res = await RTU.findTableInCompendiums('Critical Damage - Energy');
                        record('roll-table-findInCompendiums', res === null || typeof res === 'object', `type=${typeof res}`);
                    } catch (err) {
                        record('roll-table-findInCompendiums', false, err instanceof Error ? err.message : String(err));
                    }

                    // All domain wrappers: accept null OR a TableResult.
                    const probes: Array<[FlowName, () => Promise<RollOutcome | null>]> = [
                        ['roll-table-rollPsychicPhenomena', async () => (await RTU.rollPsychicPhenomena?.({ system: {} }, 0)) ?? null],
                        ['roll-table-rollPerilsOfTheWarp', async () => (await RTU.rollPerilsOfTheWarp?.({ system: {} })) ?? null],
                        ['roll-table-rollMutation', async () => (await RTU.rollMutation?.()) ?? null],
                        ['roll-table-rollMalignancy', async () => (await RTU.rollMalignancy?.()) ?? null],
                        ['roll-table-rollNavigatorMutation', async () => (await RTU.rollNavigatorMutation?.()) ?? null],
                        ['roll-table-rollGiftOfTheGods', async () => (await RTU.rollGiftOfTheGods?.(null)) ?? null],
                        ['roll-table-rollFearEffects', async () => (await RTU.rollFearEffects?.(1, 1)) ?? null],
                        ['roll-table-rollCriticalInjury', async () => (await RTU.rollCriticalInjury?.('impact', 'body', 1)) ?? null],
                    ];
                    for (const [name, fn] of probes) {
                        try {
                            // eslint-disable-next-line no-await-in-loop -- domain wrappers must execute in series to attribute coverage cleanly
                            await fn();
                            record(name, true, null);
                        } catch (err) {
                            // Many of these depend on a packed roll table that
                            // may be absent from the test world. Treat throw
                            // as a flow failure unless the err looks like a
                            // tolerable "no table" path.
                            const msg = err instanceof Error ? err.message : String(err);
                            const tolerable = /not found|no table|missing/i.test(msg);
                            record(name, tolerable, msg);
                        }
                    }
                }
            } catch (err) {
                for (const k of UTILS_VALIDATORS_FLOWS.filter((f) => f.startsWith('roll-table-'))) {
                    record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('utils validators (Tier B)', () => {
    test('prerequisite-validator + roll-table-utils surface lights up under coverage', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeUtilsValidators(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('utils-validators.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of UTILS_VALIDATORS_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${UTILS_VALIDATORS_FLOWS.length} utils-validators flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
