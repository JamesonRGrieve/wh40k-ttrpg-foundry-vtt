import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage on the system's pure-logic calculator + utility surface
 * (`src/module/rules/*` + `src/module/utils/*`). These modules already have
 * vitest unit tests, but those run in isolation against the source files;
 * driving them through dynamic in-browser `import()` of the deployed bundle
 * (`/systems/wh40k-rpg/module/utils/<name>.js` etc.) is what attributes v8
 * coverage to the dist artifact — which is what `scripts/e2e-source-coverage.mjs`
 * maps back to the TS sources via the bundled source maps.
 *
 * Strategy:
 *   - Each flow dynamic-imports a single dist module and drives one or more
 *     of its exported entry points through realistic inputs.
 *   - For modules that need an actor (`computeArmour`, `evaluateWoundsFormula`),
 *     a throwaway `bc-character` is created with embedded items, fed in, then
 *     torn down at the end of the spec.
 *   - For pure utilities (`calculateRangeBracket`, `calculateRangeModifier`,
 *     `isOutOfRange`, `clampSubtletyLoss`, `parseTBMultiplier`,
 *     `parseDiceRoll`, `describeWoundsFormula`, `describeFateFormula`), the
 *     module is imported and called with synthetic inputs — no game state
 *     required.
 *   - All failures collect into a single array and assert at the end so the
 *     report shows every miss in one pass rather than first-fail masking.
 *
 * Each flow records under `calculator.flow`. The dimension and its enumerable
 * key list live in `scripts/e2e-coverage.mjs` (`CALCULATOR_FLOWS`).
 */

const FLOWS = [
    'armour-calculator-aggregates-locations',
    'armour-calculator-equipped-only',
    'range-calculator-band',
    'range-calculator-extreme',
    'formula-evaluator-evaluates-string',
    'formula-evaluator-with-actor-data',
    'subtlety-clamp-edge-cases',
] as const;

const ARMOUR_URL = '/systems/wh40k-rpg/module/utils/armour-calculator.js';
const RANGE_URL = '/systems/wh40k-rpg/module/utils/range-calculator.js';
const FORMULA_URL = '/systems/wh40k-rpg/module/utils/formula-evaluator.js';
const SUBTLETY_URL = '/systems/wh40k-rpg/module/rules/subtlety-adjusters.js';

interface FlowResult {
    name: string;
    passed: boolean;
    detail: string | null;
}

/**
 * Create a throwaway bc-character with a known toughness bonus + equipped
 * armour item layout so `computeArmour` has a deterministic input. Returned
 * id is used by both armour flows (which embed/replace items) and the
 * actor-data formula flow.
 */
async function createProbeActor(page: Page): Promise<{ id: string | null; error: string | null }> {
    return page.evaluate(async () => {
        const Actor = (
            globalThis as unknown as {
                Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
            }
        ).Actor;
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
                name: 'calc-spec-probe',
                type: 'bc-character',
                system: {
                    gameSystem: 'bc',
                    characteristics: {
                        toughness: { value: 40 },
                        weaponSkill: { value: 35 },
                        willpower: { value: 30 },
                    },
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: String((err as Error)?.message ?? err) };
        }
    });
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const game = (
            globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
            }
        ).game;
        await game?.actors?.get?.(id)?.delete?.();
    }, actorId);
}

/**
 * Replace any existing armour items on the actor with a fresh set. Each item
 * is an `armour` typed embedded doc with explicit `armourPoints` and
 * `equipped` flags so `computeArmour` sees deterministic input regardless of
 * what defaults the schema applies.
 */
async function setArmourItems(
    page: Page,
    actorId: string,
    items: Array<{ name: string; equipped: boolean; armourPoints: Record<string, number> }>,
): Promise<{ ok: boolean; error: string | null }> {
    return page.evaluate(
        async ({ actorId, items }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | {
                                      items?: { filter?: (fn: (i: { type?: string; id?: string }) => boolean) => Array<{ id?: string }> };
                                      deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
                                      createEmbeddedDocuments?: (type: string, data: object[]) => Promise<unknown>;
                                  }
                                | undefined;
                        };
                    };
                }
            ).game;
            const actor = game?.actors?.get?.(actorId);
            if (!actor) return { ok: false, error: 'actor missing' };
            try {
                const existing: string[] = (actor.items?.filter?.((i) => i.type === 'armour') ?? [])
                    .map((i) => i.id ?? '')
                    .filter((id) => id !== '');
                if (existing.length > 0 && actor.deleteEmbeddedDocuments) {
                    await actor.deleteEmbeddedDocuments('Item', existing);
                }
                if (items.length > 0 && actor.createEmbeddedDocuments) {
                    await actor.createEmbeddedDocuments(
                        'Item',
                        items.map((it) => ({
                            name: it.name,
                            type: 'armour',
                            system: {
                                equipped: it.equipped,
                                armourPoints: it.armourPoints,
                            },
                        })),
                    );
                }
                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: String((err as Error)?.message ?? err) };
            }
        },
        { actorId, items },
    );
}

async function runFlows(page: Page, actorId: string): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(
            async ({ urls, actorId }) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- in-page probe: dist modules and Foundry globals are untyped at the evaluate boundary */
                const g = globalThis as any;
                const out: Array<{ name: string; passed: boolean; detail: string | null }> = [];
                function record(name: string, passed: boolean, detail: string | null = null): void {
                    out.push({ name, passed, detail });
                }

                // ── module loads (each guarded so one bad import doesn't sink the rest) ──
                let armourMod: any = null;
                let rangeMod: any = null;
                let formulaMod: any = null;
                let subtletyMod: any = null;
                try {
                    armourMod = await import(urls.armour);
                } catch (err) {
                    record('armour-calculator-aggregates-locations', false, `armour import failed: ${String((err as Error)?.message ?? err)}`);
                    record('armour-calculator-equipped-only', false, `armour import failed: ${String((err as Error)?.message ?? err)}`);
                }
                try {
                    rangeMod = await import(urls.range);
                } catch (err) {
                    record('range-calculator-band', false, `range import failed: ${String((err as Error)?.message ?? err)}`);
                    record('range-calculator-extreme', false, `range import failed: ${String((err as Error)?.message ?? err)}`);
                }
                try {
                    formulaMod = await import(urls.formula);
                } catch (err) {
                    record('formula-evaluator-evaluates-string', false, `formula import failed: ${String((err as Error)?.message ?? err)}`);
                    record('formula-evaluator-with-actor-data', false, `formula import failed: ${String((err as Error)?.message ?? err)}`);
                }
                try {
                    subtletyMod = await import(urls.subtlety);
                } catch (err) {
                    record('subtlety-clamp-edge-cases', false, `subtlety import failed: ${String((err as Error)?.message ?? err)}`);
                }

                const actor = g.game?.actors?.get?.(actorId);

                // ── 1. armour-calculator-aggregates-locations ───────────
                // Setup (done outside this evaluate by the test harness):
                // actor has two equipped armour items — head=4, body=6. We
                // verify computeArmour() returns per-location data with
                // value === maxAP and total = TB + traitBonus + max + good.
                if (armourMod?.computeArmour != null && actor != null) {
                    try {
                        const armour = armourMod.computeArmour(actor);
                        const head = armour?.head;
                        const body = armour?.body;
                        const leftArm = armour?.leftArm;
                        const okShape = head != null && body != null && leftArm != null;
                        // Per setup: head=4 from the helmet, body=6 from the carapace.
                        // Other locations should be 0 since no armour covers them.
                        const headOk = head?.value === 4;
                        const bodyOk = body?.value === 6;
                        const armOk = leftArm?.value === 0;
                        // total includes toughnessBonus (4 for T40) + locMax.
                        const tb = head?.toughnessBonus ?? 0;
                        const totalsOk = head?.total === tb + 4 && body?.total === tb + 6 && leftArm?.total === tb;
                        const ok = okShape && headOk && bodyOk && armOk && totalsOk;
                        record(
                            'armour-calculator-aggregates-locations',
                            ok,
                            ok ? null : `head=${JSON.stringify(head)} body=${JSON.stringify(body)} leftArm=${JSON.stringify(leftArm)}`,
                        );
                    } catch (err) {
                        record('armour-calculator-aggregates-locations', false, `computeArmour threw: ${String((err as Error)?.message ?? err)}`);
                    }
                } else if (armourMod != null) {
                    record(
                        'armour-calculator-aggregates-locations',
                        false,
                        `missing computeArmour or actor (keys=${Object.keys(armourMod ?? {}).join(',')}, actor=${actor != null})`,
                    );
                }

                // ── 2. armour-calculator-equipped-only ──────────────────
                // After the test harness toggles the body item to equipped:false,
                // re-run computeArmour and confirm body drops to 0 (head still 4).
                if (armourMod?.computeArmour != null && actor != null) {
                    try {
                        const armour = armourMod.computeArmour(actor);
                        const head = armour?.head;
                        const body = armour?.body;
                        const ok = head?.value === 4 && body?.value === 0;
                        record(
                            'armour-calculator-equipped-only',
                            ok,
                            ok ? null : `head.value=${head?.value} body.value=${body?.value} (expected 4 / 0)`,
                        );
                    } catch (err) {
                        record('armour-calculator-equipped-only', false, `computeArmour threw: ${String((err as Error)?.message ?? err)}`);
                    }
                }

                // ── 3. range-calculator-band ────────────────────────────
                // Distance 25m at weaponRange 30m → short range (≤ 30 * 0.5 = 15? actually
                // 25 > 15 so this is standard). Test with deterministic numbers per impl:
                // short = ≤ range * 0.5, standard = ≤ range * 2, long = ≤ range * 3.
                // For range=60: 25 ≤ 30 → short bracket.
                if (rangeMod?.calculateRangeBracket != null) {
                    try {
                        const shortInfo = rangeMod.calculateRangeBracket(25, 60);
                        const standardInfo = rangeMod.calculateRangeBracket(80, 60);
                        const longInfo = rangeMod.calculateRangeBracket(150, 60);
                        const pointBlankInfo = rangeMod.calculateRangeBracket(2, 60);
                        // calculateRangeModifier with melta on a short bracket should flag isMeltaRange.
                        const meltaResult = rangeMod.calculateRangeModifier?.({
                            distance: 25,
                            weaponRange: 60,
                            weaponQualities: new Set(['melta']),
                            isRangedWeapon: true,
                        });
                        const ok =
                            shortInfo?.bracket === 'short' &&
                            shortInfo?.modifier === 10 &&
                            standardInfo?.bracket === 'standard' &&
                            standardInfo?.modifier === 0 &&
                            longInfo?.bracket === 'long' &&
                            longInfo?.modifier === -10 &&
                            pointBlankInfo?.bracket === 'pointBlank' &&
                            pointBlankInfo?.modifier === 30 &&
                            meltaResult?.isMeltaRange === true;
                        record(
                            'range-calculator-band',
                            ok,
                            ok
                                ? null
                                : `short=${JSON.stringify(shortInfo)} std=${JSON.stringify(standardInfo)} long=${JSON.stringify(longInfo)} pb=${JSON.stringify(pointBlankInfo)} melta.isMelta=${meltaResult?.isMeltaRange}`,
                        );
                    } catch (err) {
                        record('range-calculator-band', false, `range band threw: ${String((err as Error)?.message ?? err)}`);
                    }
                }

                // ── 4. range-calculator-extreme ─────────────────────────
                // distance 200m at weaponRange 60m: > 60 * 3 = 180 → extreme (-30).
                // Also drives applyQualityModifiers (gyro-stabilised caps -30 → -10)
                // and isOutOfRange + isAtMeltaRange helpers.
                if (rangeMod?.calculateRangeBracket != null) {
                    try {
                        const extreme = rangeMod.calculateRangeBracket(200, 60);
                        const gyro = rangeMod.applyQualityModifiers?.(extreme, new Set(['gyro-stabilised']));
                        const oor = rangeMod.isOutOfRange?.(200, 60, 3);
                        const meltaOnExtreme = rangeMod.isAtMeltaRange?.('extreme');
                        const meltaOnShort = rangeMod.isAtMeltaRange?.('short');
                        // formatRangeDisplay round-trip on a melee-flag result.
                        const melee = rangeMod.calculateRangeModifier?.({
                            distance: 0,
                            weaponRange: 0,
                            weaponQualities: new Set(),
                            isRangedWeapon: false,
                        });
                        const display = rangeMod.formatRangeDisplay?.({ ...(gyro ?? extreme), isMeltaRange: false, description: 'd' });
                        const ok =
                            extreme?.bracket === 'extreme' &&
                            extreme?.modifier === -30 &&
                            gyro?.modifier === -10 &&
                            gyro?.modifiedBy === 'gyro-stabilised' &&
                            oor === true &&
                            meltaOnExtreme === false &&
                            meltaOnShort === true &&
                            melee?.bracket === 'melee' &&
                            display?.modifierText === '-10';
                        record(
                            'range-calculator-extreme',
                            ok,
                            ok
                                ? null
                                : `extreme=${JSON.stringify(extreme)} gyro=${JSON.stringify(gyro)} oor=${oor} meltaExt=${meltaOnExtreme} meltaShort=${meltaOnShort} melee=${JSON.stringify(melee)} display=${JSON.stringify(display)}`,
                        );
                    } catch (err) {
                        record('range-calculator-extreme', false, `range extreme threw: ${String((err as Error)?.message ?? err)}`);
                    }
                }

                // ── 5. formula-evaluator-evaluates-string ───────────────
                // Pure helpers don't need an actor.
                if (formulaMod != null) {
                    try {
                        const tbMult = formulaMod.parseTBMultiplier?.('2xTB+1d5+2');
                        const tbMultPlain = formulaMod.parseTBMultiplier?.('TB');
                        const tbMultNone = formulaMod.parseTBMultiplier?.('1d10');
                        const dice = formulaMod.parseDiceRoll?.('2xTB+1d5+2');
                        const diceNone = formulaMod.parseDiceRoll?.('TB');
                        const descWounds = formulaMod.describeWoundsFormula?.('2xTB+1d5');
                        const descFate = formulaMod.describeFateFormula?.('(1-5|=2),(6-10|=3)');
                        const descFatePlain = formulaMod.describeFateFormula?.('whatever');
                        const fateVal = formulaMod.evaluateFateFormula?.('(1-5|=2),(6-10|=3)');
                        const emptyWounds = formulaMod.evaluateWoundsFormula?.('', null as any);
                        const emptyFate = formulaMod.evaluateFateFormula?.('');
                        const invalidFate = formulaMod.evaluateFateFormula?.('not a formula');
                        const ok =
                            tbMult === 2 &&
                            tbMultPlain === 1 &&
                            tbMultNone === 0 &&
                            dice === '1d5+2' &&
                            diceNone === null &&
                            typeof descWounds === 'string' &&
                            descWounds.includes('×') &&
                            typeof descFate === 'string' &&
                            descFate.startsWith('1d10:') &&
                            descFatePlain === 'whatever' &&
                            typeof fateVal === 'number' &&
                            (fateVal === 2 || fateVal === 3) &&
                            emptyWounds === 0 &&
                            emptyFate === 0 &&
                            invalidFate === 0;
                        record(
                            'formula-evaluator-evaluates-string',
                            ok,
                            ok
                                ? null
                                : `tbMult=${tbMult} tbMultPlain=${tbMultPlain} tbMultNone=${tbMultNone} dice=${dice} diceNone=${diceNone} descW=${descWounds} descF=${descFate} descFP=${descFatePlain} fate=${fateVal} ew=${emptyWounds} ef=${emptyFate} invF=${invalidFate}`,
                        );
                    } catch (err) {
                        record('formula-evaluator-evaluates-string', false, `formula pure-helpers threw: ${String((err as Error)?.message ?? err)}`);
                    }
                }

                // ── 6. formula-evaluator-with-actor-data ────────────────
                // T40 → TB=4. "2xTB+5" → 8+5 = 13 (no dice term, deterministic).
                if (formulaMod?.evaluateWoundsFormula != null && actor != null) {
                    try {
                        const wounds = formulaMod.evaluateWoundsFormula('2xTB+5', actor);
                        // also drive WSB path: WS35 → bonus 3, "1xWSB" → 3
                        const ws = formulaMod.evaluateWoundsFormula('1xWSB', actor);
                        const ok = wounds === 13 && ws === 3;
                        record(
                            'formula-evaluator-with-actor-data',
                            ok,
                            ok ? null : `evaluateWoundsFormula('2xTB+5') = ${wounds} (expected 13), WSB=${ws} (expected 3)`,
                        );
                    } catch (err) {
                        record('formula-evaluator-with-actor-data', false, `evaluateWoundsFormula threw: ${String((err as Error)?.message ?? err)}`);
                    }
                } else if (formulaMod != null) {
                    record('formula-evaluator-with-actor-data', false, `missing evaluateWoundsFormula or actor (actor=${actor != null})`);
                }

                // ── 7. subtlety-clamp-edge-cases ────────────────────────
                // Drive every early-return + the active clamp path of
                // clampSubtletyLoss; assert isSubtletyPrimitive both arms.
                if (subtletyMod != null) {
                    try {
                        const { clampSubtletyLoss, isSubtletyPrimitive } = subtletyMod;
                        const zeroDelta = clampSubtletyLoss?.(0, 5); // delta>=0 → passthrough 0
                        const positiveDelta = clampSubtletyLoss?.(3, 5); // gain → passthrough 3
                        const negativeCap = clampSubtletyLoss?.(-7, 0); // cap<=0 → passthrough -7
                        const clamped = clampSubtletyLoss?.(-7, 2); // -7 clamped to -2
                        const exact = clampSubtletyLoss?.(-2, 2); // already within cap → -2
                        const truncDelta = clampSubtletyLoss?.(-7.9, 2); // trunc → -7, clamp → -2
                        const truncCap = clampSubtletyLoss?.(-10, 2.7); // cap truncs to 2 → -2
                        const negCap = clampSubtletyLoss?.(-5, -3); // negative cap → passthrough
                        const isManual = isSubtletyPrimitive?.('manual');
                        const isInquest = isSubtletyPrimitive?.('inquest');
                        const isUuid = isSubtletyPrimitive?.('Compendium.wh40k-rpg.foo.Item.bar');
                        const ok =
                            zeroDelta === 0 &&
                            positiveDelta === 3 &&
                            negativeCap === -7 &&
                            clamped === -2 &&
                            exact === -2 &&
                            truncDelta === -2 &&
                            truncCap === -2 &&
                            negCap === -5 &&
                            isManual === true &&
                            isInquest === true &&
                            isUuid === false;
                        record(
                            'subtlety-clamp-edge-cases',
                            ok,
                            ok
                                ? null
                                : `zero=${zeroDelta} pos=${positiveDelta} negCap=${negativeCap} clamped=${clamped} exact=${exact} truncD=${truncDelta} truncC=${truncCap} negCap2=${negCap} manual=${isManual} inquest=${isInquest} uuid=${isUuid}`,
                        );
                    } catch (err) {
                        record('subtlety-clamp-edge-cases', false, `clampSubtletyLoss threw: ${String((err as Error)?.message ?? err)}`);
                    }
                }

                return out;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            },
            {
                urls: { armour: ARMOUR_URL, range: RANGE_URL, formula: FORMULA_URL, subtlety: SUBTLETY_URL },
                actorId,
            },
        );
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('calculators + utilities (Tier B)', () => {
    test('every calculator/utility flow exercises its module via dynamic import', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const created = await createProbeActor(page);
        expect(created.id, `probe actor create failed: ${created.error ?? 'unknown'}`).not.toBeNull();
        const actorId = created.id as string;

        const failures: string[] = [];
        try {
            // Setup for armour flow 1: head=4, body=6, both equipped.
            const setup1 = await setArmourItems(page, actorId, [
                { name: 'calc-spec-helmet', equipped: true, armourPoints: { head: 4 } },
                { name: 'calc-spec-carapace', equipped: true, armourPoints: { body: 6 } },
            ]);
            if (!setup1.ok) failures.push(`armour-setup-1: ${setup1.error ?? 'failed'}`);

            const probe1 = await runFlows(page, actorId);

            // Setup for armour flow 2: body item unequipped → only head contributes.
            // Replace items rather than mutate equipped flag so the test is
            // independent of update-vs-create timing.
            const setup2 = await setArmourItems(page, actorId, [
                { name: 'calc-spec-helmet', equipped: true, armourPoints: { head: 4 } },
                { name: 'calc-spec-carapace-stowed', equipped: false, armourPoints: { body: 6 } },
            ]);
            if (!setup2.ok) failures.push(`armour-setup-2: ${setup2.error ?? 'failed'}`);

            // Re-run only flows that depend on the new state. The simplest
            // path is a full re-run; each flow keys on its own name in the
            // results so the second pass's `armour-calculator-equipped-only`
            // is the one we surface for that flow key. Earlier runs of the
            // same key are overwritten by `seen` consolidation below.
            const probe2 = await runFlows(page, actorId);

            // Merge: prefer later passes when the same key appears (so the
            // equipped-only flow reflects the setup2 state). Other flows are
            // identical across the two runs and the second result wins
            // harmlessly.
            const merged = new Map<string, FlowResult>();
            for (const r of probe1.results) merged.set(r.name, r);
            for (const r of probe2.results) {
                // For the equipped-only flow we explicitly want pass 2.
                // For everything else, take whichever passed.
                if (r.name === 'armour-calculator-equipped-only') {
                    merged.set(r.name, r);
                } else {
                    const prev = merged.get(r.name);
                    if (prev == null || (!prev.passed && r.passed)) merged.set(r.name, r);
                }
            }

            const seen = new Set<string>();
            for (const r of merged.values()) {
                seen.add(r.name);
                if (r.passed) {
                    recordCoverage('calculator.flow', r.name);
                } else {
                    failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
                }
            }
            for (const expected of FLOWS) {
                if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
            }
            const pageErrors = [...probe1.pageErrors, ...probe2.pageErrors];
            if (pageErrors.length > 0) {
                failures.push(`page errors: ${pageErrors.slice(0, 5).join(' | ')}`);
            }
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
        }

        expect(failures, `${failures.length}/${FLOWS.length} calculator flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
