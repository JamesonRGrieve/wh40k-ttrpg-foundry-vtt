import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the UTILS_EXTRA_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator).
 *
 * Tier B coverage of the remaining pure / side-effect-free modules under
 * `src/module/utils/` that no other Tier B spec reaches. The already-owned
 * modules (armour-calculator, range-calculator, formula-evaluator,
 * prerequisite-validator, roll-table-utils, uuid-name-cache) are intentionally
 * excluded — they are driven by calculators.spec.ts / utils-validators.spec.ts
 * / helpers + compendium-browser specs.
 *
 * Each flow dynamic-imports a single dist module from
 * `/systems/wh40k-rpg/module/utils/<name>.js` and drives one exported entry
 * point with synthetic, system-agnostic inputs. None require game state, so
 * coverage is attributed by the in-browser call against the bundled artifact
 * (mapped back to the TS source by scripts/e2e-source-coverage.mjs). All
 * failures collect into a single array and assert once so the report shows
 * every miss in one pass rather than first-fail masking.
 *
 * Modules exercised:
 *   - utils/game-system-pack-prefix.ts  — gameSystemPackPrefix
 *   - utils/encumbrance-calculator.ts   — getCarryCapacity, ENCUMBRANCE_TABLE
 *   - utils/origin-ui-labels.ts         — getCharacteristicDisplayInfo,
 *                                         getTrainingLabel
 *   - utils/text-pattern-extractor.ts   — splitList, toKey, parseRange,
 *                                         parseValueWithModifier, cleanEntry
 *   - utils/item-variant-utils.ts       — normalizeGameLineKey,
 *                                         isLineVariantContainer,
 *                                         resolveLineVariant
 *   - utils/xp-transaction.ts           — calculateTotalCost
 *   - utils/actor-system-converter.ts   — isConvertibleActorType
 *   - utils/stat-block-validator.ts     — StatBlockValidator.validate
 *   - utils/origin-chart-layout.ts      — OriginChartLayout.computeFullChart
 */

const UTILS_EXTRA_FLOWS = [
    'pack-prefix-dh-editions',
    'pack-prefix-passthrough',
    'encumbrance-carry-capacity',
    'encumbrance-table-exported',
    'origin-ui-characteristic-info',
    'origin-ui-training-label',
    'text-pattern-split-list',
    'text-pattern-to-key',
    'text-pattern-parse-range',
    'text-pattern-parse-value-with-modifier',
    'text-pattern-clean-entry',
    'item-variant-normalize-line-key',
    'item-variant-is-line-container',
    'item-variant-resolve-variant',
    'xp-calculate-total-cost',
    'actor-converter-is-convertible-type',
    'stat-block-validator-validate',
    'origin-chart-layout-compute-full-chart',
] as const;

type FlowName = (typeof UTILS_EXTRA_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeUtilsExtra(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
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

            const base = `${'/systems/wh40k-rpg'}/module/utils`;

            // ---------- game-system-pack-prefix ----------
            try {
                const mod = await import(`${base}/game-system-pack-prefix.js`);
                try {
                    const a = mod.gameSystemPackPrefix?.('dh1e');
                    const b = mod.gameSystemPackPrefix?.('dh2e');
                    record('pack-prefix-dh-editions', a === 'dh1' && b === 'dh2', `dh1e=${String(a)} dh2e=${String(b)}`);
                } catch (err) {
                    record('pack-prefix-dh-editions', false, String((err as Error)?.message ?? err));
                }
                try {
                    const passthrough = mod.gameSystemPackPrefix?.('rt');
                    const absent = mod.gameSystemPackPrefix?.(undefined);
                    record('pack-prefix-passthrough', passthrough === 'rt' && absent === '', `rt=${String(passthrough)} undefined=${JSON.stringify(absent)}`);
                } catch (err) {
                    record('pack-prefix-passthrough', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                for (const k of ['pack-prefix-dh-editions', 'pack-prefix-passthrough'] as const) {
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            // ---------- encumbrance-calculator ----------
            try {
                const mod = await import(`${base}/encumbrance-calculator.js`);
                try {
                    const zero = mod.getCarryCapacity?.(0);
                    const high = mod.getCarryCapacity?.(5);
                    const clamped = mod.getCarryCapacity?.(999);
                    record(
                        'encumbrance-carry-capacity',
                        zero === 0.9 && high === 27 && typeof clamped === 'number' && clamped > 0,
                        `cap(0)=${String(zero)} cap(5)=${String(high)} cap(999)=${String(clamped)}`,
                    );
                } catch (err) {
                    record('encumbrance-carry-capacity', false, String((err as Error)?.message ?? err));
                }
                try {
                    const table = mod.ENCUMBRANCE_TABLE;
                    record(
                        'encumbrance-table-exported',
                        Array.isArray(table) && table.length === 21 && table[0] === 0.9,
                        `len=${Array.isArray(table) ? table.length : typeof table}`,
                    );
                } catch (err) {
                    record('encumbrance-table-exported', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                for (const k of ['encumbrance-carry-capacity', 'encumbrance-table-exported'] as const) {
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            // ---------- origin-ui-labels ----------
            try {
                const mod = await import(`${base}/origin-ui-labels.js`);
                try {
                    const known = mod.getCharacteristicDisplayInfo?.('weaponSkill');
                    const fallback = mod.getCharacteristicDisplayInfo?.('madeUpKey');
                    record(
                        'origin-ui-characteristic-info',
                        known?.label === 'Weapon Skill' && known.short === 'WS' && fallback?.label === 'madeUpKey',
                        `known=${JSON.stringify(known)} fallback=${JSON.stringify(fallback)}`,
                    );
                } catch (err) {
                    record('origin-ui-characteristic-info', false, String((err as Error)?.message ?? err));
                }
                try {
                    const trained = mod.getTrainingLabel?.('trained');
                    const plus10 = mod.getTrainingLabel?.('plus10');
                    record(
                        'origin-ui-training-label',
                        trained === 'Trained' && plus10 === '+10',
                        `trained=${String(trained)} plus10=${String(plus10)}`,
                    );
                } catch (err) {
                    record('origin-ui-training-label', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                for (const k of ['origin-ui-characteristic-info', 'origin-ui-training-label'] as const) {
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            // ---------- text-pattern-extractor ----------
            try {
                const mod = await import(`${base}/text-pattern-extractor.js`);
                const TPE = mod.default ?? mod.TextPatternExtractor;
                if (typeof TPE?.splitList !== 'function') {
                    for (const k of [
                        'text-pattern-split-list',
                        'text-pattern-to-key',
                        'text-pattern-parse-range',
                        'text-pattern-parse-value-with-modifier',
                        'text-pattern-clean-entry',
                    ] as const) {
                        record(k, false, 'TextPatternExtractor missing');
                    }
                } else {
                    try {
                        const split = TPE.splitList('Sword (Best), Shield; Bolt Pistol (Reliable)');
                        record(
                            'text-pattern-split-list',
                            Array.isArray(split) && split.length === 3 && split[0] === 'Sword (Best)' && split[2] === 'Bolt Pistol (Reliable)',
                            `split=${JSON.stringify(split)}`,
                        );
                    } catch (err) {
                        record('text-pattern-split-list', false, String((err as Error)?.message ?? err));
                    }
                    try {
                        const key = TPE.toKey('Ballistic Skill');
                        const capped = TPE.toKey('Ballistic Skill', true);
                        record(
                            'text-pattern-to-key',
                            key === 'ballisticSkill' && capped === 'BallisticSkill',
                            `key=${String(key)} capped=${String(capped)}`,
                        );
                    } catch (err) {
                        record('text-pattern-to-key', false, String((err as Error)?.message ?? err));
                    }
                    try {
                        const ranged = TPE.parseRange('30m');
                        const melee = TPE.parseRange('Melee');
                        const none = TPE.parseRange('???');
                        record(
                            'text-pattern-parse-range',
                            ranged?.value === 30 && ranged.type === 'ranged' && melee?.type === 'melee' && none === null,
                            `ranged=${JSON.stringify(ranged)} melee=${JSON.stringify(melee)} none=${JSON.stringify(none)}`,
                        );
                    } catch (err) {
                        record('text-pattern-parse-range', false, String((err as Error)?.message ?? err));
                    }
                    try {
                        const withBonus = TPE.parseValueWithModifier('Awareness +10');
                        const noBonus = TPE.parseValueWithModifier('Dodge');
                        record(
                            'text-pattern-parse-value-with-modifier',
                            withBonus?.value === 'Awareness' &&
                                withBonus.bonus === 10 &&
                                withBonus.hasBonus === true &&
                                noBonus?.value === 'Dodge' &&
                                noBonus.hasBonus === false,
                            `withBonus=${JSON.stringify(withBonus)} noBonus=${JSON.stringify(noBonus)}`,
                        );
                    } catch (err) {
                        record('text-pattern-parse-value-with-modifier', false, String((err as Error)?.message ?? err));
                    }
                    try {
                        const cleaned = TPE.cleanEntry('Power  Sword...');
                        record('text-pattern-clean-entry', cleaned === 'Power Sword', `cleaned=${JSON.stringify(cleaned)}`);
                    } catch (err) {
                        record('text-pattern-clean-entry', false, String((err as Error)?.message ?? err));
                    }
                }
            } catch (err) {
                for (const k of [
                    'text-pattern-split-list',
                    'text-pattern-to-key',
                    'text-pattern-parse-range',
                    'text-pattern-parse-value-with-modifier',
                    'text-pattern-clean-entry',
                ] as const) {
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            // ---------- item-variant-utils ----------
            try {
                const mod = await import(`${base}/item-variant-utils.js`);
                try {
                    const dh = mod.normalizeGameLineKey?.('dh2e');
                    const rt = mod.normalizeGameLineKey?.('rt');
                    const bad = mod.normalizeGameLineKey?.('not-a-system');
                    record(
                        'item-variant-normalize-line-key',
                        dh === 'dh2' && rt === 'rt' && bad === null,
                        `dh2e=${String(dh)} rt=${String(rt)} bad=${JSON.stringify(bad)}`,
                    );
                } catch (err) {
                    record('item-variant-normalize-line-key', false, String((err as Error)?.message ?? err));
                }
                try {
                    const isContainer = mod.isLineVariantContainer?.({ dh2: { v: 1 }, rt: { v: 2 } });
                    const notContainer = mod.isLineVariantContainer?.({ value: 1, extra: 2 });
                    record(
                        'item-variant-is-line-container',
                        isContainer === true && notContainer === false,
                        `container=${String(isContainer)} notContainer=${String(notContainer)}`,
                    );
                } catch (err) {
                    record('item-variant-is-line-container', false, String((err as Error)?.message ?? err));
                }
                try {
                    const resolved = mod.resolveLineVariant?.({ dh2: 'dh-value', rt: 'rt-value' }, 'rt');
                    const passthrough = mod.resolveLineVariant?.('plain-string', 'dh2');
                    record(
                        'item-variant-resolve-variant',
                        resolved === 'rt-value' && passthrough === 'plain-string',
                        `resolved=${JSON.stringify(resolved)} passthrough=${JSON.stringify(passthrough)}`,
                    );
                } catch (err) {
                    record('item-variant-resolve-variant', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                for (const k of ['item-variant-normalize-line-key', 'item-variant-is-line-container', 'item-variant-resolve-variant'] as const) {
                    record(k, false, `import: ${String((err as Error)?.message ?? err)}`);
                }
            }

            // ---------- xp-transaction ----------
            try {
                const mod = await import(`${base}/xp-transaction.js`);
                try {
                    const empty = mod.calculateTotalCost?.([]);
                    const summed = mod.calculateTotalCost?.([{ cost: 100 }, { cost: 250 }, { cost: 50 }]);
                    record('xp-calculate-total-cost', empty === 0 && summed === 400, `empty=${String(empty)} summed=${String(summed)}`);
                } catch (err) {
                    record('xp-calculate-total-cost', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                record('xp-calculate-total-cost', false, `import: ${String((err as Error)?.message ?? err)}`);
            }

            // ---------- actor-system-converter ----------
            try {
                const mod = await import(`${base}/actor-system-converter.js`);
                try {
                    const charType = mod.isConvertibleActorType?.('dh2-character');
                    const npcType = mod.isConvertibleActorType?.('rt-npc');
                    const bogus = mod.isConvertibleActorType?.('not-a-type');
                    record(
                        'actor-converter-is-convertible-type',
                        charType === true && npcType === true && bogus === false,
                        `char=${String(charType)} npc=${String(npcType)} bogus=${String(bogus)}`,
                    );
                } catch (err) {
                    record('actor-converter-is-convertible-type', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                record('actor-converter-is-convertible-type', false, `import: ${String((err as Error)?.message ?? err)}`);
            }

            // ---------- stat-block-validator ----------
            try {
                const mod = await import(`${base}/stat-block-validator.js`);
                const SBV = mod.default ?? mod.StatBlockValidator;
                try {
                    const nullResult = SBV?.validate?.(null);
                    const okResult = SBV?.validate?.({
                        name: 'Test NPC',
                        type: 'dh2-npc',
                        system: {
                            characteristics: { weaponSkill: { base: 35 } },
                            wounds: { max: 12 },
                        },
                    });
                    record(
                        'stat-block-validator-validate',
                        nullResult?.valid === false &&
                            Array.isArray(nullResult.errors) &&
                            nullResult.errors.length > 0 &&
                            typeof okResult?.valid === 'boolean' &&
                            Array.isArray(okResult.warnings),
                        `null=${JSON.stringify(nullResult)} ok.valid=${String(okResult?.valid)}`,
                    );
                } catch (err) {
                    record('stat-block-validator-validate', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                record('stat-block-validator-validate', false, `import: ${String((err as Error)?.message ?? err)}`);
            }

            // ---------- origin-chart-layout ----------
            try {
                const mod = await import(`${base}/origin-chart-layout.js`);
                const OCL = mod.OriginChartLayout;
                try {
                    const origins = [
                        {
                            id: 'origin-a',
                            name: 'Test Home World',
                            system: { step: 'homeWorld', primaryPosition: 0, pathPositions: [0] },
                        },
                        {
                            id: 'origin-b',
                            name: 'Test Home World 2',
                            system: { step: 'homeWorld', primaryPosition: 1, pathPositions: [1] },
                        },
                    ];
                    const chart = OCL?.computeFullChart?.(origins, new Map(), true, mod.DIRECTION?.FORWARD ?? 'forward', ['homeWorld']);
                    record(
                        'origin-chart-layout-compute-full-chart',
                        chart != null &&
                            Array.isArray(chart.steps) &&
                            chart.steps.length === 1 &&
                            chart.steps[0]?.stepKey === 'homeWorld' &&
                            Array.isArray(chart.steps[0]?.cards) &&
                            chart.steps[0].cards.length === 2,
                        `steps=${Array.isArray(chart?.steps) ? chart.steps.length : typeof chart} maxColumns=${String(chart?.maxColumns)}`,
                    );
                } catch (err) {
                    record('origin-chart-layout-compute-full-chart', false, String((err as Error)?.message ?? err));
                }
            } catch (err) {
                record('origin-chart-layout-compute-full-chart', false, `import: ${String((err as Error)?.message ?? err)}`);
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('utils extra (Tier B)', () => {
    test('remaining pure utils/* surface lights up under coverage', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeUtilsExtra(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('utils-extra.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of UTILS_EXTRA_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${UTILS_EXTRA_FLOWS.length} utils-extra flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
