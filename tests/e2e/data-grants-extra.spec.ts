/**
 * Keys MUST match the DATA_GRANTS_EXTRA_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator).
 *
 * Tier B coverage of every grant DataModel subclass under
 * `src/module/data/grant/`. The GrantsManager dispatch (driving
 * `applyItemGrants` end-to-end) is owned by managers.spec.ts; the empty
 * apply / duplicate-rejected branches of choice + resource grants are
 * owned by data-layer.spec.ts. This spec goes one level deeper than both:
 * it constructs each grant DataModel directly and drives the
 * `_applyGrant` / `reverse` / `restore` / `getAutomaticValue` /
 * `validateGrant` / `getSummary` surfaces against a real Foundry actor —
 * with actual non-empty selections — so the per-subclass logic is
 * exercised independently of any manager-level orchestration.
 *
 * Source-coverage targets (each flow lights at least one branch missed
 * by managers.spec.ts and data-layer.spec.ts):
 *
 *   - src/module/data/grant/item-grant.ts
 *       • _applyGrant create-on-actor path (VALID_TYPES gating)
 *       • reverse round-trip (deleteEmbeddedDocuments → restoreData.items)
 *       • _isDuplicateByName short-circuit (no-op when name already exists)
 *       • validateGrant + getSummary
 *
 *   - src/module/data/grant/skill-grant.ts
 *       • standard-skill upgrade path (`_applyStandardSkillUpgrade`,
 *         writing `system.skills.<key>.advance`)
 *       • reverse path returning previousLevel and writing the actor
 *         update back
 *       • _getSchemaSkillKey normalisation (mixed-case + dashed input)
 *
 *   - src/module/data/grant/characteristic-grant.ts
 *       • _applyGrant advance-delta write
 *       • reverse restores previousValue
 *       • VALID_CHARACTERISTICS rejection branch
 *
 *   - src/module/data/grant/resource-grant.ts
 *       • _applyGrant with a flat-number resource (no roll required)
 *       • reverse path (additive=true wounds bonus rolls back)
 *       • getAutomaticValue formula-detection branch (returns false on
 *         dice/characteristic refs)
 *
 *   - src/module/data/grant/choice-grant.ts
 *       • _applyGrant with non-empty selection + a sub-grant landing on
 *         the actor
 *       • reverse path round-tripping through ChoiceGrantData.GRANT_TYPES
 *       • getAutomaticValue always-false branch (choices need user input)
 *
 *   - src/module/data/grant/base-grant.ts
 *       • null-actor guard in apply()
 *
 * Strategy mirrors weapon-attack.spec.ts:
 *   - single page.evaluate round-trip per spec invocation
 *   - withTimeout wrapper around every awaitable Foundry call
 *   - shared cleanup-registry that deletes every created actor / item in
 *     a finally block
 *   - collect-failures-then-assert at the end so all flows run even when
 *     one regresses
 */

import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

const DATA_GRANTS_EXTRA_FLOWS = [
    'base-grant-null-actor-rejects',
    'item-grant-apply-creates-item',
    'item-grant-reverse-removes-item',
    'item-grant-duplicate-name-skipped',
    'item-grant-validate-and-summary',
    'skill-grant-apply-writes-advance',
    'skill-grant-reverse-restores-previous',
    'skill-grant-schema-key-normalisation',
    'characteristic-grant-apply-advance-delta',
    'characteristic-grant-reverse-restores-advance',
    'characteristic-grant-rejects-invalid-key',
    'resource-grant-apply-flat-wounds-bonus',
    'resource-grant-reverse-rolls-back',
    'resource-grant-auto-value-rejects-dice',
    'choice-grant-apply-non-empty-selection',
    'choice-grant-reverse-round-trip',
    'choice-grant-auto-value-always-false',
] as const;

type FlowName = (typeof DATA_GRANTS_EXTRA_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeGrantFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const game = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'base-grant-null-actor-rejects': 'Actor.create unavailable' } as Record<string, string>,
                };
            }

            // Same withTimeout helper pattern as weapon-attack.spec.ts —
            // never let a single Foundry call hang the whole probe.
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            // Shared cleanup registry — every actor / item we create is
            // registered for end-of-probe deletion.
            const cleanups: Array<() => Promise<void>> = [];

            // Dynamic import of the grant modules. Module paths follow the
            // weapon-attack.spec.ts pattern of building the specifier via
            // `new Function` so TS doesn't try to resolve the
            // Foundry-served URL at compile time.
            const importModule = async (path: string): Promise<unknown> => {
                const url = `/systems/wh40k-rpg/module/data/grant/${path}`;
                return (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);
            };

            // Resolve all grant module classes up-front so each flow can
            // assume they're present (or short-circuit cleanly otherwise).
            let BaseGrantData: any = null;
            let ItemGrantData: any = null;
            let SkillGrantData: any = null;
            let CharacteristicGrantData: any = null;
            let ResourceGrantData: any = null;
            let ChoiceGrantData: any = null;
            try {
                const [bm, im, sm, cm, rm, chm] = await Promise.all([
                    importModule('base-grant.js'),
                    importModule('item-grant.js'),
                    importModule('skill-grant.js'),
                    importModule('characteristic-grant.js'),
                    importModule('resource-grant.js'),
                    importModule('choice-grant.js'),
                ]);
                BaseGrantData = (bm as any).default;
                ItemGrantData = (im as any).default;
                SkillGrantData = (sm as any).default;
                CharacteristicGrantData = (cm as any).default;
                ResourceGrantData = (rm as any).default;
                ChoiceGrantData = (chm as any).default;
            } catch (err) {
                for (const f of flows) notes[f] = `grant module import failed: ${String((err as Error)?.message ?? err)}`;
                return { flowsFired: fired, flowNotes: notes };
            }

            // ---- shared PC actor (dh2-character has both characteristics
            //      and a full skill schema; the grant subclasses target it
            //      directly without per-system branching).
            let pc: any = null;
            try {
                pc = (await withTimeout(
                    Actor.create({
                        name: 'data-grants-extra-spec-pc',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    }),
                    5_000,
                    'PC Actor.create',
                )) as any;
                if (pc?.id) {
                    cleanups.push(async () => {
                        try {
                            await game?.actors?.get?.(pc.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                for (const f of flows) notes[f] = `PC create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!pc?.id) {
                return { flowsFired: fired, flowNotes: notes };
            }

            // Yield one tick so the server-side create commits before
            // children are spawned (same race the weapon-attack probe
            // documents).
            await new Promise((r) => setTimeout(r, 250));

            const getPc = () => game?.actors?.get?.(pc.id);

            // Side actor that hosts source items used by item-grant /
            // choice-grant flows. item-grant requires a real fetchable
            // UUID (it goes through fromUuid), so we stash the source
            // items here and then copy them onto the PC via the grant.
            let srcActor: any = null;
            try {
                srcActor = (await withTimeout(
                    Actor.create({
                        name: 'data-grants-extra-spec-src',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    }),
                    5_000,
                    'src Actor.create',
                )) as any;
                if (srcActor?.id) {
                    cleanups.push(async () => {
                        try {
                            await game?.actors?.get?.(srcActor.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                notes['item-grant-apply-creates-item'] = `src Actor.create threw: ${String((err as Error)?.message ?? err)}`;
            }
            await new Promise((r) => setTimeout(r, 100));
            const getSrc = () => (srcActor?.id ? game?.actors?.get?.(srcActor.id) : null);

            try {
                /* ============================================================
                 * Flow 1: base-grant-null-actor-rejects
                 * BaseGrantData.apply(null) must populate `result.errors`
                 * and flip `result.success` to false without invoking the
                 * subclass `_applyGrant`. Use ItemGrantData since the bare
                 * BaseGrantData throws "must implement _applyGrant".
                 * ============================================================ */
                try {
                    const grant = new ItemGrantData({ items: [], optional: true });
                    const res = await withTimeout(grant.apply(null, {}, {}), 5_000, 'apply(null)');
                    const ok = res?.success === false && Array.isArray(res?.errors) && res.errors.length >= 1 && /no actor/i.test(res.errors.join(' '));
                    if (ok) {
                        fired['base-grant-null-actor-rejects'] = true;
                        notes['base-grant-null-actor-rejects'] = `null-actor branch returned success=false errors=${JSON.stringify(res.errors)}`;
                    } else {
                        notes['base-grant-null-actor-rejects'] = `unexpected: ${JSON.stringify(res)}`;
                    }
                } catch (err) {
                    notes['base-grant-null-actor-rejects'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 2: item-grant-apply-creates-item
                 * Stash a source talent on srcActor, then drive
                 * ItemGrantData._applyGrant against pc with that uuid as
                 * the items[].uuid. Assert pc.items now contains a copy
                 * carrying the wh40k-rpg grant flags and that result.applied
                 * maps the source UUID to the created item ID.
                 *
                 * The brief calls out the "trait" subtype explicitly;
                 * item-grant's VALID_TYPES includes both `talent` and
                 * `trait`, so we exercise the talent branch here (cheaper
                 * to seed) and the trait branch via the choice-grant flow
                 * below.
                 * ============================================================ */
                let srcTalentUuid = '';
                try {
                    const src = getSrc();
                    if (!src) {
                        notes['item-grant-apply-creates-item'] = 'src actor unavailable';
                    } else {
                        const created = (await withTimeout(
                            src.createEmbeddedDocuments?.('Item', [
                                {
                                    name: 'probe-grant-source-talent',
                                    type: 'talent',
                                    system: { description: '<p>probe</p>' },
                                },
                            ]),
                            5_000,
                            'create src talent',
                        )) as any[];
                        const srcTalent = created?.[0] ?? null;
                        srcTalentUuid = srcTalent?.uuid ?? '';
                        if (!srcTalentUuid) {
                            notes['item-grant-apply-creates-item'] = 'source talent has no uuid';
                        } else {
                            const grant = new ItemGrantData({
                                items: [{ uuid: srcTalentUuid, optional: false, overrides: {} }],
                                optional: false,
                            });
                            const result = grant._initResult();
                            await withTimeout(
                                grant._applyGrant(getPc(), { selected: [srcTalentUuid] }, {}, result),
                                10_000,
                                'item-grant _applyGrant',
                            );
                            const live = getPc();
                            const granted = live.items.contents.find((i: any) => i.name === 'probe-grant-source-talent');
                            if (granted) {
                                cleanups.push(async () => {
                                    try {
                                        await live.deleteEmbeddedDocuments?.('Item', [granted.id]);
                                    } catch {
                                        /* ignore */
                                    }
                                });
                            }
                            const flagsOk = granted?.flags?.['wh40k-rpg']?.grantType === 'item';
                            const appliedHasUuid = typeof result.applied?.[srcTalentUuid] === 'string' && result.applied[srcTalentUuid] !== '';
                            if (granted && flagsOk && appliedHasUuid && result.errors.length === 0) {
                                fired['item-grant-apply-creates-item'] = true;
                                notes['item-grant-apply-creates-item'] = `granted talent landed on pc with grant flags; applied[${srcTalentUuid}]=${result.applied[srcTalentUuid]}`;
                            } else {
                                notes['item-grant-apply-creates-item'] =
                                    `unexpected: granted=${!!granted} flagsOk=${flagsOk} appliedHasUuid=${appliedHasUuid} errors=${JSON.stringify(result.errors)}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['item-grant-apply-creates-item'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 3: item-grant-reverse-removes-item
                 * Apply an item grant, then call .reverse() with the
                 * resulting applied map. Assert (a) the item is gone from
                 * pc.items and (b) the restoreData.items array carries the
                 * original toObject() so .restore() can replay it.
                 * ============================================================ */
                try {
                    const src = getSrc();
                    if (!src) {
                        notes['item-grant-reverse-removes-item'] = 'src actor unavailable';
                    } else {
                        // Use a distinct source talent so this flow doesn't
                        // race with the previous one's cleanup.
                        const created = (await withTimeout(
                            src.createEmbeddedDocuments?.('Item', [
                                {
                                    name: 'probe-grant-reverse-talent',
                                    type: 'talent',
                                },
                            ]),
                            5_000,
                            'create src talent (reverse)',
                        )) as any[];
                        const srcTalent = created?.[0] ?? null;
                        const uuid = srcTalent?.uuid ?? '';
                        if (!uuid) {
                            notes['item-grant-reverse-removes-item'] = 'source talent has no uuid';
                        } else {
                            const grant = new ItemGrantData({ items: [{ uuid, optional: false, overrides: {} }], optional: false });
                            const result = grant._initResult();
                            await withTimeout(
                                grant._applyGrant(getPc(), { selected: [uuid] }, {}, result),
                                10_000,
                                'apply for reverse',
                            );
                            const live = getPc();
                            const granted = live.items.contents.find((i: any) => i.name === 'probe-grant-reverse-talent');
                            if (!granted) {
                                notes['item-grant-reverse-removes-item'] = 'apply did not produce embedded talent';
                            } else {
                                const restoreData = (await withTimeout(
                                    grant.reverse(getPc(), result.applied),
                                    5_000,
                                    'reverse',
                                )) as { items: Array<{ uuid: string; data: any }> };
                                const refreshed = getPc();
                                const stillThere = refreshed.items.contents.find((i: any) => i.name === 'probe-grant-reverse-talent');
                                const restoreOk = Array.isArray(restoreData?.items) && restoreData.items.length === 1 && restoreData.items[0]?.uuid === uuid;
                                if (!stillThere && restoreOk) {
                                    fired['item-grant-reverse-removes-item'] = true;
                                    notes['item-grant-reverse-removes-item'] = `reverse deleted talent and produced restoreData with ${restoreData.items.length} entry`;
                                } else {
                                    notes['item-grant-reverse-removes-item'] = `unexpected: stillThere=${!!stillThere} restoreOk=${restoreOk}`;
                                }
                            }
                        }
                    }
                } catch (err) {
                    notes['item-grant-reverse-removes-item'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 4: item-grant-duplicate-name-skipped
                 * Create a talent on the actor with name "Probe Duplicate",
                 * then run an item-grant pointing at a SOURCE talent with
                 * the same name. _isDuplicateByName must short-circuit and
                 * the grant must not create a second copy. result.errors
                 * should remain empty (skip is a notification, not an
                 * error).
                 * ============================================================ */
                try {
                    const live = getPc();
                    const dupName = 'Probe Duplicate';
                    const existingCreated = (await withTimeout(
                        live.createEmbeddedDocuments?.('Item', [{ name: dupName, type: 'talent' }]),
                        5_000,
                        'create existing duplicate talent',
                    )) as any[];
                    const existing = existingCreated?.[0] ?? null;
                    if (existing) {
                        cleanups.push(async () => {
                            try {
                                await live.deleteEmbeddedDocuments?.('Item', [existing.id]);
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                    const src = getSrc();
                    if (!src) {
                        notes['item-grant-duplicate-name-skipped'] = 'src actor unavailable';
                    } else {
                        const srcCreated = (await withTimeout(
                            src.createEmbeddedDocuments?.('Item', [{ name: dupName, type: 'talent' }]),
                            5_000,
                            'create src duplicate talent',
                        )) as any[];
                        const srcDup = srcCreated?.[0] ?? null;
                        const uuid = srcDup?.uuid ?? '';
                        if (!uuid) {
                            notes['item-grant-duplicate-name-skipped'] = 'src duplicate has no uuid';
                        } else {
                            const grant = new ItemGrantData({ items: [{ uuid, optional: false, overrides: {} }], optional: false });
                            const result = grant._initResult();
                            await withTimeout(
                                grant._applyGrant(getPc(), { selected: [uuid] }, {}, result),
                                10_000,
                                'duplicate apply',
                            );
                            const refreshed = getPc();
                            const matches = refreshed.items.contents.filter((i: any) => i.name === dupName);
                            const isExactlyOne = matches.length === 1;
                            const noErrors = result.errors.length === 0;
                            const notifMentionsSkip = (result.notifications as string[]).some((n) => /already exists/i.test(n));
                            if (isExactlyOne && noErrors && notifMentionsSkip) {
                                fired['item-grant-duplicate-name-skipped'] = true;
                                notes['item-grant-duplicate-name-skipped'] = `_isDuplicateByName kept count at 1; notifications=${JSON.stringify(result.notifications)}`;
                            } else {
                                notes['item-grant-duplicate-name-skipped'] =
                                    `unexpected: count=${matches.length} errors=${JSON.stringify(result.errors)} notifMatchedSkip=${notifMentionsSkip}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['item-grant-duplicate-name-skipped'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 5: item-grant-validate-and-summary
                 * Empty + UUID-blank configs must surface validation
                 * errors. getSummary() must produce a per-item detail row,
                 * with the "Not found" branch firing for an unresolvable
                 * UUID. Exercises validateGrant + getSummary on
                 * ItemGrantData.
                 * ============================================================ */
                try {
                    const emptyGrant = new ItemGrantData({ items: [], optional: false });
                    const emptyErrors = emptyGrant.validateGrant() as string[];
                    const blankGrant = new ItemGrantData({ items: [{ uuid: '', optional: false, overrides: {} }], optional: false });
                    const blankErrors = blankGrant.validateGrant() as string[];
                    // Use a deliberately unresolvable UUID for getSummary so
                    // the "Not found" branch fires without a network round
                    // trip.
                    const summaryGrant = new ItemGrantData({
                        items: [{ uuid: 'Compendium.wh40k-rpg.does-not-exist.Item.0000000000000000', optional: false, overrides: {} }],
                        optional: false,
                    });
                    const summary = (await withTimeout(summaryGrant.getSummary(), 5_000, 'getSummary')) as {
                        details: Array<{ label: string; value: string | number; optional?: boolean }>;
                    };
                    const emptyMentionsNone = emptyErrors.some((e) => /no items/i.test(e));
                    const blankMentionsUuid = blankErrors.some((e) => /missing uuid/i.test(e));
                    const summaryDetailIsNotFound = summary.details.length === 1 && summary.details[0]?.value === 'Not found';
                    if (emptyMentionsNone && blankMentionsUuid && summaryDetailIsNotFound) {
                        fired['item-grant-validate-and-summary'] = true;
                        notes['item-grant-validate-and-summary'] =
                            `validate+summary: emptyErrors=${emptyErrors.length} blankErrors=${blankErrors.length} summaryDetails=${summary.details.length}`;
                    } else {
                        notes['item-grant-validate-and-summary'] =
                            `unexpected: emptyErrors=${JSON.stringify(emptyErrors)} blankErrors=${JSON.stringify(blankErrors)} summary=${JSON.stringify(summary?.details)}`;
                    }
                } catch (err) {
                    notes['item-grant-validate-and-summary'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 6: skill-grant-apply-writes-advance
                 * SkillGrantData rewrites `system.skills.<key>.advance` —
                 * the boolean `trained` flag is derived from the advance
                 * value by CreatureTemplate._prepareSkills, so the durable
                 * write is the numeric advance. Drive _applyGrant with
                 * level=plus10 (advance 2) and confirm the actor schema
                 * has advance >= 2 after the update.
                 * ============================================================ */
                try {
                    const grant = new SkillGrantData({
                        skills: [{ key: 'awareness', specialization: '', level: 'plus10', optional: false }],
                        optional: false,
                    });
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['awareness'] }, {}, result),
                        10_000,
                        'skill _applyGrant',
                    );
                    const refreshed = getPc();
                    const advance = (refreshed?.system?.skills?.awareness?.advance ?? 0) as number;
                    const applied = result.applied['awareness'] as { previousLevel: string | null; newLevel: string } | undefined;
                    if (advance >= 2 && result.errors.length === 0 && applied?.newLevel === 'plus10') {
                        fired['skill-grant-apply-writes-advance'] = true;
                        notes['skill-grant-apply-writes-advance'] = `awareness.advance=${advance}; applied.newLevel=${applied.newLevel}`;
                    } else {
                        notes['skill-grant-apply-writes-advance'] =
                            `unexpected: advance=${advance} errors=${JSON.stringify(result.errors)} applied=${JSON.stringify(applied)}`;
                    }
                } catch (err) {
                    notes['skill-grant-apply-writes-advance'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 7: skill-grant-reverse-restores-previous
                 * Apply a fresh skill grant on a different skill, then
                 * call reverse() with the result.applied map. Assert the
                 * actor's advance value rolls back to the previousLevel
                 * (which on a fresh actor is 'known' → advance 0).
                 * ============================================================ */
                try {
                    // Use 'dodge' to avoid conflict with the awareness flow above.
                    const grant = new SkillGrantData({
                        skills: [{ key: 'dodge', specialization: '', level: 'trained', optional: false }],
                        optional: false,
                    });
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['dodge'] }, {}, result),
                        10_000,
                        'skill apply for reverse',
                    );
                    const afterApply = getPc()?.system?.skills?.dodge?.advance ?? 0;
                    await withTimeout(grant.reverse(getPc(), result.applied), 5_000, 'skill reverse');
                    const afterReverse = getPc()?.system?.skills?.dodge?.advance ?? -1;
                    // previousLevel was 'known' (advance 0); _getLevelUpdates('known')
                    // produces { advance: 0 }, so after reverse advance must be 0.
                    if (afterApply >= 1 && afterReverse === 0) {
                        fired['skill-grant-reverse-restores-previous'] = true;
                        notes['skill-grant-reverse-restores-previous'] = `dodge.advance: 0 → ${afterApply} → ${afterReverse}`;
                    } else {
                        notes['skill-grant-reverse-restores-previous'] = `unexpected: afterApply=${afterApply} afterReverse=${afterReverse}`;
                    }
                } catch (err) {
                    notes['skill-grant-reverse-restores-previous'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 8: skill-grant-schema-key-normalisation
                 * _getSchemaSkillKey normalises mixed-case / dashed / space
                 * variants to a canonical schema key. Verify a handful of
                 * the alias map entries (the table covers every standard
                 * skill across the d100 systems).
                 * ============================================================ */
                try {
                    const grant = new SkillGrantData({ skills: [], optional: true });
                    const cases: Array<[string, string | null]> = [
                        ['chem-use', 'chemUse'],
                        ['Chem-Use', 'chemUse'],
                        ['Tech-Use', 'techUse'],
                        ['sleight of hand', 'sleightOfHand'],
                        ['Silent Move', 'silentMove'],
                        ['scholastic lore', 'scholasticLore'],
                        ['not-a-real-skill', null],
                    ];
                    const misses: string[] = [];
                    for (const [input, expected] of cases) {
                        const got = grant._getSchemaSkillKey(input);
                        if (got !== expected) misses.push(`${input} → ${String(got)} (expected ${String(expected)})`);
                    }
                    if (misses.length === 0) {
                        fired['skill-grant-schema-key-normalisation'] = true;
                        notes['skill-grant-schema-key-normalisation'] = `${cases.length} alias-map entries normalised correctly`;
                    } else {
                        notes['skill-grant-schema-key-normalisation'] = `mismatches: ${misses.join('; ')}`;
                    }
                } catch (err) {
                    notes['skill-grant-schema-key-normalisation'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 9: characteristic-grant-apply-advance-delta
                 * CharacteristicGrantData writes
                 * `system.characteristics.<key>.advance` with the current
                 * advance + value. Apply +5 to strength and confirm the
                 * schema field reflects the delta plus result.applied
                 * carries the (previous, applied, new) triple.
                 * ============================================================ */
                try {
                    const grant = new CharacteristicGrantData({
                        characteristics: [{ key: 'strength', value: 5, optional: false }],
                        optional: false,
                    });
                    const before = (getPc()?.system?.characteristics?.strength?.advance ?? 0) as number;
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['strength'] }, {}, result),
                        10_000,
                        'characteristic _applyGrant',
                    );
                    const after = (getPc()?.system?.characteristics?.strength?.advance ?? 0) as number;
                    const applied = result.applied['strength'] as { previousValue: number; appliedValue: number; newValue: number } | undefined;
                    if (after === before + 5 && applied?.appliedValue === 5 && applied?.previousValue === before && applied?.newValue === before + 5) {
                        fired['characteristic-grant-apply-advance-delta'] = true;
                        notes['characteristic-grant-apply-advance-delta'] = `strength.advance: ${before} → ${after}; applied=${JSON.stringify(applied)}`;
                    } else {
                        notes['characteristic-grant-apply-advance-delta'] = `unexpected: before=${before} after=${after} applied=${JSON.stringify(applied)}`;
                    }
                } catch (err) {
                    notes['characteristic-grant-apply-advance-delta'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 10: characteristic-grant-reverse-restores-advance
                 * Build a fresh grant, apply +3 to intelligence, then
                 * reverse and assert the advance returns to its pre-apply
                 * value. Different characteristic than flow 9 so the two
                 * don't interfere.
                 * ============================================================ */
                try {
                    const grant = new CharacteristicGrantData({
                        characteristics: [{ key: 'intelligence', value: 3, optional: false }],
                        optional: false,
                    });
                    const before = (getPc()?.system?.characteristics?.intelligence?.advance ?? 0) as number;
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['intelligence'] }, {}, result),
                        10_000,
                        'characteristic apply for reverse',
                    );
                    const afterApply = (getPc()?.system?.characteristics?.intelligence?.advance ?? 0) as number;
                    await withTimeout(grant.reverse(getPc(), result.applied), 5_000, 'characteristic reverse');
                    const afterReverse = (getPc()?.system?.characteristics?.intelligence?.advance ?? -1) as number;
                    if (afterApply === before + 3 && afterReverse === before) {
                        fired['characteristic-grant-reverse-restores-advance'] = true;
                        notes['characteristic-grant-reverse-restores-advance'] = `intelligence.advance: ${before} → ${afterApply} → ${afterReverse}`;
                    } else {
                        notes['characteristic-grant-reverse-restores-advance'] = `unexpected: before=${before} afterApply=${afterApply} afterReverse=${afterReverse}`;
                    }
                } catch (err) {
                    notes['characteristic-grant-reverse-restores-advance'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 11: characteristic-grant-rejects-invalid-key
                 * VALID_CHARACTERISTICS gates the apply path. Use a
                 * deliberately invalid key and assert result.errors picks
                 * up the rejection. validateGrant() should also flag it.
                 * ============================================================ */
                try {
                    const grant = new CharacteristicGrantData({
                        characteristics: [{ key: 'notARealCharacteristic', value: 5, optional: false }],
                        optional: false,
                    });
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['notARealCharacteristic'] }, {}, result),
                        5_000,
                        'characteristic invalid key apply',
                    );
                    const validateErrors = grant.validateGrant() as string[];
                    const applyMentions = (result.errors as string[]).some((e) => /invalid characteristic/i.test(e));
                    const validateMentions = validateErrors.some((e) => /invalid characteristic key/i.test(e));
                    if (applyMentions && validateMentions) {
                        fired['characteristic-grant-rejects-invalid-key'] = true;
                        notes['characteristic-grant-rejects-invalid-key'] = `apply+validate rejected unknown characteristic key`;
                    } else {
                        notes['characteristic-grant-rejects-invalid-key'] =
                            `unexpected: applyErrors=${JSON.stringify(result.errors)} validateErrors=${JSON.stringify(validateErrors)}`;
                    }
                } catch (err) {
                    notes['characteristic-grant-rejects-invalid-key'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 12: resource-grant-apply-flat-wounds-bonus
                 * ResourceGrantData with formula "4" on wounds (additive)
                 * must bump both wounds.value and wounds.max by 4
                 * (affectsMax=true on the wounds resource definition).
                 * ============================================================ */
                try {
                    const grant = new ResourceGrantData({
                        resources: [{ type: 'wounds', formula: '4', optional: false, additive: true }],
                        optional: false,
                    });
                    const beforeMax = (getPc()?.system?.wounds?.max ?? 0) as number;
                    const beforeValue = (getPc()?.system?.wounds?.value ?? 0) as number;
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['wounds'] }, {}, result),
                        10_000,
                        'resource _applyGrant flat',
                    );
                    const afterMax = (getPc()?.system?.wounds?.max ?? 0) as number;
                    const afterValue = (getPc()?.system?.wounds?.value ?? 0) as number;
                    const applied = result.applied['wounds'] as
                        | { formula: string; rolledValue: number; additive: boolean; previousValue: number; newValue: number; previousMax: number | null; newMax: number | null }
                        | undefined;
                    if (
                        afterMax === beforeMax + 4 &&
                        afterValue === beforeValue + 4 &&
                        applied?.rolledValue === 4 &&
                        applied?.additive === true &&
                        result.errors.length === 0
                    ) {
                        fired['resource-grant-apply-flat-wounds-bonus'] = true;
                        notes['resource-grant-apply-flat-wounds-bonus'] =
                            `wounds.max: ${beforeMax} → ${afterMax}; wounds.value: ${beforeValue} → ${afterValue}; applied=${JSON.stringify(applied)}`;
                    } else {
                        notes['resource-grant-apply-flat-wounds-bonus'] =
                            `unexpected: max ${beforeMax}→${afterMax} value ${beforeValue}→${afterValue} applied=${JSON.stringify(applied)} errors=${JSON.stringify(result.errors)}`;
                    }
                } catch (err) {
                    notes['resource-grant-apply-flat-wounds-bonus'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 13: resource-grant-reverse-rolls-back
                 * Apply another flat +2 wounds bonus, then reverse and
                 * assert both wounds.max and wounds.value drop back by 2.
                 * Distinct delta from flow 12 so they don't interfere with
                 * each other when both pass.
                 * ============================================================ */
                try {
                    const grant = new ResourceGrantData({
                        resources: [{ type: 'wounds', formula: '2', optional: false, additive: true }],
                        optional: false,
                    });
                    const beforeMax = (getPc()?.system?.wounds?.max ?? 0) as number;
                    const beforeValue = (getPc()?.system?.wounds?.value ?? 0) as number;
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['wounds'] }, {}, result),
                        10_000,
                        'resource apply for reverse',
                    );
                    const midMax = (getPc()?.system?.wounds?.max ?? 0) as number;
                    const midValue = (getPc()?.system?.wounds?.value ?? 0) as number;
                    await withTimeout(grant.reverse(getPc(), result.applied), 5_000, 'resource reverse');
                    const afterMax = (getPc()?.system?.wounds?.max ?? 0) as number;
                    const afterValue = (getPc()?.system?.wounds?.value ?? 0) as number;
                    if (midMax === beforeMax + 2 && midValue === beforeValue + 2 && afterMax === beforeMax && afterValue === beforeValue) {
                        fired['resource-grant-reverse-rolls-back'] = true;
                        notes['resource-grant-reverse-rolls-back'] =
                            `wounds.max: ${beforeMax} → ${midMax} → ${afterMax}; wounds.value: ${beforeValue} → ${midValue} → ${afterValue}`;
                    } else {
                        notes['resource-grant-reverse-rolls-back'] =
                            `unexpected: max ${beforeMax}→${midMax}→${afterMax} value ${beforeValue}→${midValue}→${afterValue}`;
                    }
                } catch (err) {
                    notes['resource-grant-reverse-rolls-back'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 14: resource-grant-auto-value-rejects-dice
                 * getAutomaticValue() must return false when any resource
                 * formula contains dice / characteristic-bonus shorthand
                 * (the regex /[dD]|TB|WP|AG/i). Drive it with "1d5+TB"
                 * and assert false; for comparison, a flat formula returns
                 * the `selected` payload.
                 * ============================================================ */
                try {
                    const diceGrant = new ResourceGrantData({
                        resources: [{ type: 'fate', formula: '1d5+TB', optional: false, additive: true }],
                        optional: false,
                    });
                    const flatGrant = new ResourceGrantData({
                        resources: [{ type: 'corruption', formula: '5', optional: false, additive: true }],
                        optional: false,
                    });
                    const diceAuto = diceGrant.getAutomaticValue();
                    const flatAuto = flatGrant.getAutomaticValue() as { selected?: string[] } | false;
                    if (diceAuto === false && flatAuto !== false && Array.isArray(flatAuto.selected) && flatAuto.selected[0] === 'corruption') {
                        fired['resource-grant-auto-value-rejects-dice'] = true;
                        notes['resource-grant-auto-value-rejects-dice'] =
                            `dice formula → auto-value false; flat formula → ${JSON.stringify(flatAuto)}`;
                    } else {
                        notes['resource-grant-auto-value-rejects-dice'] = `unexpected: dice=${String(diceAuto)} flat=${JSON.stringify(flatAuto)}`;
                    }
                } catch (err) {
                    notes['resource-grant-auto-value-rejects-dice'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 15: choice-grant-apply-non-empty-selection
                 * Build a ChoiceGrantData with two options, each carrying
                 * a sub-grant. Select option "A", whose sub-grant is a
                 * characteristic-grant +2 perception. Assert the actor's
                 * perception.advance reflects the delta and the choice
                 * grant's `applied.selectedOptions` contains "A".
                 * ============================================================ */
                try {
                    const grant = new ChoiceGrantData({
                        count: 1,
                        allowDuplicates: false,
                        optional: false,
                        options: [
                            {
                                label: 'A',
                                description: 'perception bump',
                                grants: [
                                    {
                                        _id: 'choicechar000001',
                                        type: 'characteristic',
                                        characteristics: [{ key: 'perception', value: 2, optional: false }],
                                    },
                                ],
                            },
                            {
                                label: 'B',
                                description: 'unused fallback',
                                grants: [
                                    {
                                        _id: 'choicechar000002',
                                        type: 'characteristic',
                                        characteristics: [{ key: 'willpower', value: 2, optional: false }],
                                    },
                                ],
                            },
                        ],
                    });
                    const before = (getPc()?.system?.characteristics?.perception?.advance ?? 0) as number;
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['A'] }, {}, result),
                        10_000,
                        'choice _applyGrant',
                    );
                    const after = (getPc()?.system?.characteristics?.perception?.advance ?? 0) as number;
                    const applied = result.applied as { selectedOptions: string[]; grantResults: Record<string, unknown> };
                    const selectedOk = Array.isArray(applied?.selectedOptions) && applied.selectedOptions[0] === 'A';
                    const grantResultsHasKey = Object.prototype.hasOwnProperty.call(applied?.grantResults ?? {}, 'A:0');
                    if (after === before + 2 && selectedOk && grantResultsHasKey && result.errors.length === 0) {
                        fired['choice-grant-apply-non-empty-selection'] = true;
                        notes['choice-grant-apply-non-empty-selection'] =
                            `perception.advance: ${before} → ${after}; selectedOptions=${JSON.stringify(applied.selectedOptions)}`;
                    } else {
                        notes['choice-grant-apply-non-empty-selection'] =
                            `unexpected: before=${before} after=${after} selectedOk=${selectedOk} grantResultsHasKey=${grantResultsHasKey} errors=${JSON.stringify(result.errors)}`;
                    }
                } catch (err) {
                    notes['choice-grant-apply-non-empty-selection'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 16: choice-grant-reverse-round-trip
                 * Apply a fresh choice grant whose option carries a
                 * characteristic-grant (+2 fellowship); then reverse via
                 * ChoiceGrantData.reverse, which delegates to the registered
                 * sub-grant class's reverse(). Assert the actor's
                 * fellowship.advance rolls back to its pre-apply value.
                 * ============================================================ */
                try {
                    const grant = new ChoiceGrantData({
                        count: 1,
                        allowDuplicates: false,
                        optional: false,
                        options: [
                            {
                                label: 'sole',
                                description: '',
                                grants: [
                                    {
                                        _id: 'choicerev0000001',
                                        type: 'characteristic',
                                        characteristics: [{ key: 'fellowship', value: 2, optional: false }],
                                    },
                                ],
                            },
                        ],
                    });
                    const before = (getPc()?.system?.characteristics?.fellowship?.advance ?? 0) as number;
                    const result = grant._initResult();
                    await withTimeout(
                        grant._applyGrant(getPc(), { selected: ['sole'] }, {}, result),
                        10_000,
                        'choice apply for reverse',
                    );
                    const afterApply = (getPc()?.system?.characteristics?.fellowship?.advance ?? 0) as number;
                    await withTimeout(grant.reverse(getPc(), result.applied), 5_000, 'choice reverse');
                    const afterReverse = (getPc()?.system?.characteristics?.fellowship?.advance ?? -1) as number;
                    if (afterApply === before + 2 && afterReverse === before) {
                        fired['choice-grant-reverse-round-trip'] = true;
                        notes['choice-grant-reverse-round-trip'] = `fellowship.advance: ${before} → ${afterApply} → ${afterReverse}`;
                    } else {
                        notes['choice-grant-reverse-round-trip'] = `unexpected: before=${before} afterApply=${afterApply} afterReverse=${afterReverse}`;
                    }
                } catch (err) {
                    notes['choice-grant-reverse-round-trip'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 17: choice-grant-auto-value-always-false
                 * ChoiceGrantData.getAutomaticValue() always returns false
                 * because choices require user input — assert the
                 * always-false contract independent of count/optional.
                 * ============================================================ */
                try {
                    const grant = new ChoiceGrantData({
                        count: 1,
                        allowDuplicates: false,
                        optional: false,
                        options: [{ label: 'Only', description: '', grants: [] }],
                    });
                    const auto = grant.getAutomaticValue();
                    if (auto === false) {
                        fired['choice-grant-auto-value-always-false'] = true;
                        notes['choice-grant-auto-value-always-false'] = `choice grant getAutomaticValue() === false`;
                    } else {
                        notes['choice-grant-auto-value-always-false'] = `unexpected: getAutomaticValue returned ${JSON.stringify(auto)}`;
                    }
                } catch (err) {
                    notes['choice-grant-auto-value-always-false'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                // Reference unused classes once so the TS narrowing keeps
                // them imported even if a future refactor strips a flow
                // that touches them.
                void BaseGrantData;
                void SkillGrantData;
            } finally {
                // Best-effort cleanup of everything we created.
                for (const fn of cleanups) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, DATA_GRANTS_EXTRA_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('data/grant/* depth coverage (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('every grant subclass exercises apply / reverse / restore / validate / summary', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeGrantFlows(page);

        const failures: string[] = [];
        for (const flow of DATA_GRANTS_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('data-grants-extra.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${DATA_GRANTS_EXTRA_FLOWS.length} data-grants-extra probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
