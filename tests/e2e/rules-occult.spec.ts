import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the *fourth* batch of pure-logic modules under
 * `src/module/rules/*` — the occult / chaos / progression resolvers
 * (daemonic-mastery, dark-pact, exorcism, malefic-corruption,
 * possession, psychic-push, summoning-ritual, xenos-equipment, inquest,
 * malignancy-test, chaos-backgrounds) that none of the prior
 * rules-*.spec.ts batches touch. Same rationale: every module here is
 * at 0% Tier B function coverage because no other Tier B test imports
 * it directly. This spec dynamic-imports each module and drives its
 * canonical entry points against synthetic inputs so the v8 coverage
 * capture lights up every export.
 *
 * Each flow records `rule-occult.flow::<name>`. Keys MUST match the
 * RULE_OCCULT_FLOWS constant in scripts/e2e-coverage.mjs — that is the
 * coverage denominator and must agree with the recordCoverage keys here.
 */

const RULE_OCCULT_FLOWS = [
    'daemonic-mastery-buildTest',
    'dark-pact-adjustDisposition',
    'dark-pact-discoverySubtletyHit',
    'exorcism-threshold',
    'exorcism-prepareAttempt',
    'exorcism-hostSurvival',
    'malefic-corruption-cost',
    'possession-canUnleash',
    'possession-spendUnleash',
    'possession-resistTarget',
    'psychic-push-resolveMode',
    'summoning-prepareRitual',
    'summoning-bindingDuration',
    'xenos-equipment-condition',
    'xenos-equipment-tickDegradation',
    'inquest-revelationsCrossed',
    'inquest-currentTier',
    'malignancy-thresholdsCrossed',
    'malignancy-testTarget',
    'chaos-backgrounds-predicates',
] as const;

type FlowName = (typeof RULE_OCCULT_FLOWS)[number];

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
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/rules`;
            const loadModule = async (name: string): Promise<any> => {
                try {
                    return await import(`${base}/${name}.js`);
                } catch (err) {
                    return { __importError: String((err as Error).message) };
                }
            };
            const guarded = (name: FlowName, fn: () => boolean): void => {
                try {
                    record(name, fn(), null);
                } catch (err) {
                    record(name, false, String((err as Error).message));
                }
            };
            const fail = (keys: readonly FlowName[], detail: string): void => {
                for (const k of keys) record(k, false, detail);
            };

            // ---------- daemonic-mastery ----------
            const dm = await loadModule('daemonic-mastery');
            if (dm?.__importError != null) {
                fail(['daemonic-mastery-buildTest'], dm.__importError);
            } else {
                guarded('daemonic-mastery-buildTest', () => {
                    const factors = dm.DAEMONIC_MASTERY_FACTORS;
                    const baseOnly = dm.buildDaemonicMasteryTest({ willpowerTotal: 40, factors: [factors.BASE_DIFFICULTY] });
                    const trueName = dm.buildDaemonicMasteryTest({ willpowerTotal: 40, factors: [factors.BASE_DIFFICULTY, factors.TRUE_NAME] });
                    return baseOnly.target === 10 && trueName.target === 40 && Array.isArray(trueName.breakdown);
                });
            }

            // ---------- dark-pact ----------
            const darkPact = await loadModule('dark-pact');
            if (darkPact?.__importError != null) {
                fail(['dark-pact-adjustDisposition', 'dark-pact-discoverySubtletyHit'], darkPact.__importError);
            } else {
                guarded(
                    'dark-pact-adjustDisposition',
                    () =>
                        darkPact.adjustPactDisposition(0, 5) === 3 &&
                        darkPact.adjustPactDisposition(0, -5) === -3 &&
                        darkPact.adjustPactDisposition(2, -1) === 1,
                );
                guarded('dark-pact-discoverySubtletyHit', () => {
                    const pact = { id: 'p', boon: 'b', bane: 'x', initialDisposition: 0, discoverySubtletyPenalty: 5 };
                    const negative = { id: 'p', boon: 'b', bane: 'x', initialDisposition: 0, discoverySubtletyPenalty: -3 };
                    return darkPact.getDiscoverySubtletyHit(pact) === 5 && darkPact.getDiscoverySubtletyHit(negative) === 0;
                });
            }

            // ---------- exorcism ----------
            const exorcism = await loadModule('exorcism');
            if (exorcism?.__importError != null) {
                fail(['exorcism-threshold', 'exorcism-prepareAttempt', 'exorcism-hostSurvival'], exorcism.__importError);
            } else {
                guarded('exorcism-threshold', () => exorcism.getExorcismThreshold(5) === 10 && exorcism.getExorcismThreshold(0) === 1);
                guarded('exorcism-prepareAttempt', () => {
                    const r = exorcism.prepareExorcismAttempt({ exorcistWillpower: 40, factors: [] });
                    return typeof r.target === 'number' && Array.isArray(r.breakdown) && r.breakdown.length > 0;
                });
                guarded('exorcism-hostSurvival', () => exorcism.getHostSurvivalTarget(40) === 30 && exorcism.getHostSurvivalTarget(5) === 0);
            }

            // ---------- malefic-corruption ----------
            const malefic = await loadModule('malefic-corruption');
            if (malefic?.__importError != null) {
                fail(['malefic-corruption-cost'], malefic.__importError);
            } else {
                guarded(
                    'malefic-corruption-cost',
                    () =>
                        malefic.getMaleficCorruptionCost('malefic', 4, true) === 4 &&
                        malefic.getMaleficCorruptionCost('malefic', 4, false) === 0 &&
                        malefic.getMaleficCorruptionCost('biomancy', 5, true) === 0,
                );
            }

            // ---------- possession ----------
            const possession = await loadModule('possession');
            if (possession?.__importError != null) {
                fail(['possession-canUnleash', 'possession-spendUnleash', 'possession-resistTarget'], possession.__importError);
            } else {
                guarded('possession-canUnleash', () => {
                    return (
                        possession.canUnleashDaemon({ state: 'none', unleashUsed: 0, unleashMax: 3 }) === false &&
                        possession.canUnleashDaemon({ state: 'latent', unleashUsed: 0, unleashMax: 2 }) === true &&
                        possession.canUnleashDaemon({ state: 'latent', unleashUsed: 2, unleashMax: 2 }) === false
                    );
                });
                guarded('possession-spendUnleash', () => {
                    const next = possession.spendUnleashDaemon({ state: 'latent', unleashUsed: 0, unleashMax: 2 });
                    const noop = possession.spendUnleashDaemon({ state: 'none', unleashUsed: 0, unleashMax: 3 });
                    return next.unleashUsed === 1 && noop.unleashUsed === 0 && typeof possession.resetSessionUnleash === 'function';
                });
                guarded(
                    'possession-resistTarget',
                    () =>
                        possession.getResistDaemonTarget(40, 0) === 40 &&
                        possession.getResistDaemonTarget(40, 95) === 10 &&
                        possession.getResistDaemonTarget(5, 95) === 0,
                );
            }

            // ---------- psychic-push ----------
            const psyPush = await loadModule('psychic-push');
            if (psyPush?.__importError != null) {
                fail(['psychic-push-resolveMode'], psyPush.__importError);
            } else {
                guarded('psychic-push-resolveMode', () => {
                    const fettered = psyPush.resolvePsyMode({ mode: 'fettered', basePR: 4 });
                    const unfettered = psyPush.resolvePsyMode({ mode: 'unfettered', basePR: 4 });
                    const pushed = psyPush.resolvePsyMode({ mode: 'push', basePR: 4, pushLevel: 1 });
                    return (
                        fettered.effectivePR === 2 &&
                        fettered.focusModifier === 10 &&
                        unfettered.effectivePR === 4 &&
                        pushed.effectivePR === 5 &&
                        pushed.focusModifier === -10
                    );
                });
            }

            // ---------- summoning-ritual ----------
            const summoning = await loadModule('summoning-ritual');
            if (summoning?.__importError != null) {
                fail(['summoning-prepareRitual', 'summoning-bindingDuration'], summoning.__importError);
            } else {
                const baseRitual = { forbiddenLoreTotal: 80, willpowerTotal: 40, hasTrueName: false, hasComponents: true, extraFactors: [] };
                guarded('summoning-prepareRitual', () => {
                    const r = summoning.prepareSummoningRitual(baseRitual);
                    const floored = summoning.prepareSummoningRitual({ ...baseRitual, forbiddenLoreTotal: 50 });
                    return (
                        r.forbiddenLoreTarget === 20 && floored.forbiddenLoreTarget === 0 && Array.isArray(r.masteryBreakdown) && r.masteryBreakdown.length > 0
                    );
                });
                guarded('summoning-bindingDuration', () => summoning.bindingDurationHours(3) === 3 && summoning.bindingDurationHours(-2) === 0);
            }

            // ---------- xenos-equipment ----------
            const xenos = await loadModule('xenos-equipment');
            if (xenos?.__importError != null) {
                fail(['xenos-equipment-condition', 'xenos-equipment-tickDegradation'], xenos.__importError);
            } else {
                guarded(
                    'xenos-equipment-condition',
                    () =>
                        xenos.getXenosCondition(8) === 'pristine' &&
                        xenos.getXenosCondition(4) === 'worn' &&
                        xenos.getXenosCondition(1) === 'degraded' &&
                        xenos.getXenosCondition(0) === 'ruined',
                );
                guarded('xenos-equipment-tickDegradation', () => {
                    const ticked = xenos.tickXenosDegradation(8, 1);
                    return (
                        typeof ticked.newCharges === 'number' &&
                        typeof ticked.newCondition === 'string' &&
                        typeof xenos.nextConditionUp('degraded') === 'string'
                    );
                });
            }

            // ---------- inquest ----------
            const inquest = await loadModule('inquest');
            if (inquest?.__importError != null) {
                fail(['inquest-revelationsCrossed', 'inquest-currentTier'], inquest.__importError);
            } else {
                guarded(
                    'inquest-revelationsCrossed',
                    () =>
                        inquest.inquestRevelationsCrossed(300, 300) === 0 &&
                        inquest.inquestRevelationsCrossed(150, 250) === 1 &&
                        inquest.inquestRevelationsCrossed(0, 1200) === 5,
                );
                guarded(
                    'inquest-currentTier',
                    () =>
                        inquest.getCurrentRevelationTier(0) === 0 &&
                        inquest.getCurrentRevelationTier(199) === 0 &&
                        Array.isArray([...inquest.INQUEST_THRESHOLDS]),
                );
            }

            // ---------- malignancy-test ----------
            const malignancy = await loadModule('malignancy-test');
            if (malignancy?.__importError != null) {
                fail(['malignancy-thresholdsCrossed', 'malignancy-testTarget'], malignancy.__importError);
            } else {
                guarded(
                    'malignancy-thresholdsCrossed',
                    () =>
                        malignancy.malignancyThresholdsCrossed(15, 15) === 0 &&
                        malignancy.malignancyThresholdsCrossed(8, 12) === 1 &&
                        malignancy.malignancyThresholdsCrossed(5, 35) === 3,
                );
                guarded(
                    'malignancy-testTarget',
                    () =>
                        malignancy.getMalignancyTestTarget(40, 0) === 40 &&
                        malignancy.getMalignancyTestTarget(40, 25) === 20 &&
                        malignancy.getMalignancyTestTarget(5, 95) === 0,
                );
            }

            // ---------- chaos-backgrounds ----------
            const chaosBg = await loadModule('chaos-backgrounds');
            if (chaosBg?.__importError != null) {
                fail(['chaos-backgrounds-predicates'], chaosBg.__importError);
            } else {
                guarded('chaos-backgrounds-predicates', () => {
                    return (
                        chaosBg.canConvertMalignancyToMutation(true) === true &&
                        chaosBg.canConvertMalignancyToMutation(false) === false &&
                        chaosBg.canApplyIncorruptibleDevotion(true) === true &&
                        chaosBg.MUTANT_STARTING_CORRUPTION === 10
                    );
                });
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rules pure-logic surface — batch 4 occult (Tier B)', () => {
    test('every occult / chaos / progression resolver returns the expected value without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rule-occult.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of RULE_OCCULT_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${RULE_OCCULT_FLOWS.length} rules occult flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
