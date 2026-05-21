import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the *second* batch of pure-logic modules under
 * `src/module/rules/*` — the canonical RAW resolvers (difficulty ladder,
 * scatter, surprise, retry, two-weapon, untrained, cover, pinning,
 * fatigue, fear, hit-locations, hazards, healing, attack-options) that
 * `rules-engine.spec.ts` does NOT touch. Like that spec, every module
 * here is at 0% Tier B function coverage before this lands because no
 * other Tier B test imports it directly: the system code reaches these
 * resolvers through Actor / Item methods that take other branches in
 * headless mode (no canvas, no chat-message post-render). This spec
 * dynamic-imports each module and drives its canonical entry points
 * against synthetic inputs so the v8 coverage capture lights up every
 * export.
 *
 * Modules exercised:
 *   - `difficulties.ts` — `rollDifficulties` (the localised ladder map).
 *   - `scatter.ts` — `buildScatterVector` (clamp branches),
 *     `scaleScatterForArea` (cap), `labelForDirection`.
 *   - `surprise.ts` — `getSurpriseToHitBonus`, `canActThisRound`,
 *     `canUseReactions` (round-1 vs round-2+ branches).
 *   - `trying-again.ts` — `getTryAgainAdvice` (no-retry +
 *     cumulative-penalty skill sets).
 *   - `two-weapon-fighting.ts` — `resolveTwoWeaponPenalties` (melee +
 *     ranged + talent-gated branches).
 *   - `untrained-skill.ts` — `resolveUntrainedTarget` (trained / basic /
 *     advanced / halved / alt-characteristic branches).
 *   - `cover.ts` — `resolveCoverHit` (absorb / overflow / destroyed),
 *     `startingCoverAP`.
 *   - `pinning.ts` — `resolvePinningTest`, `resolveEscapePinningTest`
 *     (cover / not-being-shot-at bonus, non-stacking).
 *   - `fatigue.ts` — `getFatigueThreshold`, `isFatigueUnconscious`,
 *     `isCharacteristicHalvedByFatigue`.
 *   - `fear.ts` — `getFearTestPenalty`, `resolveFearTest`,
 *     `getShockTableRollModifier`.
 *   - `hit-locations.ts` — `reverseAttackRollDigits`,
 *     `getHitLocationForRoll`, `hitDropdown`.
 *   - `hazards.ts` — `getFallingDiceCount`, `getFallingDamageFormula`,
 *     `resolveDrowningTest`.
 *   - `healing.ts` — `getDamageTier`, `getNaturalHealingDays`.
 *   - `attack-options.ts` — `getAvailableAttackModes`,
 *     `getSituationalModifiers`, `getAimModifier`.
 *
 * Each flow records `rule-pure.flow::<name>`. Keys MUST match the
 * RULE_PURE_FLOWS constant in scripts/e2e-coverage.mjs — that is the
 * coverage denominator and must agree with the recordCoverage keys here.
 */

const RULE_PURE_FLOWS = [
    'difficulties-rollDifficulties',
    'scatter-buildVector',
    'scatter-scaleForArea',
    'scatter-labelForDirection',
    'surprise-toHitBonus',
    'surprise-canActThisRound',
    'surprise-canUseReactions',
    'trying-again-advice',
    'two-weapon-penalties',
    'untrained-skill-target',
    'cover-resolveHit',
    'cover-startingAP',
    'pinning-resolveTest',
    'pinning-escapeTest',
    'fatigue-threshold',
    'fatigue-unconscious',
    'fatigue-characteristic-halved',
    'fear-testPenalty',
    'fear-resolveTest',
    'fear-shockTableModifier',
    'hit-locations-reverseDigits',
    'hit-locations-forRoll',
    'hit-locations-dropdown',
    'hazards-fallingDice',
    'hazards-fallingFormula',
    'hazards-drowningTest',
    'healing-damageTier',
    'healing-naturalDays',
    'attack-options-availableModes',
    'attack-options-situationalModifiers',
    'attack-options-aimModifier',
] as const;

type FlowName = (typeof RULE_PURE_FLOWS)[number];

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
                    return { __importError: err instanceof Error ? err.message : String(err) };
                }
            };
            const guarded = (name: FlowName, fn: () => boolean | string): void => {
                try {
                    const r = fn();
                    if (typeof r === 'string') record(name, false, r);
                    else record(name, r, null);
                } catch (err) {
                    record(name, false, err instanceof Error ? err.message : String(err));
                }
            };

            // ---------- difficulties ----------
            const difficulties = await loadModule('difficulties');
            if (difficulties?.__importError != null) {
                record('difficulties-rollDifficulties', false, difficulties.__importError);
            } else {
                guarded('difficulties-rollDifficulties', () => {
                    const ladder = difficulties.rollDifficulties();
                    return ladder !== null && typeof ladder === 'object' && ladder['0'] === 'Challenging (+0)' && Object.keys(ladder).length >= 13;
                });
            }

            // ---------- scatter ----------
            const scatter = await loadModule('scatter');
            if (scatter?.__importError != null) {
                for (const k of ['scatter-buildVector', 'scatter-scaleForArea', 'scatter-labelForDirection'] as const) record(k, false, scatter.__importError);
            } else {
                guarded('scatter-buildVector', () => {
                    const inRange = scatter.buildScatterVector(5, 3);
                    const clampedLow = scatter.buildScatterVector(0, -3);
                    const clampedHigh = scatter.buildScatterVector(99, 7);
                    return (
                        inRange.direction === 5 &&
                        inRange.metres === 3 &&
                        clampedLow.direction === 1 &&
                        clampedLow.metres === 1 &&
                        clampedHigh.direction === 10 &&
                        clampedHigh.metres === 5
                    );
                });
                guarded('scatter-scaleForArea', () => scatter.scaleScatterForArea(3) === 6 && scatter.scaleScatterForArea(50) === 10);
                guarded('scatter-labelForDirection', () => {
                    const label = scatter.labelForDirection(1);
                    return typeof label === 'string' && label.length > 0 && Array.isArray(scatter.DIRECTION_LABELS) && scatter.DIRECTION_LABELS.length === 10;
                });
            }

            // ---------- surprise ----------
            const surprise = await loadModule('surprise');
            if (surprise?.__importError != null) {
                for (const k of ['surprise-toHitBonus', 'surprise-canActThisRound', 'surprise-canUseReactions'] as const)
                    record(k, false, surprise.__importError);
            } else {
                guarded('surprise-toHitBonus', () => {
                    const yes = surprise.getSurpriseToHitBonus({ targetIsSurprised: true, currentRound: 1 });
                    const no = surprise.getSurpriseToHitBonus({ targetIsSurprised: false, currentRound: 1 });
                    const expired = surprise.getSurpriseToHitBonus({ targetIsSurprised: true, currentRound: 2 });
                    return yes === 30 && no === 0 && expired === 0;
                });
                guarded(
                    'surprise-canActThisRound',
                    () =>
                        surprise.canActThisRound(false, 1) === true &&
                        surprise.canActThisRound(true, 1) === false &&
                        surprise.canActThisRound(true, 2) === true,
                );
                guarded(
                    'surprise-canUseReactions',
                    () => typeof surprise.canUseReactions(true, 1) === 'boolean' && typeof surprise.canUseReactions(false, 3) === 'boolean',
                );
            }

            // ---------- trying-again ----------
            const tryingAgain = await loadModule('trying-again');
            if (tryingAgain?.__importError != null) {
                record('trying-again-advice', false, tryingAgain.__importError);
            } else {
                guarded('trying-again-advice', () => {
                    const first = tryingAgain.getTryAgainAdvice('inquiry', 0);
                    const blocked = tryingAgain.getTryAgainAdvice('inquiry', 1);
                    const cumulative = tryingAgain.getTryAgainAdvice('charm', 2);
                    const neutral = tryingAgain.getTryAgainAdvice('weaponSkill', 5);
                    return (
                        first.blocksByConvention === false &&
                        blocked.blocksByConvention === true &&
                        cumulative.cumulativePenalty === -20 &&
                        neutral.cumulativePenalty === 0
                    );
                });
            }

            // ---------- two-weapon-fighting ----------
            const twoWeapon = await loadModule('two-weapon-fighting');
            if (twoWeapon?.__importError != null) {
                record('two-weapon-penalties', false, twoWeapon.__importError);
            } else {
                guarded('two-weapon-penalties', () => {
                    const baseline = twoWeapon.resolveTwoWeaponPenalties({ isMelee: true, talents: new Set<string>() });
                    const wielder = twoWeapon.resolveTwoWeaponPenalties({ isMelee: true, talents: new Set(['Two-Weapon Wielder (Melee)']) });
                    const master = twoWeapon.resolveTwoWeaponPenalties({ isMelee: false, talents: new Set(['Two-Weapon Master (Ranged)']) });
                    return (
                        baseline.mainPenalty === -20 &&
                        baseline.offPenalty === -20 &&
                        wielder.mainPenalty === 0 &&
                        master.mainPenalty === 0 &&
                        master.offPenalty === 0
                    );
                });
            }

            // ---------- untrained-skill ----------
            const untrained = await loadModule('untrained-skill');
            if (untrained?.__importError != null) {
                record('untrained-skill-target', false, untrained.__importError);
            } else {
                guarded('untrained-skill-target', () => {
                    const trained = untrained.resolveUntrainedTarget({ advance: 10, isBasic: true, characteristicTotal: 40 });
                    const advanced = untrained.resolveUntrainedTarget({ advance: 0, isBasic: false, characteristicTotal: 35 });
                    const halved = untrained.resolveUntrainedTarget({ advance: 0, isBasic: true, characteristicTotal: 35, halveOnNonBasic: true });
                    const alt = untrained.resolveUntrainedTarget({ advance: 10, isBasic: true, characteristicTotal: 30, altCharacteristicTotal: 50 });
                    return trained.target === 40 && advanced.untrainedAdvanced === true && halved.halved === true && alt.usedAltCharacteristic === true;
                });
            }

            // ---------- cover ----------
            const cover = await loadModule('cover');
            if (cover?.__importError != null) {
                for (const k of ['cover-resolveHit', 'cover-startingAP'] as const) record(k, false, cover.__importError);
            } else {
                guarded('cover-resolveHit', () => {
                    const absorbed = cover.resolveCoverHit({ incomingDamage: 5, coverAP: 8 });
                    const destroyed = cover.resolveCoverHit({ incomingDamage: 4, coverAP: 4 });
                    const overflow = cover.resolveCoverHit({ incomingDamage: 10, coverAP: 4 });
                    return (
                        absorbed.overflowToActor === 0 &&
                        absorbed.coverDestroyed === false &&
                        destroyed.coverDestroyed === true &&
                        overflow.overflowToActor === 6
                    );
                });
                guarded('cover-startingAP', () => typeof cover.startingCoverAP('sandbags') === 'number' && cover.COVER_AP.barricade === 12);
            }

            // ---------- pinning ----------
            const pinning = await loadModule('pinning');
            if (pinning?.__importError != null) {
                for (const k of ['pinning-resolveTest', 'pinning-escapeTest'] as const) record(k, false, pinning.__importError);
            } else {
                guarded('pinning-resolveTest', () => {
                    const plain = pinning.resolvePinningTest({ willpowerTotal: 40 });
                    const modified = pinning.resolvePinningTest({ willpowerTotal: 40, triggerModifier: -10 });
                    const floored = pinning.resolvePinningTest({ willpowerTotal: 5, triggerModifier: -20 });
                    return plain.target === 40 && modified.target === 30 && floored.target === 0;
                });
                guarded('pinning-escapeTest', () => {
                    const noBonus = pinning.resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: false, inCover: false });
                    const inCover = pinning.resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: false, inCover: true });
                    const both = pinning.resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: true, inCover: true });
                    return noBonus.target === 40 && noBonus.favourableBonus === false && inCover.target === 70 && both.target === 70;
                });
            }

            // ---------- fatigue ----------
            const fatigue = await loadModule('fatigue');
            if (fatigue?.__importError != null) {
                for (const k of ['fatigue-threshold', 'fatigue-unconscious', 'fatigue-characteristic-halved'] as const) record(k, false, fatigue.__importError);
            } else {
                guarded('fatigue-threshold', () => fatigue.getFatigueThreshold({ toughnessBonus: 4, willpowerBonus: 3 }) === 7);
                guarded('fatigue-unconscious', () => {
                    const profile = { toughnessBonus: 4, willpowerBonus: 3 };
                    return (
                        fatigue.isFatigueUnconscious({ ...profile, fatigueLevel: 7 }) === false &&
                        fatigue.isFatigueUnconscious({ ...profile, fatigueLevel: 8 }) === true
                    );
                });
                guarded(
                    'fatigue-characteristic-halved',
                    () =>
                        fatigue.isCharacteristicHalvedByFatigue(2, 4) === true &&
                        fatigue.isCharacteristicHalvedByFatigue(5, 4) === false &&
                        fatigue.isCharacteristicHalvedByFatigue(3, 0) === false,
                );
            }

            // ---------- fear ----------
            const fear = await loadModule('fear');
            if (fear?.__importError != null) {
                for (const k of ['fear-testPenalty', 'fear-resolveTest', 'fear-shockTableModifier'] as const) record(k, false, fear.__importError);
            } else {
                guarded('fear-testPenalty', () => fear.getFearTestPenalty(2) === 20 && fear.getFearTestPenalty(10) === 40 && fear.getFearTestPenalty(-3) === 0);
                guarded('fear-resolveTest', () => {
                    const noOp = fear.resolveFearTest({ willpowerTotal: 40, fearRating: 0 });
                    const rated = fear.resolveFearTest({ willpowerTotal: 40, fearRating: 2 });
                    const floored = fear.resolveFearTest({ willpowerTotal: 20, fearRating: 4 });
                    return noOp.isNoOp === true && rated.target === 20 && rated.isNoOp === false && floored.target === 0;
                });
                guarded('fear-shockTableModifier', () => fear.getShockTableRollModifier(1) === 0 && fear.getShockTableRollModifier(3) === 20);
            }

            // ---------- hit-locations ----------
            const hitLocations = await loadModule('hit-locations');
            if (hitLocations?.__importError != null) {
                for (const k of ['hit-locations-reverseDigits', 'hit-locations-forRoll', 'hit-locations-dropdown'] as const)
                    record(k, false, hitLocations.__importError);
            } else {
                guarded(
                    'hit-locations-reverseDigits',
                    () =>
                        hitLocations.reverseAttackRollDigits(23) === 32 &&
                        hitLocations.reverseAttackRollDigits(33) === 33 &&
                        hitLocations.reverseAttackRollDigits(100) === 1,
                );
                guarded('hit-locations-forRoll', () => {
                    const loc = hitLocations.getHitLocationForRoll(23);
                    return typeof loc === 'string' && loc.length > 0;
                });
                guarded('hit-locations-dropdown', () => {
                    const dd = hitLocations.hitDropdown();
                    return (
                        dd !== null &&
                        typeof dd === 'object' &&
                        Object.keys(dd).length > 0 &&
                        Array.isArray(hitLocations.hitLocationNames()) &&
                        hitLocations.hitLocationNames().length > 0
                    );
                });
            }

            // ---------- hazards ----------
            const hazards = await loadModule('hazards');
            if (hazards?.__importError != null) {
                for (const k of ['hazards-fallingDice', 'hazards-fallingFormula', 'hazards-drowningTest'] as const) record(k, false, hazards.__importError);
            } else {
                guarded(
                    'hazards-fallingDice',
                    () => hazards.getFallingDiceCount(1) === 0 && hazards.getFallingDiceCount(2) === 1 && hazards.getFallingDiceCount(7) === 3,
                );
                guarded(
                    'hazards-fallingFormula',
                    () =>
                        hazards.getFallingDamageFormula(1) === '' &&
                        hazards.getFallingDamageFormula(4) === '2d10' &&
                        hazards.getFallingDamageFormula(10) === '5d10',
                );
                guarded('hazards-drowningTest', () => {
                    const r1 = hazards.resolveDrowningTest({ toughnessTotal: 40, roundsSubmerged: 1 });
                    const r3 = hazards.resolveDrowningTest({ toughnessTotal: 40, roundsSubmerged: 3 });
                    return r1.target === 40 && r3.target === 20;
                });
            }

            // ---------- healing ----------
            const healing = await loadModule('healing');
            if (healing?.__importError != null) {
                for (const k of ['healing-damageTier', 'healing-naturalDays'] as const) record(k, false, healing.__importError);
            } else {
                guarded(
                    'healing-damageTier',
                    () =>
                        healing.getDamageTier(10, 10) === 'unharmed' &&
                        healing.getDamageTier(5, 10) === 'lightlyDamaged' &&
                        healing.getDamageTier(0, 10) === 'heavilyDamaged',
                );
                guarded(
                    'healing-naturalDays',
                    () =>
                        healing.getNaturalHealingDays('unharmed') === 0 &&
                        healing.getNaturalHealingDays('lightlyDamaged') === 1 &&
                        healing.getNaturalHealingDays('heavilyDamaged') === 7,
                );
            }

            // ---------- attack-options ----------
            const attackOptions = await loadModule('attack-options');
            if (attackOptions?.__importError != null) {
                for (const k of ['attack-options-availableModes', 'attack-options-situationalModifiers', 'attack-options-aimModifier'] as const)
                    record(k, false, attackOptions.__importError);
            } else {
                guarded('attack-options-availableModes', () => {
                    const weapon = { isRanged: true, system: { attack: { rateOfFire: { semi: 3, full: 10 } } } };
                    const ranged = attackOptions.getAvailableAttackModes(weapon);
                    const melee = attackOptions.getAvailableAttackModes({ isRanged: false, system: {} });
                    const first = ranged[0] as { available?: unknown } | undefined;
                    return Array.isArray(ranged) && ranged.length > 0 && typeof first?.available === 'boolean' && Array.isArray(melee) && melee.length > 0;
                });
                guarded('attack-options-situationalModifiers', () => {
                    const ranged = attackOptions.getSituationalModifiers(true);
                    const melee = attackOptions.getSituationalModifiers(false);
                    return Array.isArray(ranged) && ranged.length > 0 && Array.isArray(melee) && melee.length > 0;
                });
                guarded(
                    'attack-options-aimModifier',
                    () => typeof attackOptions.getAimModifier('full') === 'number' && attackOptions.getAimModifier('does-not-exist') === 0,
                );
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rules pure-logic surface — batch 2 (Tier B)', () => {
    test('every rules/* RAW resolver returns the expected value without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rule-pure.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of RULE_PURE_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${RULE_PURE_FLOWS.length} rules pure-logic flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
