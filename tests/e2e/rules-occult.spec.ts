import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { test } from './lib/test';

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
    'xenos-equipment-isXenos',
    'xenos-equipment-repair',
    'inquest-revelationsCrossed',
    'inquest-revelationThresholds',
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

async function probeRules(page: Page): Promise<{ results: FlowResult[] }> {
    const results = await page.evaluate(async (): Promise<FlowResult[]> => {
        // Browser-side probe: each rules module is dynamic-imported at runtime
        // and exposes a flat namespace of pure-logic functions / constants. We
        // model the loaded module as a possibly-failed import and narrow each
        // member to the callable / value shape it is asserted against at the
        // call site (the spec owns the contract for every module it probes).
        // eslint-disable-next-line no-restricted-syntax -- boundary: a runtime-imported ESM module exposes members of statically-unknown shape
        type LoadedModule = Readonly<Record<string, unknown>> & { readonly __importError?: string };
        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };

        const base = `${'/systems/wh40k-rpg'}/module/rules`;
        const loadModule = async (name: string): Promise<LoadedModule> => {
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM dynamic import of a rules module has no static type
                return (await import(`${base}/${name}.js`)) as LoadedModule;
            } catch (err) {
                return { __importError: err instanceof Error ? err.message : String(err) };
            }
        };
        // Narrow a module member to a callable with a caller-asserted signature.
        // Each rules module is pure-logic; the caller knows the contract it is
        // asserting against, so the return type is supplied at the call site.
        // eslint-disable-next-line no-restricted-syntax -- boundary: variadic narrowing of a runtime-imported function whose param shape is statically unknown
        const fn = <R, A extends readonly unknown[] = readonly unknown[]>(mod: LoadedModule, key: string): ((...args: A) => R) => mod[key] as (...args: A) => R;
        // Narrow a module member to a plain value (constant export).
        const val = <V>(mod: LoadedModule, key: string): V => mod[key] as V;
        const guarded = (name: FlowName, check: () => boolean): void => {
            try {
                record(name, check(), null);
            } catch (err) {
                record(name, false, err instanceof Error ? err.message : String(err));
            }
        };
        const fail = (keys: readonly FlowName[], detail: string): void => {
            for (const k of keys) record(k, false, detail);
        };

        // ---------- daemonic-mastery ----------
        const dm = await loadModule('daemonic-mastery');
        if (dm.__importError != null) {
            fail(['daemonic-mastery-buildTest'], dm.__importError);
        } else {
            guarded('daemonic-mastery-buildTest', () => {
                const factors = val<Readonly<Record<string, object>>>(dm, 'DAEMONIC_MASTERY_FACTORS');
                const build = fn<{ target: number; components: readonly object[] }>(dm, 'buildDaemonicMasteryTest');
                // The Very Hard base is always applied; factors stack on top of it.
                const baseOnly = build({ willpowerTotal: 40, factors: [] });
                const trueName = build({ willpowerTotal: 40, factors: [factors.TRUE_NAME] });
                return baseOnly.target === 10 && trueName.target === 40 && trueName.components.length === 2;
            });
        }

        // ---------- dark-pact ----------
        const darkPact = await loadModule('dark-pact');
        if (darkPact.__importError != null) {
            fail(['dark-pact-adjustDisposition', 'dark-pact-discoverySubtletyHit'], darkPact.__importError);
        } else {
            guarded('dark-pact-adjustDisposition', () => {
                const adjust = fn<number>(darkPact, 'adjustPactDisposition');
                return adjust(0, 5) === 3 && adjust(0, -5) === -3 && adjust(2, -1) === 1;
            });
            guarded('dark-pact-discoverySubtletyHit', () => {
                const hit = fn<number>(darkPact, 'getDiscoverySubtletyHit');
                const pact = { id: 'p', boon: 'b', bane: 'x', initialDisposition: 0, discoverySubtletyPenalty: 5 };
                const negative = { id: 'p', boon: 'b', bane: 'x', initialDisposition: 0, discoverySubtletyPenalty: -3 };
                return hit(pact) === 5 && hit(negative) === 0;
            });
        }

        // ---------- exorcism ----------
        const exorcism = await loadModule('exorcism');
        if (exorcism.__importError != null) {
            fail(['exorcism-threshold', 'exorcism-prepareAttempt', 'exorcism-hostSurvival'], exorcism.__importError);
        } else {
            guarded('exorcism-threshold', () => {
                const threshold = fn<number>(exorcism, 'getExorcismThreshold');
                // Daemon WP bonus + possessed Corruption bonus (Enemies Beyond p. 71).
                return threshold(5, 3) === 8 && threshold(0, 0) === 0;
            });
            guarded('exorcism-prepareAttempt', () => {
                const r = fn<{ target: number; components: readonly object[] }>(
                    exorcism,
                    'prepareExorcismAttempt',
                )({ exorcistWillpower: 40, factors: [], loreDos: 2 });
                return r.target === 20 && r.components.length === 2;
            });
            guarded('exorcism-hostSurvival', () => {
                // Challenging (+0) Toughness.
                const survival = fn<number>(exorcism, 'getHostSurvivalTarget');
                return survival(40) === 40 && survival(-5) === 0;
            });
        }

        // ---------- malefic-corruption ----------
        const malefic = await loadModule('malefic-corruption');
        if (malefic.__importError != null) {
            fail(['malefic-corruption-cost'], malefic.__importError);
        } else {
            guarded('malefic-corruption-cost', () => {
                const cost = fn<number>(malefic, 'getMaleficCorruptionCost');
                return cost('malefic', 4, true) === 4 && cost('malefic', 4, false) === 0 && cost('biomancy', 5, true) === 0;
            });
        }

        // ---------- possession ----------
        const possession = await loadModule('possession');
        if (possession.__importError != null) {
            fail(['possession-canUnleash', 'possession-spendUnleash', 'possession-resistTarget'], possession.__importError);
        } else {
            guarded('possession-canUnleash', () => {
                const canUnleash = fn<boolean>(possession, 'canUnleashDaemon');
                return (
                    !canUnleash({ state: 'none', unleashUsed: 0, unleashMax: 3 }) &&
                    canUnleash({ state: 'latent', unleashUsed: 0, unleashMax: 2 }) &&
                    !canUnleash({ state: 'latent', unleashUsed: 2, unleashMax: 2 })
                );
            });
            guarded('possession-spendUnleash', () => {
                const spend = fn<{ unleashUsed: number }>(possession, 'spendUnleashDaemon');
                const next = spend({ state: 'latent', unleashUsed: 0, unleashMax: 2 });
                const noop = spend({ state: 'none', unleashUsed: 0, unleashMax: 3 });
                return next.unleashUsed === 1 && noop.unleashUsed === 0 && typeof possession.resetSessionUnleash === 'function';
            });
            guarded('possession-resistTarget', () => {
                const resist = fn<number>(possession, 'getResistDaemonTarget');
                return resist(40, 0) === 40 && resist(40, 95) === 10 && resist(5, 95) === 0;
            });
        }

        // ---------- psychic-push ----------
        const psyPush = await loadModule('psychic-push');
        if (psyPush.__importError != null) {
            fail(['psychic-push-resolveMode'], psyPush.__importError);
        } else {
            guarded('psychic-push-resolveMode', () => {
                const resolve = fn<{ effectivePR: number; focusModifier: number }>(psyPush, 'resolvePsyMode');
                const fettered = resolve({ mode: 'fettered', basePR: 4 });
                const unfettered = resolve({ mode: 'unfettered', basePR: 4 });
                const pushed = resolve({ mode: 'push', basePR: 4, pushLevel: 1 });
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
        if (summoning.__importError != null) {
            fail(['summoning-prepareRitual', 'summoning-bindingDuration'], summoning.__importError);
        } else {
            const baseRitual = { forbiddenLoreTotal: 80, willpowerTotal: 40, hasTrueName: false, servesPatron: false, loreFactors: [], masteryFactors: [] };
            guarded('summoning-prepareRitual', () => {
                const prepare = fn<{ lore: { target: number }; mastery: { target: number; components: readonly object[] } }>(
                    summoning,
                    'prepareSummoningRitual',
                );
                const r = prepare(baseRitual);
                const floored = prepare({ ...baseRitual, forbiddenLoreTotal: 50 });
                return r.lore.target === 20 && floored.lore.target === 0 && r.mastery.target === 10 && r.mastery.components.length > 0;
            });
            guarded('summoning-bindingDuration', () => {
                const duration = fn<number>(summoning, 'bindingDurationHours');
                return duration(3) === 3 && duration(-2) === 0;
            });
        }

        // ---------- xenos-equipment ----------
        const xenos = await loadModule('xenos-equipment');
        if (xenos.__importError != null) {
            fail(['xenos-equipment-isXenos', 'xenos-equipment-repair'], xenos.__importError);
        } else {
            guarded('xenos-equipment-isXenos', () => {
                // Weapons and armour typed `xenos` are xenos equipment; other items never are.
                const isXenos = fn<boolean>(xenos, 'isXenosEquipment');
                return (
                    isXenos({ type: 'weapon', system: { type: 'xenos' } }) &&
                    isXenos({ type: 'armour', system: { type: 'xenos' } }) &&
                    !isXenos({ type: 'weapon', system: { type: 'las' } }) &&
                    !isXenos({ type: 'gear', system: { type: 'xenos' } })
                );
            });
            guarded('xenos-equipment-repair', () => {
                // Enemies Without p. 42: -20 for the alien nature, +5 per DoS on the Forbidden Lore test.
                const rules = { loreModifier: -20, repairModifier: -20, bonusPerLoreDegree: 5 };
                const mods = fn<{ alienNature: number; loreInsight: number }>(xenos, 'xenosRepairModifiers')(rules, 3);
                const read = fn<{ actorUuid: string; degrees: number } | null>(xenos, 'readXenosRepairInsight');
                const own = read({ actorUuid: 'Actor.a', degrees: 3 }, 'Actor.a');
                return (
                    mods.alienNature === -20 &&
                    mods.loreInsight === 15 &&
                    own?.degrees === 3 &&
                    read({ actorUuid: 'Actor.b', degrees: 3 }, 'Actor.a') === null &&
                    read('garbage', 'Actor.a') === null
                );
            });
        }

        // ---------- inquest ----------
        const inquest = await loadModule('inquest');
        if (inquest.__importError != null) {
            fail(['inquest-revelationsCrossed', 'inquest-revelationThresholds'], inquest.__importError);
        } else {
            guarded('inquest-revelationsCrossed', () => {
                // Only upward crossings count; a drop never un-reveals anything.
                const crossed = fn<number>(inquest, 'inquestRevelationsCrossed');
                const reached = fn<number>(inquest, 'inquestRevelationsReached');
                const ladder = [300, 600, 900];
                return (
                    crossed(ladder, 300, 300) === 0 &&
                    crossed(ladder, 250, 350) === 1 &&
                    crossed(ladder, 0, 900) === 3 &&
                    crossed(ladder, 900, 0) === 0 &&
                    reached(ladder, 299) === 0 &&
                    reached(ladder, 600) === 2
                );
            });
            guarded('inquest-revelationThresholds', () => {
                // Enemies Within pp. 63-66: a Revelation every 300 IP by default, GM-tailored
                // thresholds otherwise, and the completion total is always the final Revelation.
                const rules = {
                    scopes: {
                        minoris: { requiredPoints: 600, influenceReward: 3 },
                        majoris: { requiredPoints: 900, influenceReward: 5 },
                        extremis: { requiredPoints: 1200, influenceReward: 7 },
                    },
                    revelationInterval: 300,
                };
                const thresholds = fn<number[]>(inquest, 'inquestRevelationThresholds');
                const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
                return (
                    same(thresholds(rules, { scope: 'minoris', extraRequiredPoints: 0, revelationThresholds: [] }), [300, 600]) &&
                    same(thresholds(rules, { scope: 'minoris', extraRequiredPoints: 200, revelationThresholds: [] }), [300, 600, 800]) &&
                    same(thresholds(rules, { scope: 'majoris', extraRequiredPoints: 0, revelationThresholds: [250, 950] }), [250, 900])
                );
            });
        }

        // ---------- malignancy-test ----------
        const malignancy = await loadModule('malignancy-test');
        if (malignancy.__importError != null) {
            fail(['malignancy-thresholdsCrossed', 'malignancy-testTarget'], malignancy.__importError);
        } else {
            guarded('malignancy-thresholdsCrossed', () => {
                const crossed = fn<number>(malignancy, 'malignancyThresholdsCrossed');
                return crossed(15, 15) === 0 && crossed(8, 12) === 1 && crossed(5, 35) === 3;
            });
            guarded('malignancy-testTarget', () => {
                // Table 8-14: the Corruption Track modifier is banded (+0 to 30 CP, -10 to 60, -20 to 90, -30 to 99).
                const target = fn<number>(malignancy, 'getMalignancyTestTarget');
                return (
                    target(40, 0) === 40 &&
                    target(40, 30) === 40 &&
                    target(40, 31) === 30 &&
                    target(40, 75) === 20 &&
                    target(40, 95) === 10 &&
                    target(5, 95) === 0
                );
            });
        }

        // ---------- chaos-backgrounds ----------
        const chaosBg = await loadModule('chaos-backgrounds');
        if (chaosBg.__importError != null) {
            fail(['chaos-backgrounds-predicates'], chaosBg.__importError);
        } else {
            guarded('chaos-backgrounds-predicates', () => {
                const formula = val<(system: object) => string | null>(chaosBg, 'startingMutationFormula');
                return formula({ grants: { startingMutationFormula: '5d10' } }) === '5d10' && formula({ grants: [] }) === null;
            });
        }

        return out;
    });
    return { results };
}

test.describe.serial('rules pure-logic surface — batch 4 occult (Tier B)', () => {
    test('every occult / chaos / progression resolver returns the expected value without throwing', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeRules(page);
        assertFlowResults(probe, RULE_OCCULT_FLOWS, { dimension: 'rule-occult.flow', label: 'rules occult' });
    });
});
