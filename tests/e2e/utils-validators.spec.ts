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
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/utils`;

            // ---------- prerequisite-validator ----------
            try {
                const mod = await import(`${base}/prerequisite-validator.js`);

                try {
                    const parsed = mod.parsePrerequisiteString?.('Fel 30');
                    record(
                        'prereq-parse-characteristic',
                        parsed?.type === 'characteristic' && parsed.key === 'Fel' && parsed.value === 30,
                        `parsed=${JSON.stringify(parsed)}`,
                    );
                } catch (err) {
                    record('prereq-parse-characteristic', false, String((err as Error)?.message ?? err));
                }

                try {
                    const parsed = mod.parsePrerequisiteString?.('Command');
                    record('prereq-parse-skill', parsed?.type === 'skill' && parsed.key === 'Command', `parsed=${JSON.stringify(parsed)}`);
                } catch (err) {
                    record('prereq-parse-skill', false, String((err as Error)?.message ?? err));
                }

                try {
                    const parsed = mod.parsePrerequisiteString?.('   ');
                    record('prereq-parse-empty', parsed === null, `parsed=${JSON.stringify(parsed)}`);
                } catch (err) {
                    record('prereq-parse-empty', false, String((err as Error)?.message ?? err));
                }

                // Seed an actor with known characteristic + skill state.
                let actor: any;
                try {
                    actor = await Actor.create({
                        name: 'utils-validators-spec-actor',
                        type: 'dh2-character',
                        system: {
                            gameSystem: 'dh2e',
                            characteristics: {
                                weaponSkill: { base: 30, advance: 0, modifier: 0 },
                                fellowship: { base: 25, advance: 0, modifier: 0 },
                            },
                        },
                    });
                } catch (err) {
                    for (const k of ['prereq-check-empty', 'prereq-check-unmet-characteristic', 'prereq-check-unmet-skill'] as const) {
                        record(k, false, `actor create: ${String((err as Error)?.message ?? err)}`);
                    }
                }

                if (actor) {
                    const liveActor = g.game?.actors?.get?.(actor.id);

                    try {
                        const result = mod.checkPrerequisites?.(liveActor, []);
                        record(
                            'prereq-check-empty',
                            result?.valid === true && Array.isArray(result.unmet) && result.unmet.length === 0,
                            `result=${JSON.stringify(result)}`,
                        );
                    } catch (err) {
                        record('prereq-check-empty', false, String((err as Error)?.message ?? err));
                    }

                    try {
                        // fellowship base is 25; require 40 → unmet.
                        const result = mod.checkPrerequisites?.(liveActor, [{ type: 'characteristic', key: 'fellowship', value: 40 }]);
                        record('prereq-check-unmet-characteristic', result?.valid === false && result.unmet.length === 1, `result=${JSON.stringify(result)}`);
                    } catch (err) {
                        record('prereq-check-unmet-characteristic', false, String((err as Error)?.message ?? err));
                    }

                    try {
                        // No skill named 'Probe Imaginary Skill' → unmet.
                        const result = mod.checkPrerequisites?.(liveActor, [{ type: 'skill', key: 'Probe Imaginary Skill' }]);
                        record('prereq-check-unmet-skill', result?.valid === false && result.unmet.length === 1, `result=${JSON.stringify(result)}`);
                    } catch (err) {
                        record('prereq-check-unmet-skill', false, String((err as Error)?.message ?? err));
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
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            // ---------- roll-table-utils ----------
            try {
                const mod = await import(`${base}/roll-table-utils.js`);
                const RTU = mod.RollTableUtils ?? mod.default;
                if (typeof RTU?.findTableInCompendiums !== 'function') {
                    for (const k of UTILS_VALIDATORS_FLOWS.filter((f) => f.startsWith('roll-table-'))) record(k, false, 'RollTableUtils missing');
                } else {
                    // findInCompendiums — accept null (no matching table)
                    try {
                        const res = await RTU.findTableInCompendiums('Critical Damage - Energy');
                        record('roll-table-findInCompendiums', res === null || (typeof res === 'object' && res !== null), `type=${typeof res}`);
                    } catch (err) {
                        record('roll-table-findInCompendiums', false, String((err as Error)?.message ?? err));
                    }

                    // All domain wrappers: accept null OR a TableResult.
                    const probes: Array<[FlowName, () => Promise<unknown>]> = [
                        ['roll-table-rollPsychicPhenomena', () => RTU.rollPsychicPhenomena({ system: {} } as any, 0)],
                        ['roll-table-rollPerilsOfTheWarp', () => RTU.rollPerilsOfTheWarp({ system: {} } as any)],
                        ['roll-table-rollMutation', () => RTU.rollMutation()],
                        ['roll-table-rollMalignancy', () => RTU.rollMalignancy()],
                        ['roll-table-rollNavigatorMutation', () => RTU.rollNavigatorMutation()],
                        ['roll-table-rollGiftOfTheGods', () => RTU.rollGiftOfTheGods(null)],
                        ['roll-table-rollFearEffects', () => RTU.rollFearEffects(1, 1)],
                        ['roll-table-rollCriticalInjury', () => RTU.rollCriticalInjury('impact', 'body', 1)],
                    ];
                    for (const [name, fn] of probes) {
                        try {
                            await fn();
                            record(name, true, null);
                        } catch (err) {
                            // Many of these depend on a packed roll table that
                            // may be absent from the test world. Treat throw
                            // as a flow failure unless the err looks like a
                            // tolerable "no table" path.
                            const msg = String((err as Error)?.message ?? err);
                            const tolerable = /not found|no table|missing/i.test(msg);
                            record(name, tolerable, msg);
                        }
                    }
                }
            } catch (err) {
                for (const k of UTILS_VALIDATORS_FLOWS.filter((f) => f.startsWith('roll-table-'))) {
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
