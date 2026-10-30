import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { test } from './lib/test';

/**
 * Tier B coverage of the *third* batch of pure-logic modules under
 * `src/module/rules/*` — the affliction / social / vehicle resolvers
 * (addiction, assistance, disposition,
 * phenomena-modifier, reinforcement, requisition-test, test-substitution)
 * that neither `rules-engine.spec.ts` nor
 * `rules-pure-logic.spec.ts` touches. Same rationale as those specs:
 * every module here is at 0% Tier B function coverage because no other
 * Tier B test imports it directly — the system code reaches these
 * resolvers through Actor / Item methods that take other branches in
 * headless mode. This spec dynamic-imports each module and drives its
 * canonical entry points against synthetic inputs so the v8 coverage
 * capture lights up every export.
 *
 * Each flow records `rule-affliction.flow::<name>`. Keys MUST match the
 * RULE_AFFLICTION_FLOWS constant in scripts/e2e-coverage.mjs — that is
 * the coverage denominator and must agree with the recordCoverage keys
 * here.
 */

const RULE_AFFLICTION_FLOWS = [
    'addiction-resolveCheck',
    'addiction-treatmentDays',
    'assistance-bonus',
    'disposition-ladder',
    'disposition-personality',
    'phenomena-modifier-compose',
    'reinforcement-callPlan',
    'requisition-test-target',
    'requisition-test-influenceLoss',
    'area-avoidance-resolve',
] as const;

type FlowName = (typeof RULE_AFFLICTION_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeRules(page: Page): Promise<{ results: FlowResult[] }> {
    const results = await page.evaluate(async (): Promise<FlowResult[]> => {
        // Runtime-loaded module surfaces. Each module is dynamic-imported by
        // name; the interfaces below describe exactly the exports the probe
        // touches, so the comparisons downstream stay fully typed.
        interface RuleModules {
            'addiction': {
                resolveAddictionCheck: (input: { willpowerTotal: number; substanceRating: number; currentTier: string }) => {
                    target: number;
                    nextTierOnFailure: string;
                };
                getTreatmentClockDays: (tier: string) => number;
                ADDICTION_TREATMENT_DAYS: Record<string, number>;
            };
            'assistance': {
                getAssistanceBonus: (assistants: number, perAssistant?: number) => number;
                DEFAULT_ASSISTANT_CAP: number;
            };
            'disposition': {
                DISPOSITION_MODELS: Record<'characteristic' | 'ladderStepPlusDegrees', object>;
                ladderModifier: (step: number, model: object) => number;
                ladderShift: (model: object, success: boolean, dos: number, dof: number) => number;
                personalityEffect: (
                    row: { modifier: number; effect: string; basis: string },
                    success: boolean,
                    dos: number,
                    dof: number,
                ) => { formula: string; degrees: number } | null;
            };
            'phenomena-modifier': {
                composePhenomenaModifier: (input: { warpWeakness: boolean; taintedPsykerPushCP: number }) => {
                    focusModifier: number;
                    autoTriggerOnOddOr9: boolean;
                    phenomenaModifier: number;
                };
            };
            'reinforcement': {
                reinforcementFinalCost: (baseCost: number, peerDiscount: number, gmAdjustment: number) => number;
                maxWarbandContribution: (finalCost: number) => number;
                planReinforcementCall: (input: {
                    callerInfluence: number;
                    influenceMinimum: number;
                    callerSkill: { rank: number; required: number | null };
                    finalCost: number;
                    contributions: Array<{ id: string; influence: number; amount: number }>;
                }) => { ok: true; plan: { finalCost: number; callerPays: number; subtletyLoss: number } } | { ok: false; problem: string };
            };
            'requisition-test': {
                getRequisitionTestTarget: (input: {
                    influence: number;
                    ladder: { availability: Record<string, number | string>; craftsmanship: Record<string, number> | null };
                    availability: string;
                    craftsmanship: string;
                }) => { kind: string; target?: number };
            };
            'acquisition-ladder': {
                ratingAfterFailure: (
                    loss: { kind: 'flat'; minDegrees: number; loss: number; counting: 'fullTens' | 'plusOne' } | { kind: 'beyondFellowshipBonus' } | null,
                    rating: number,
                    degreesOfFailure: number,
                    fellowshipBonus: number,
                ) => number;
            };
            'test-substitution': {
                areaAvoidanceTest: (
                    items: Array<{ name: string; system: { modifiers?: { testSubstitutions?: Array<Record<string, string>> } } }>,
                    agilityTotal: number,
                    skillTotal: (skill: string) => number | undefined,
                ) => { skill: string; target: number };
            };
        }
        type ImportError = { __importError: string };
        type Loaded<T> = T | ImportError;
        const isImportError = <T>(m: Loaded<T>): m is ImportError => typeof (m as ImportError).__importError === 'string';

        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };

        const base = `${'/systems/wh40k-rpg'}/module/rules`;
        const loadModule = async <K extends keyof RuleModules>(name: K): Promise<Loaded<RuleModules[K]>> => {
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic runtime import of compiled module, shape asserted via RuleModules
                return (await import(`${base}/${name}.js`)) as RuleModules[K];
            } catch (err) {
                return { __importError: err instanceof Error ? err.message : String(err) };
            }
        };
        const guarded = (name: FlowName, fn: () => boolean): void => {
            try {
                record(name, fn(), null);
            } catch (err) {
                record(name, false, err instanceof Error ? err.message : String(err));
            }
        };
        const fail = (keys: readonly FlowName[], detail: string): void => {
            for (const k of keys) record(k, false, detail);
        };

        // ---------- addiction ----------
        const addiction = await loadModule('addiction');
        if (isImportError(addiction)) {
            fail(['addiction-resolveCheck', 'addiction-treatmentDays'], addiction.__importError);
        } else {
            guarded('addiction-resolveCheck', () => {
                const r = addiction.resolveAddictionCheck({ willpowerTotal: 50, substanceRating: 10, currentTier: 'none' });
                const floored = addiction.resolveAddictionCheck({ willpowerTotal: 10, substanceRating: 20, currentTier: 'none' });
                const severe = addiction.resolveAddictionCheck({ willpowerTotal: 40, substanceRating: 10, currentTier: 'severe' });
                return r.target === 40 && r.nextTierOnFailure === 'mild' && floored.target === 0 && severe.nextTierOnFailure === 'severe';
            });
            guarded(
                'addiction-treatmentDays',
                () => typeof addiction.getTreatmentClockDays('mild') === 'number' && Object.keys(addiction.ADDICTION_TREATMENT_DAYS).length > 0,
            );
        }

        // ---------- assistance ----------
        const assistance = await loadModule('assistance');
        if (isImportError(assistance)) {
            fail(['assistance-bonus'], assistance.__importError);
        } else {
            guarded('assistance-bonus', () => {
                return (
                    assistance.getAssistanceBonus(0) === 0 &&
                    assistance.getAssistanceBonus(2) === 20 &&
                    assistance.getAssistanceBonus(99) === 20 &&
                    assistance.getAssistanceBonus(5, 5) === 50 &&
                    assistance.DEFAULT_ASSISTANT_CAP === 2
                );
            });
        }

        // ---------- disposition ----------
        const disposition = await loadModule('disposition');
        if (isImportError(disposition)) {
            fail(['disposition-ladder', 'disposition-personality'], disposition.__importError);
        } else {
            // The seven-step ladder (DH1 and siblings, #73): ±10 per step; 1 + DoS up, DoF down.
            guarded('disposition-ladder', () => {
                const ladder = disposition.DISPOSITION_MODELS.ladderStepPlusDegrees;
                return (
                    disposition.ladderModifier(-3, ladder) === -30 &&
                    disposition.ladderModifier(9, ladder) === 30 &&
                    disposition.ladderShift(ladder, true, 2, 0) === 3 &&
                    disposition.ladderShift(ladder, false, 0, 2) === -2
                );
            });
            // A DH2 Personality row: its effect per degree on the outcome its basis counts.
            guarded('disposition-personality', () => {
                const effect = disposition.personalityEffect({ modifier: -20, effect: '5', basis: 'dos' }, true, 3, 0);
                return (
                    effect?.formula === '5' &&
                    effect.degrees === 3 &&
                    disposition.personalityEffect({ modifier: 0, effect: '5', basis: 'dos' }, false, 0, 2) === null
                );
            });
        }

        // ---------- phenomena-modifier ----------
        const phenomena = await loadModule('phenomena-modifier');
        if (isImportError(phenomena)) {
            fail(['phenomena-modifier-compose'], phenomena.__importError);
        } else {
            guarded('phenomena-modifier-compose', () => {
                const baseline = phenomena.composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 0 });
                const warp = phenomena.composePhenomenaModifier({ warpWeakness: true, taintedPsykerPushCP: 0 });
                const tainted = phenomena.composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 1 });
                return (
                    baseline.focusModifier === 0 &&
                    !baseline.autoTriggerOnOddOr9 &&
                    warp.focusModifier === 10 &&
                    warp.autoTriggerOnOddOr9 &&
                    tainted.phenomenaModifier === 5
                );
            });
        }

        // ---------- reinforcement ----------
        const reinforcement = await loadModule('reinforcement');
        if (isImportError(reinforcement)) {
            fail(['reinforcement-callPlan'], reinforcement.__importError);
        } else {
            // DH2 Reinforcement Characters: Influence Minimum gate, the warband pays at most half the
            // cost (rounded up), and the warband's Subtlety drops by the final cost.
            guarded('reinforcement-callPlan', () => {
                const finalCost = reinforcement.reinforcementFinalCost(20, 5, 0);
                // An RC with no caller-skill term (`required: null`) unless a call passes one (#77).
                const call = (
                    callerInfluence: number,
                    amount: number,
                    callerSkill: { rank: number; required: number | null } = { rank: 0, required: null },
                ): ReturnType<typeof reinforcement.planReinforcementCall> =>
                    reinforcement.planReinforcementCall({
                        callerInfluence,
                        influenceMinimum: 30,
                        callerSkill,
                        finalCost,
                        contributions: [{ id: 'ally', influence: 10, amount }],
                    });
                const ok = call(40, 8);
                const overCap = call(40, 9);
                const belowMinimum = call(20, 0);
                // The Thrice-Bound Daemonhost needs its caller Trained (rank 2).
                const untrained = call(40, 8, { rank: 1, required: 2 });
                const trained = call(40, 8, { rank: 2, required: 2 });
                return (
                    finalCost === 15 &&
                    reinforcement.maxWarbandContribution(finalCost) === 8 &&
                    ok.ok &&
                    ok.plan.callerPays === 7 &&
                    ok.plan.subtletyLoss === 15 &&
                    !overCap.ok &&
                    overCap.problem === 'contributionCap' &&
                    !belowMinimum.ok &&
                    belowMinimum.problem === 'belowMinimum' &&
                    !untrained.ok &&
                    untrained.problem === 'callerSkill' &&
                    trained.ok
                );
            });
        }

        // ---------- requisition-test ----------
        const requisition = await loadModule('requisition-test');
        if (isImportError(requisition)) {
            fail(['requisition-test-target'], requisition.__importError);
        } else {
            guarded('requisition-test-target', () => {
                // DH2's availability and craftsmanship modifier tables (the ladder lives on the line config, #192).
                const ladder = {
                    availability: { ubiquitous: 'automatic', common: 10, rare: -20 },
                    craftsmanship: { poor: 10, common: 0, good: -20, best: -30 },
                };
                const common = requisition.getRequisitionTestTarget({ influence: 40, ladder, availability: 'common', craftsmanship: 'common' });
                const clamped = requisition.getRequisitionTestTarget({ influence: 40, ladder, availability: 'rare', craftsmanship: 'best' });
                const residual = requisition.getRequisitionTestTarget({ influence: 80, ladder, availability: 'rare', craftsmanship: 'best' });
                const automatic = requisition.getRequisitionTestTarget({ influence: 5, ladder, availability: 'ubiquitous', craftsmanship: 'common' });
                return common.target === 50 && clamped.target === 0 && residual.target === 30 && automatic.kind === 'automatic';
            });
        }

        // ---------- acquisition-ladder (the per-line Influence loss on a failed requisition, #496) ----------
        const acquisition = await loadModule('acquisition-ladder');
        if (isImportError(acquisition)) {
            fail(['requisition-test-influenceLoss'], acquisition.__importError);
        } else {
            guarded('requisition-test-influenceLoss', () => {
                // The losses as dh2-config / dh1-config declare them; a line that prints none loses nothing.
                const dh2 = { kind: 'beyondFellowshipBonus' } as const;
                const dh1 = { kind: 'flat', minDegrees: 4, loss: 1, counting: 'fullTens' } as const;
                return (
                    acquisition.ratingAfterFailure(dh2, 40, 6, 4) === 38 &&
                    acquisition.ratingAfterFailure(dh2, 40, 3, 4) === 40 &&
                    acquisition.ratingAfterFailure(dh1, 40, 5, 0) === 39 &&
                    acquisition.ratingAfterFailure(dh1, 40, 4, 0) === 40 &&
                    acquisition.ratingAfterFailure(null, 40, 9, 0) === 40
                );
            });
        }

        // ---------- test-substitution (area avoidance) ----------
        const substitution = await loadModule('test-substitution');
        if (isImportError(substitution)) {
            fail(['area-avoidance-resolve'], substitution.__importError);
        } else {
            guarded('area-avoidance-resolve', () => {
                const dodgeHook = {
                    test: 'areaAvoidance',
                    skill: 'dodge',
                    basis: 'skill',
                    attack: 'any',
                    targetTag: '',
                    requiresSkill: '',
                    requiresSpecialization: '',
                };
                const skills = (skill: string): number | undefined => (skill === 'dodge' ? 55 : undefined);
                const def = substitution.areaAvoidanceTest([], 40, skills);
                const hooked = substitution.areaAvoidanceTest(
                    [{ name: 'Probe Talent', system: { modifiers: { testSubstitutions: [dodgeHook] } } }],
                    40,
                    skills,
                );
                const floored = substitution.areaAvoidanceTest([], -10, skills);
                return def.skill === 'agility' && def.target === 40 && hooked.skill === 'dodge' && hooked.target === 55 && floored.target === 0;
            });
        }

        return out;
    });
    return { results };
}

test.describe.serial('rules pure-logic surface — batch 3 (Tier B)', () => {
    test('every affliction / social / vehicle resolver returns the expected value without throwing', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeRules(page);
        assertFlowResults(probe, RULE_AFFLICTION_FLOWS, { dimension: 'rule-affliction.flow', label: 'rules affliction' });
    });
});
