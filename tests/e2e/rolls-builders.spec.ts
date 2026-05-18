// Keys MUST match the ROLLS_BUILDER_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).

import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the pure helpers and data builders in
 * `src/module/rolls/*` and `src/module/dice/basic-roll.ts`. These
 * functions are side-effect-free arithmetic / state-tracking shapes that
 * the weapon-attack and roll-methods specs never reach in headless mode
 * (they route through Actor methods that short-circuit before touching
 * these builders, or require canvas / token selection that does not
 * exist headlessly).
 *
 * `assign-damage-data.ts` and `force-field-data.ts` are intentionally
 * NOT exercised here — `rolls-data.spec.ts` already drives them under the
 * `roll-data.flow` dimension.
 *
 * Modules exercised:
 *   - `roll-helpers.ts` — `uuid()` (v4 shape), `getDegree()`,
 *     `getOpposedDegrees()` (every branch of the win/lose matrix),
 *     `recursiveUpdate()` / `handleDotNotationUpdate()` (dot-path
 *     traversal + numeric coercion + nested merge + delete branch).
 *   - `roll-data.ts` — `clampModifierToCap()` (+ `ROLL_MODIFIER_CAP`),
 *     `RollData` constructor + `modifiedTarget` / `activeModifiers`
 *     getters + `hasAttackSpecial` / `getAttackSpecial` +
 *     `modifiersToRollData` + `calculateTotalModifiers`, and the
 *     `WeaponRollData` / `PsychicRollData` constructors (template wiring).
 *   - `action-data.ts` — `ActionData` constructor + `addEffect` /
 *     `createEffectData` (effect-name switch) + the
 *     `WeaponActionData` / `PsychicActionData` / `SimpleSkillData`
 *     subclass constructors (rollData / damageData / template wiring).
 *   - `extended-test-data.ts` — `ExtendedTestData` constructor
 *     (threshold clamp) + `recordAttempt` (success vs fail counter) +
 *     `isComplete` / `isFailed` / `remaining` getters.
 *   - `damage-data.ts` — `replaceDamageDieWithDoS()` free function +
 *     `Hit` constructor + `Hit.replaceDamageDieWithDoS` method +
 *     `_totalDamage` / `_totalPenetration` + `DamageData.reset()` +
 *     `scatterDirection()` (returns one of the 8 compass strings).
 *   - `dice/basic-roll.ts` — `BasicRollWH40K.constructFormula()` (pure
 *     formula assembly: base default + signed flat modifier).
 *
 * Each flow records under `rolls-builder.flow`. Keys MUST match the
 * ROLLS_BUILDER_FLOWS constant in scripts/e2e-coverage.mjs.
 *
 * Collect-failures-then-assert pattern matches rolls-data.spec.ts /
 * weapon-attack.spec.ts.
 */

const ROLLS_BUILDER_FLOWS = [
    'helpers-uuid-shape',
    'helpers-get-degree',
    'helpers-opposed-degrees-matrix',
    'helpers-recursive-update-coerce',
    'helpers-handle-dotnotation-delete',
    'roll-data-clamp-modifier-cap',
    'roll-data-constructor-defaults',
    'roll-data-modified-target-getter',
    'roll-data-active-modifiers-getter',
    'roll-data-attack-special-lookup',
    'roll-data-modifiers-to-rolldata',
    'roll-data-calculate-total-modifiers',
    'roll-data-weapon-subclass-template',
    'roll-data-psychic-subclass-template',
    'action-data-constructor',
    'action-data-effect-switch',
    'action-data-weapon-subclass',
    'action-data-psychic-subclass',
    'extended-test-threshold-and-ladder',
    'extended-test-failure-budget',
    'damage-replace-die-with-dos',
    'damage-hit-totals-and-reset',
    'damage-scatter-direction',
    'basic-roll-construct-formula',
] as const;

type FlowName = (typeof ROLLS_BUILDER_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeRollsBuilders(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (flows: readonly string[]): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: string, ok: boolean, detail: string | null = null): void => {
                out.push({ name: name as FlowName, ok, detail });
            };

            // Built specifier so TS doesn't try to resolve the Foundry-served
            // URL at compile time (mirrors weapon-attack.spec.ts).
            const dynImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
            const base = '/systems/wh40k-rpg/module';

            // ---------- roll-helpers ----------
            let helpersMod: any;
            try {
                helpersMod = await dynImport(`${base}/rolls/roll-helpers.js`);
            } catch (err) {
                for (const f of flows.filter((k) => k.startsWith('helpers-')))
                    record(f, false, `import: ${String((err as Error)?.message ?? err)}`);
                helpersMod = null;
            }
            if (helpersMod) {
                const { uuid, getDegree, getOpposedDegrees, recursiveUpdate, handleDotNotationUpdate } = helpersMod;

                try {
                    const id = uuid();
                    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(id));
                    const distinct = uuid() !== uuid();
                    record('helpers-uuid-shape', v4 && distinct, `id=${String(id)} v4=${v4} distinct=${distinct}`);
                } catch (err) {
                    record('helpers-uuid-shape', false, String((err as Error)?.message ?? err));
                }

                try {
                    // getDegree(a,b) = floor(a/10) - floor(b/10)
                    const a = getDegree(55, 23);
                    const b = getDegree(10, 90);
                    record('helpers-get-degree', a === 3 && b === -8, `getDegree(55,23)=${a} getDegree(10,90)=${b}`);
                } catch (err) {
                    record('helpers-get-degree', false, String((err as Error)?.message ?? err));
                }

                try {
                    // Drive every branch of the opposed-degrees matrix.
                    const winBoth = getOpposedDegrees(3, 0, 1, 0); // dos>0, opposedDos>0 → 3-1=2
                    const winLose = getOpposedDegrees(3, 0, 0, 2); // dos>0, opposedDos<=0 → 3+2=5
                    const loseWin = getOpposedDegrees(0, 2, 1, 0); // dos<=0, opposedDos>0 → -(2+1)=-3
                    const loseLose = getOpposedDegrees(0, 2, 0, 1); // dos<=0, opposedDos<=0 → -(2-1)=-1
                    const ok = winBoth === 2 && winLose === 5 && loseWin === -3 && loseLose === -1;
                    record('helpers-opposed-degrees-matrix', ok, `winBoth=${winBoth} winLose=${winLose} loseWin=${loseWin} loseLose=${loseLose}`);
                } catch (err) {
                    record('helpers-opposed-degrees-matrix', false, String((err as Error)?.message ?? err));
                }

                try {
                    // recursiveUpdate merges nested objects and coerces a numeric
                    // leaf when the existing value is a number.
                    const target: Record<string, unknown> = { system: { wounds: { value: 10, max: 12 } } };
                    recursiveUpdate(target, { system: { wounds: { value: '7' } } });
                    const wounds = (target['system'] as { wounds: { value: unknown; max: unknown } }).wounds;
                    const ok = wounds.value === 7 && wounds.max === 12;
                    record('helpers-recursive-update-coerce', ok, `value=${String(wounds.value)} (${typeof wounds.value}) max=${String(wounds.max)}`);
                } catch (err) {
                    record('helpers-recursive-update-coerce', false, String((err as Error)?.message ?? err));
                }

                try {
                    // handleDotNotationUpdate with a string dot-path; null value
                    // deletes the leaf.
                    const target: Record<string, unknown> = { a: { b: { c: 1, d: 2 } } };
                    handleDotNotationUpdate(target, 'a.b.c', null);
                    const inner = (target['a'] as { b: Record<string, unknown> }).b;
                    const deleted = !('c' in inner) && inner['d'] === 2;
                    record('helpers-handle-dotnotation-delete', deleted, `keys=${Object.keys(inner).join(',')}`);
                } catch (err) {
                    record('helpers-handle-dotnotation-delete', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- roll-data ----------
            let rollDataMod: any;
            try {
                rollDataMod = await dynImport(`${base}/rolls/roll-data.js`);
            } catch (err) {
                for (const f of flows.filter((k) => k.startsWith('roll-data-')))
                    record(f, false, `import: ${String((err as Error)?.message ?? err)}`);
                rollDataMod = null;
            }
            if (rollDataMod) {
                const { RollData, WeaponRollData, PsychicRollData, clampModifierToCap, ROLL_MODIFIER_CAP } = rollDataMod;

                try {
                    const cap = ROLL_MODIFIER_CAP;
                    const within = clampModifierToCap(45);
                    const over = clampModifierToCap(100);
                    const under = clampModifierToCap(-200);
                    const nan = clampModifierToCap(Number.NaN);
                    const ok =
                        cap === 60 &&
                        within.clamped === 45 &&
                        within.capFired === false &&
                        over.clamped === 60 &&
                        over.raw === 100 &&
                        over.capFired === true &&
                        under.clamped === -60 &&
                        under.capFired === true &&
                        nan.clamped === 0 &&
                        nan.capFired === false;
                    record('roll-data-clamp-modifier-cap', ok, `cap=${cap} within=${within.clamped} over=${over.clamped} under=${under.clamped} nan=${nan.clamped}`);
                } catch (err) {
                    record('roll-data-clamp-modifier-cap', false, String((err as Error)?.message ?? err));
                }

                try {
                    const rd = new RollData();
                    const ok =
                        rd instanceof RollData &&
                        rd.baseTarget === 0 &&
                        rd.modifierTotal === 0 &&
                        rd.success === false &&
                        typeof rd.modifiers === 'object' &&
                        rd.modifiers.difficulty === 0;
                    record('roll-data-constructor-defaults', ok, `baseTarget=${rd.baseTarget} success=${String(rd.success)}`);
                } catch (err) {
                    record('roll-data-constructor-defaults', false, String((err as Error)?.message ?? err));
                }

                try {
                    const rd = new RollData();
                    rd.baseTarget = 40;
                    rd.modifierTotal = 15;
                    record('roll-data-modified-target-getter', rd.modifiedTarget === 55, `modifiedTarget=${rd.modifiedTarget}`);
                } catch (err) {
                    record('roll-data-modified-target-getter', false, String((err as Error)?.message ?? err));
                }

                try {
                    const rd = new RollData();
                    rd.modifiers = { difficulty: -10, modifier: 0, aim: 5 };
                    const active = rd.activeModifiers;
                    // 0-valued entries are dropped; keys are upper-cased.
                    const ok = active['DIFFICULTY'] === -10 && active['AIM'] === 5 && active['MODIFIER'] === undefined;
                    record('roll-data-active-modifiers-getter', ok, `active=${JSON.stringify(active)}`);
                } catch (err) {
                    record('roll-data-active-modifiers-getter', false, String((err as Error)?.message ?? err));
                }

                try {
                    const rd = new RollData();
                    rd.attackSpecials = [{ name: 'Tearing' }, { name: 'Proven' }];
                    const has = rd.hasAttackSpecial('Tearing');
                    const missing = rd.hasAttackSpecial('Razor Sharp');
                    const got = rd.getAttackSpecial('Proven');
                    const ok = has === true && missing === false && got?.name === 'Proven';
                    record('roll-data-attack-special-lookup', ok, `has=${String(has)} missing=${String(missing)} got=${JSON.stringify(got)}`);
                } catch (err) {
                    record('roll-data-attack-special-lookup', false, String((err as Error)?.message ?? err));
                }

                try {
                    const rd = new RollData();
                    rd.modifiers = { difficulty: -10, modifier: 20, aim: 0 };
                    const { formula, params } = rd.modifiersToRollData();
                    // -10 → "- @difficulty" with param 10; +20 → "+ @modifier" with
                    // param 20; 0-valued aim is omitted.
                    const ok =
                        formula.includes('- @difficulty') &&
                        formula.includes('+ @modifier') &&
                        params['difficulty'] === 10 &&
                        params['modifier'] === 20 &&
                        params['aim'] === undefined;
                    record('roll-data-modifiers-to-rolldata', ok, `formula="${formula}" params=${JSON.stringify(params)}`);
                } catch (err) {
                    record('roll-data-modifiers-to-rolldata', false, String((err as Error)?.message ?? err));
                }

                try {
                    const rd = new RollData();
                    rd.modifiers = { difficulty: -10, modifier: 30, aim: 0 };
                    await rd.calculateTotalModifiers();
                    // Net: -10 + 30 = 20, within the ±60 cap.
                    const ok = rd.modifierTotal === 20 && rd.modifierCapFired === false && rd.rawModifierTotal === 20;
                    record('roll-data-calculate-total-modifiers', ok, `total=${rd.modifierTotal} raw=${rd.rawModifierTotal} capFired=${String(rd.modifierCapFired)}`);
                } catch (err) {
                    record('roll-data-calculate-total-modifiers', false, String((err as Error)?.message ?? err));
                }

                try {
                    const wrd = new WeaponRollData();
                    const ok =
                        wrd instanceof WeaponRollData &&
                        wrd instanceof RollData &&
                        wrd.template === 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs' &&
                        Array.isArray(wrd.weapons) &&
                        wrd.fireRate === 1;
                    record('roll-data-weapon-subclass-template', ok, `template=${wrd.template} fireRate=${wrd.fireRate}`);
                } catch (err) {
                    record('roll-data-weapon-subclass-template', false, String((err as Error)?.message ?? err));
                }

                try {
                    const prd = new PsychicRollData();
                    const ok =
                        prd instanceof PsychicRollData &&
                        prd instanceof RollData &&
                        prd.template === 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs' &&
                        Array.isArray(prd.psychicPowers) &&
                        prd.pr === 0;
                    record('roll-data-psychic-subclass-template', ok, `template=${prd.template} pr=${prd.pr}`);
                } catch (err) {
                    record('roll-data-psychic-subclass-template', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- action-data ----------
            let actionDataMod: any;
            try {
                actionDataMod = await dynImport(`${base}/rolls/action-data.js`);
            } catch (err) {
                for (const f of flows.filter((k) => k.startsWith('action-data-')))
                    record(f, false, `import: ${String((err as Error)?.message ?? err)}`);
                actionDataMod = null;
            }
            if (actionDataMod) {
                const { ActionData, WeaponActionData, PsychicActionData, SimpleSkillData } = actionDataMod;

                try {
                    const ad = new ActionData();
                    const ok =
                        ad instanceof ActionData &&
                        typeof ad.id === 'string' &&
                        ad.id.length === 36 &&
                        ad.rollData !== undefined &&
                        ad.hasDamage === false &&
                        Array.isArray(ad.effects) &&
                        ad.effects.length === 0;
                    record('action-data-constructor', ok, `id.len=${ad.id.length} hasDamage=${String(ad.hasDamage)}`);
                } catch (err) {
                    record('action-data-constructor', false, String((err as Error)?.message ?? err));
                }

                try {
                    const ad = new ActionData();
                    // addEffect appends a {name,effect} pair; createEffectData
                    // expands recognized effect ids through its switch.
                    ad.addEffect('Manual', 'a manual effect');
                    ad.effects = ['jam', 'overheat', 'auto-failure'];
                    ad.createEffectData();
                    const names = ad.effectOutput.map((e: { name: string }) => e.name);
                    const ok =
                        names.includes('Manual') &&
                        names.includes('Jam') &&
                        names.includes('Overheats') &&
                        names.includes('Auto Failure');
                    record('action-data-effect-switch', ok, `names=${names.join(',')}`);
                } catch (err) {
                    record('action-data-effect-switch', false, String((err as Error)?.message ?? err));
                }

                try {
                    const wad = new WeaponActionData();
                    const ok =
                        wad instanceof WeaponActionData &&
                        wad instanceof ActionData &&
                        wad.hasDamage === true &&
                        wad.rollData !== undefined &&
                        wad.damageData !== undefined &&
                        wad.template === 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
                    record('action-data-weapon-subclass', ok, `hasDamage=${String(wad.hasDamage)} template=${wad.template}`);
                } catch (err) {
                    record('action-data-weapon-subclass', false, String((err as Error)?.message ?? err));
                }

                try {
                    const pad = new PsychicActionData();
                    const ssd = new SimpleSkillData();
                    const ok =
                        pad instanceof PsychicActionData &&
                        pad.hasDamage === true &&
                        pad.damageData !== undefined &&
                        ssd instanceof SimpleSkillData &&
                        ssd.hasDamage === false &&
                        ssd.template === 'systems/wh40k-rpg/templates/chat/simple-roll-chat.hbs';
                    record('action-data-psychic-subclass', ok, `psychic.hasDamage=${String(pad.hasDamage)} simple.template=${ssd.template}`);
                } catch (err) {
                    record('action-data-psychic-subclass', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- extended-test-data ----------
            let extMod: any;
            try {
                extMod = await dynImport(`${base}/rolls/extended-test-data.js`);
            } catch (err) {
                for (const f of flows.filter((k) => k.startsWith('extended-test-')))
                    record(f, false, `import: ${String((err as Error)?.message ?? err)}`);
                extMod = null;
            }
            if (extMod) {
                const { ExtendedTestData } = extMod;

                try {
                    // threshold clamps to a minimum of 1; recordAttempt
                    // accumulates DoS on success and counts failures on <=0.
                    const tZero = new ExtendedTestData({ threshold: 0 });
                    const t = new ExtendedTestData({ threshold: 10 });
                    t.recordAttempt(3);
                    t.recordAttempt(0);
                    t.recordAttempt(4);
                    const remainingBefore = t.remaining;
                    t.recordAttempt(5);
                    const ok =
                        tZero.threshold === 1 &&
                        t.accumulatedDoS === 12 &&
                        t.successes === 3 &&
                        t.failures === 1 &&
                        remainingBefore === 3 &&
                        t.isComplete === true &&
                        t.remaining === 0;
                    record('extended-test-threshold-and-ladder', ok, `acc=${t.accumulatedDoS} succ=${t.successes} fail=${t.failures} complete=${String(t.isComplete)}`);
                } catch (err) {
                    record('extended-test-threshold-and-ladder', false, String((err as Error)?.message ?? err));
                }

                try {
                    const budgeted = new ExtendedTestData({ threshold: 10, failureBudget: 2 });
                    budgeted.recordAttempt(0);
                    const notFailedYet = budgeted.isFailed === false;
                    budgeted.recordAttempt(0);
                    const failedNow = budgeted.isFailed === true;
                    const openEnded = new ExtendedTestData({ threshold: 10 });
                    for (let i = 0; i < 50; i += 1) openEnded.recordAttempt(0);
                    const openEndedNeverFails = openEnded.isFailed === false;
                    const ok = notFailedYet && failedNow && openEndedNeverFails;
                    record('extended-test-failure-budget', ok, `notFailedYet=${notFailedYet} failedNow=${failedNow} openEnded=${openEndedNeverFails}`);
                } catch (err) {
                    record('extended-test-failure-budget', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- damage-data ----------
            let damageMod: any;
            try {
                damageMod = await dynImport(`${base}/rolls/damage-data.js`);
            } catch (err) {
                for (const f of flows.filter((k) => k.startsWith('damage-')))
                    record(f, false, `import: ${String((err as Error)?.message ?? err)}`);
                damageMod = null;
            }
            if (damageMod) {
                const { replaceDamageDieWithDoS, Hit, WeaponDamageData, scatterDirection } = damageMod;

                try {
                    // Replaces the lowest active die by default; returns null
                    // for an empty pool or negative DoS.
                    const dice = [{ result: 7 }, { result: 2 }, { result: 5 }];
                    const outcome = replaceDamageDieWithDoS(dice, 4);
                    const nullEmpty = replaceDamageDieWithDoS([], 4);
                    const nullNeg = replaceDamageDieWithDoS([{ result: 2 }], -1);
                    const ok =
                        outcome !== null &&
                        outcome.replacedIndex === 1 &&
                        outcome.previous === 2 &&
                        outcome.delta === 2 &&
                        dice[1]?.result === 4 &&
                        nullEmpty === null &&
                        nullNeg === null;
                    record('damage-replace-die-with-dos', ok, `outcome=${JSON.stringify(outcome)}`);
                } catch (err) {
                    record('damage-replace-die-with-dos', false, String((err as Error)?.message ?? err));
                }

                try {
                    const hit = new Hit();
                    hit.damage = 7 + 2 + 5;
                    hit.modifiers = { strength: 3 };
                    hit.penetration = 4;
                    hit.penetrationModifiers = { razer: 1 };
                    hit._totalDamage();
                    hit._totalPenetration();
                    const totalsOk = hit.totalDamage === 17 && hit.totalPenetration === 5;
                    // Hit.replaceDamageDieWithDoS over a synthetic damageRoll.
                    hit.damage = 7 + 2 + 5;
                    hit.modifiers = {};
                    hit.damageRoll = {
                        terms: [
                            {
                                results: [
                                    { result: 7, active: true },
                                    { result: 2, active: true },
                                    { result: 5, active: true },
                                ],
                            },
                        ],
                    };
                    const replaced = hit.replaceDamageDieWithDoS(6);
                    const replaceOk = replaced === true && hit.damage === 18 && hit.totalDamage === 18;
                    // DamageData.reset() clears hits + additionalHits.
                    const dd = new WeaponDamageData();
                    dd.hits.push(hit);
                    dd.additionalHits = 4;
                    dd.reset();
                    const resetOk = dd.hits.length === 0 && dd.additionalHits === 0;
                    record('damage-hit-totals-and-reset', totalsOk && replaceOk && resetOk, `totals=${totalsOk} replace=${replaceOk} reset=${resetOk}`);
                } catch (err) {
                    record('damage-hit-totals-and-reset', false, String((err as Error)?.message ?? err));
                }

                try {
                    const dir = scatterDirection();
                    const valid = ['north west', 'north', 'north east', 'west', 'east', 'south west', 'south', 'south east'];
                    record('damage-scatter-direction', valid.includes(String(dir)), `dir="${String(dir)}"`);
                } catch (err) {
                    record('damage-scatter-direction', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- dice/basic-roll ----------
            let basicRollMod: any;
            try {
                basicRollMod = await dynImport(`${base}/dice/basic-roll.js`);
            } catch (err) {
                record('basic-roll-construct-formula', false, `import: ${String((err as Error)?.message ?? err)}`);
                basicRollMod = null;
            }
            if (basicRollMod) {
                try {
                    const BasicRollWH40K = basicRollMod.default ?? basicRollMod.BasicRollWH40K;
                    if (typeof BasicRollWH40K?.constructFormula !== 'function') {
                        record('basic-roll-construct-formula', false, `constructFormula missing (keys: ${Object.keys(basicRollMod).join(',')})`);
                    } else {
                        const dflt = BasicRollWH40K.constructFormula({});
                        const plus = BasicRollWH40K.constructFormula({ base: '1d10', modifier: '3' });
                        const minus = BasicRollWH40K.constructFormula({ modifier: '-5' });
                        const ok =
                            dflt === '1d100' &&
                            plus === '1d10 + 3' &&
                            minus === '1d100 - 5';
                        record('basic-roll-construct-formula', ok, `default="${dflt}" plus="${plus}" minus="${minus}"`);
                    }
                } catch (err) {
                    record('basic-roll-construct-formula', false, String((err as Error)?.message ?? err));
                }
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, ROLLS_BUILDER_FLOWS);
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rolls / dice pure builders (Tier B)', () => {
    test('every rolls/* + basic-roll pure builder surface returns the expected shape', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRollsBuilders(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rolls-builder.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of ROLLS_BUILDER_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(
            failures,
            `${failures.length}/${ROLLS_BUILDER_FLOWS.length} rolls-builder flows failed:\n  - ${failures.join('\n  - ')}`,
        ).toEqual([]);
    });
});
