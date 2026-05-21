// Keys MUST match the DICE_ENGINE_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).

import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the dice engine itself — `src/module/dice/_module.ts`,
 * `src/module/dice/basic-roll.ts`, and the `D100Roll` subclass in
 * `src/module/dice/d100-roll.ts`.
 *
 * The existing dice surface coverage is shallow and indirect:
 *   - `rolls-data.spec.ts` calls `D100Roll.test({ target: 50 })` exactly once
 *     (the canonical static dispatcher, goes through the config dialog path).
 *   - `d100-roll-extras.spec.ts` exercises only the two static template/chat
 *     data builders (`_prepareTemplateData` / `_prepareChatData`).
 *
 * Neither drives the engine internals. This spec goes deeper, against an
 * actually-evaluated roll instance, exercising the source branches that no
 * other Tier B spec reaches directly:
 *
 *   basic-roll.ts:
 *     - `_module.ts` barrel re-exports (`BasicRollWH40K`, `D100Roll`,
 *       `RollConfigurationDialog`).
 *     - `BasicRollWH40K.constructFormula` — base, positive-modifier, and
 *       negative-modifier branches.
 *     - `BasicRollWH40K.evaluate(config)` static convenience entry
 *       (buildConfigure → buildEvaluate, no chat post).
 *     - `toJSON()` configuration augmentation + `fromData()` round-trip
 *       restore of the custom `configuration` bag.
 *
 *   d100-roll.ts:
 *     - `constructFormula` override (always `1d100`, modifiers ignored).
 *     - `target` getter (reads `configuration['target']`).
 *     - `isSuccess` / `isFailure`, `degreesOfSuccess` / `degreesOfFailure`,
 *       `degrees` / `absoluteDegrees` arithmetic.
 *     - `isCriticalSuccess` / `isCriticalFailure` (natural-band + DoS/DoF).
 *     - `isDoubles` / `triggersRighteousFury`.
 *     - `D100Roll.evaluate({ configure: false })` static (no dialog).
 *     - `getTooltip()` instance enhancement (target / result / crit / doubles
 *       summary injection).
 *
 * Strategy mirrors `rules-pure-logic.spec.ts` / `d100-roll-extras.spec.ts`:
 * a single `page.evaluate` round-trip dynamic-imports the built dice modules
 * and the `_module.ts` barrel from the running Foundry server, then drives
 * each flow against a constructed-and-evaluated roll. The degree/critical/
 * doubles getters depend only on `evaluatedTotal` (`Roll.total`) and the
 * configured `target`; we pin `total` deterministically on the roll instance
 * so the d100-RNG can't make assertions flaky while still exercising the real
 * source getters. System-agnostic: the dice engine is shared by all seven
 * homologated systems and these probes never touch actor/item data.
 *
 * Collect-failures-then-assert pattern matches d100-roll-extras.spec.ts.
 *
 * Keep DICE_ENGINE_FLOWS in sync with the equivalent constant in
 * `scripts/e2e-coverage.mjs` — that is the coverage denominator and must
 * agree with the recordCoverage keys here.
 */

const DICE_ENGINE_FLOWS = [
    'dice-module-barrel-exports',
    'basic-roll-construct-formula-base',
    'basic-roll-construct-formula-positive-mod',
    'basic-roll-construct-formula-negative-mod',
    'basic-roll-evaluate-static-no-chat',
    'basic-roll-tojson-fromdata-roundtrip',
    'd100-construct-formula-ignores-modifier',
    'd100-target-getter',
    'd100-success-degrees-of-success',
    'd100-failure-degrees-of-failure',
    'd100-degrees-signed-and-absolute',
    'd100-critical-success',
    'd100-critical-failure',
    'd100-doubles-righteous-fury',
    'd100-evaluate-static-no-dialog',
    'd100-get-tooltip-enhances',
] as const;

type FlowName = (typeof DICE_ENGINE_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeDiceEngine(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (flows: readonly string[]): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported Foundry modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: string, ok: boolean, detail: string | null = null): void => {
                out.push({ name: name as FlowName, ok, detail });
            };

            const base = '/systems/wh40k-rpg';

            // ---- dynamic imports of the dice engine ----
            let basicMod: any;
            let d100Mod: any;
            let barrelMod: any;
            try {
                basicMod = await import(`${base}/module/dice/basic-roll.js`);
                d100Mod = await import(`${base}/module/dice/d100-roll.js`);
                barrelMod = await import(`${base}/module/dice/_module.js`);
            } catch (err) {
                for (const f of flows) record(f, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                return out;
            }

            const BasicRollWH40K = basicMod.default ?? basicMod.BasicRollWH40K;
            const D100Roll = d100Mod.default ?? d100Mod.D100Roll;
            if (typeof BasicRollWH40K !== 'function' || typeof D100Roll !== 'function') {
                for (const f of flows) {
                    record(f, false, `class export missing (basic keys=${Object.keys(basicMod).join(',')} d100 keys=${Object.keys(d100Mod).join(',')})`);
                }
                return out;
            }

            /**
             * Build a D100Roll, evaluate it through the real Roll lifecycle,
             * then pin `_total` deterministically so the degree/critical/
             * doubles getters are stable. The getters still run against the
             * real source — only the RNG input is fixed.
             */
            const makeD100 = async (total: number, config: Record<string, unknown>): Promise<any> => {
                const roll = new D100Roll('1d100');
                if (typeof roll.evaluate === 'function') {
                    await roll.evaluate();
                }
                // D100Roll.evaluatedTotal reads `this.total`; Foundry's Roll
                // exposes `_total` as the backing field after evaluation.
                roll._total = total;
                roll.configuration = { ...config };
                return roll;
            };

            // ---- Flow: dice-module-barrel-exports ----
            try {
                const hasBasic = (barrelMod.BasicRollWH40K ?? barrelMod.default) !== undefined;
                const hasD100 = barrelMod.D100Roll !== undefined;
                const hasDialog = barrelMod.RollConfigurationDialog !== undefined;
                const ok = hasBasic && hasD100 && hasDialog;
                record('dice-module-barrel-exports', ok, `BasicRollWH40K=${hasBasic} D100Roll=${hasD100} RollConfigurationDialog=${hasDialog}`);
            } catch (err) {
                record('dice-module-barrel-exports', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: basic-roll-construct-formula-base ----
            try {
                const f = BasicRollWH40K.constructFormula({});
                record('basic-roll-construct-formula-base', f === '1d100', `formula=${String(f)}`);
            } catch (err) {
                record('basic-roll-construct-formula-base', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: basic-roll-construct-formula-positive-mod ----
            try {
                const f = BasicRollWH40K.constructFormula({ modifier: 5 });
                record('basic-roll-construct-formula-positive-mod', typeof f === 'string' && f.includes('+ 5'), `formula=${String(f)}`);
            } catch (err) {
                record('basic-roll-construct-formula-positive-mod', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: basic-roll-construct-formula-negative-mod ----
            try {
                const f = BasicRollWH40K.constructFormula({ base: '2d10', modifier: -3 });
                const ok = typeof f === 'string' && f.startsWith('2d10') && f.includes('- 3');
                record('basic-roll-construct-formula-negative-mod', ok, `formula=${String(f)}`);
            } catch (err) {
                record('basic-roll-construct-formula-negative-mod', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: basic-roll-evaluate-static-no-chat ----
            // BasicRollWH40K.evaluate(config) runs buildConfigure +
            // buildEvaluate (no chat post) and returns an evaluated instance.
            try {
                const evaluated = await BasicRollWH40K.evaluate({ configure: false, dialog: false, base: '1d100' });
                const ok =
                    evaluated !== null &&
                    typeof evaluated === 'object' &&
                    typeof evaluated.total === 'number' &&
                    evaluated.configuration !== undefined &&
                    evaluated instanceof BasicRollWH40K;
                record('basic-roll-evaluate-static-no-chat', ok, `total=${evaluated?.total} hasConfig=${evaluated?.configuration !== undefined}`);
            } catch (err) {
                record('basic-roll-evaluate-static-no-chat', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: basic-roll-tojson-fromdata-roundtrip ----
            // toJSON() augments the serialized bag with `configuration`;
            // fromData() restores it onto the rebuilt roll.
            try {
                const roll = new BasicRollWH40K('1d100');
                if (typeof roll.evaluate === 'function') await roll.evaluate();
                roll.configuration = { target: 42, flavor: 'roundtrip-probe' };
                const json = roll.toJSON();
                const serializedConfig = json.configuration;
                const restored = BasicRollWH40K.fromData(json);
                const restoredConfig = restored?.configuration ?? {};
                const ok =
                    serializedConfig !== undefined &&
                    serializedConfig.target === 42 &&
                    restored instanceof BasicRollWH40K &&
                    restoredConfig.target === 42 &&
                    restoredConfig.flavor === 'roundtrip-probe';
                record('basic-roll-tojson-fromdata-roundtrip', ok, `serialized=${JSON.stringify(serializedConfig)} restored=${JSON.stringify(restoredConfig)}`);
            } catch (err) {
                record('basic-roll-tojson-fromdata-roundtrip', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-construct-formula-ignores-modifier ----
            // The D100Roll override always returns '1d100' — modifiers move
            // the target, never the roll formula.
            try {
                const f = D100Roll.constructFormula({ modifier: 30, base: '3d6' });
                record('d100-construct-formula-ignores-modifier', f === '1d100', `formula=${String(f)}`);
            } catch (err) {
                record('d100-construct-formula-ignores-modifier', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-target-getter ----
            try {
                const roll = await makeD100(50, { target: 65 });
                const withTarget = roll.target === 65;
                const noConfigRoll = await makeD100(50, {});
                const defaultsToZero = noConfigRoll.target === 0;
                record('d100-target-getter', withTarget && defaultsToZero, `target=${roll.target} default=${noConfigRoll.target}`);
            } catch (err) {
                record('d100-target-getter', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-success-degrees-of-success ----
            // target 60, roll 28 → success; DoS = floor((60-28)/10)+1 = 4.
            try {
                const roll = await makeD100(28, { target: 60 });
                const ok = roll.isSuccess === true && roll.isFailure === false && roll.degreesOfSuccess === 4 && roll.degreesOfFailure === 0;
                record('d100-success-degrees-of-success', ok, `isSuccess=${roll.isSuccess} dos=${roll.degreesOfSuccess} dof=${roll.degreesOfFailure}`);
            } catch (err) {
                record('d100-success-degrees-of-success', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-failure-degrees-of-failure ----
            // target 35, roll 67 → failure; DoF = floor((67-35)/10)+1 = 4.
            try {
                const roll = await makeD100(67, { target: 35 });
                const ok = roll.isSuccess === false && roll.isFailure === true && roll.degreesOfFailure === 4 && roll.degreesOfSuccess === 0;
                record('d100-failure-degrees-of-failure', ok, `isFailure=${roll.isFailure} dof=${roll.degreesOfFailure} dos=${roll.degreesOfSuccess}`);
            } catch (err) {
                record('d100-failure-degrees-of-failure', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-degrees-signed-and-absolute ----
            // success → degrees positive == DoS; failure → degrees negative;
            // absoluteDegrees is |degrees|.
            try {
                const success = await makeD100(28, { target: 60 }); // DoS 4
                const failure = await makeD100(67, { target: 35 }); // DoF 4
                const ok = success.degrees === 4 && success.absoluteDegrees === 4 && failure.degrees === -4 && failure.absoluteDegrees === 4;
                record(
                    'd100-degrees-signed-and-absolute',
                    ok,
                    `success.degrees=${success.degrees} failure.degrees=${failure.degrees} abs=${failure.absoluteDegrees}`,
                );
            } catch (err) {
                record('d100-degrees-signed-and-absolute', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-critical-success ----
            // Two branches: natural 01-05, and 3+ DoS on a higher roll.
            try {
                const natural = await makeD100(3, { target: 40 }); // <= 5
                const byDos = await makeD100(20, { target: 60 }); // DoS = floor(40/10)+1 = 5 >= 3
                const notCrit = await makeD100(58, { target: 60 }); // DoS = 1, not crit
                const ok = natural.isCriticalSuccess === true && byDos.isCriticalSuccess === true && notCrit.isCriticalSuccess === false;
                record(
                    'd100-critical-success',
                    ok,
                    `natural=${natural.isCriticalSuccess} byDos=${byDos.isCriticalSuccess} notCrit=${notCrit.isCriticalSuccess}`,
                );
            } catch (err) {
                record('d100-critical-success', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-critical-failure ----
            // Two branches: natural 96-00, and 3+ DoF on a lower roll.
            try {
                const natural = await makeD100(98, { target: 40 }); // >= 96
                const byDof = await makeD100(70, { target: 40 }); // DoF = floor(30/10)+1 = 4 >= 3
                const notFumble = await makeD100(45, { target: 40 }); // DoF = 1, not fumble
                const ok = natural.isCriticalFailure === true && byDof.isCriticalFailure === true && notFumble.isCriticalFailure === false;
                record(
                    'd100-critical-failure',
                    ok,
                    `natural=${natural.isCriticalFailure} byDof=${byDof.isCriticalFailure} notFumble=${notFumble.isCriticalFailure}`,
                );
            } catch (err) {
                record('d100-critical-failure', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-doubles-righteous-fury ----
            // 33 is doubles (tens === ones); on a success it triggers RF.
            try {
                const doublesSuccess = await makeD100(33, { target: 50 }); // doubles + success
                const doublesFailure = await makeD100(77, { target: 50 }); // doubles + failure
                const notDoubles = await makeD100(34, { target: 50 });
                const ok =
                    doublesSuccess.isDoubles === true &&
                    doublesSuccess.triggersRighteousFury === true &&
                    doublesFailure.isDoubles === true &&
                    doublesFailure.triggersRighteousFury === false &&
                    notDoubles.isDoubles === false;
                record(
                    'd100-doubles-righteous-fury',
                    ok,
                    `dblSucc=${doublesSuccess.isDoubles}/${doublesSuccess.triggersRighteousFury} dblFail.rf=${doublesFailure.triggersRighteousFury} notDbl=${notDoubles.isDoubles}`,
                );
            } catch (err) {
                record('d100-doubles-righteous-fury', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-evaluate-static-no-dialog ----
            // D100Roll inherits BasicRollWH40K.evaluate; with configure:false
            // it skips the dialog and returns an evaluated D100Roll whose
            // constructFormula override forced the '1d100' formula.
            try {
                const evaluated = await D100Roll.evaluate({ configure: false, dialog: false, target: 55 });
                const ok =
                    evaluated !== null &&
                    typeof evaluated === 'object' &&
                    evaluated instanceof D100Roll &&
                    typeof evaluated.total === 'number' &&
                    evaluated.formula === '1d100';
                record('d100-evaluate-static-no-dialog', ok, `total=${evaluated?.total} formula=${evaluated?.formula}`);
            } catch (err) {
                record('d100-evaluate-static-no-dialog', false, err instanceof Error ? err.message : String(err));
            }

            // ---- Flow: d100-get-tooltip-enhances ----
            // getTooltip() appends a wh40k-dice-summary block with the
            // target + result + (when applicable) critical / doubles lines.
            try {
                const roll = await makeD100(3, { target: 50 }); // crit success + below-target
                const html = await roll.getTooltip();
                const ok = typeof html === 'string' && html.includes('wh40k-dice-summary') && html.includes('Target: 50') && html.includes('Success');
                record(
                    'd100-get-tooltip-enhances',
                    ok,
                    `len=${typeof html === 'string' ? html.length : 'n/a'} hasSummary=${typeof html === 'string' && html.includes('wh40k-dice-summary')}`,
                );
            } catch (err) {
                record('d100-get-tooltip-enhances', false, err instanceof Error ? err.message : String(err));
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, DICE_ENGINE_FLOWS);
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('dice engine (Tier B)', () => {
    test.setTimeout(120_000);
    test('BasicRollWH40K + D100Roll construction / evaluation / target / DoS / DoF / crit / doubles / serialization', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeDiceEngine(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('dice-engine.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of DICE_ENGINE_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${DICE_ENGINE_FLOWS.length} dice-engine flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
