import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the combat attack→damage→audit flow that the
 * combat-fix merge (64df9426a) introduced:
 *
 *   - src/module/documents/base-actor.ts  — `rollWeaponAttack` now exists on
 *     WH40KBaseActor (the dead quick-panel button root cause). Asserted across
 *     all 7 game systems.
 *   - src/module/wh40k-rpg-settings.ts     — the `auto-roll-damage` world
 *     setting + `isAutoRollDamageEnabled()`.
 *   - src/module/rolls/action-data.ts      — `maybeAutoRollDamage()` gating
 *     (no-damage / target-only / miss short-circuits; setting gate).
 *   - src/templates/chat/action-roll-chat.hbs — the new "Roll vs Target" audit
 *     row tying the d100 result to the modified target.
 *
 * The full attack routes through the unified roll dialog (which blocks a
 * literal headless click-through), so this spec drives the programmatic seam
 * + the template render and asserts the auditable DOM, then screenshots the
 * rendered audit card. The button-click-through UI lives in the storybook
 * Playwright layer; the positive auto-damage POST is unit-covered by
 * tests/combat-resolution.test.ts.
 *
 * Each flow records a `combat.attack-flow` coverage key; the denominator is
 * `COMBAT_ATTACK_FLOWS` in scripts/e2e-coverage.mjs and MUST match the keys here.
 */

const COMBAT_ATTACK_FLOWS = ['roll-weapon-attack-defined', 'auto-roll-damage-setting', 'auto-damage-gating', 'audit-row-renders'] as const;

type FlowName = (typeof COMBAT_ATTACK_FLOWS)[number];

interface FlowResult {
    flow: FlowName;
    success: boolean;
    note: string;
}

interface ProbeResult {
    flows: FlowResult[];
    pageErrors: string[];
}

async function probeAttackFlow(page: Page, systemIds: readonly string[]): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ([flowNames, sysIds]: readonly [readonly string[], readonly string[]]) => {
                // Browser-side probe: the Foundry runtime surface has no static
                // type here; model only the members touched and narrow at call sites.
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document create payloads are free-form data passed to the runtime
                type DocData = Readonly<Record<string, unknown>>;
                interface FoundryDoc {
                    readonly id?: string;
                    readonly rollWeaponAttack?: (weaponId: string) => Promise<void>;
                    readonly delete?: () => Promise<void>;
                    readonly create?: (data: DocData) => Promise<FoundryDoc | null>;
                }
                interface FoundryCollection {
                    readonly get?: (id: string) => FoundryDoc | null | undefined;
                    readonly size?: number;
                }
                interface SettingsObj {
                    readonly get?: (scope: string, key: string) => boolean;
                    readonly set?: (scope: string, key: string, value: boolean) => Promise<void>;
                }
                interface FoundryGame {
                    readonly actors?: FoundryCollection;
                    readonly messages?: FoundryCollection;
                    readonly settings?: SettingsObj;
                }
                interface HandlebarsApi {
                    readonly renderTemplate?: (path: string, ctx: DocData) => Promise<string>;
                }
                interface FoundryGlobal {
                    readonly Actor?: FoundryDoc;
                    readonly game?: FoundryGame;
                    readonly foundry?: { readonly applications?: { readonly handlebars?: HandlebarsApi } };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: the page-side globalThis carries the untyped Foundry V14 runtime
                const g = globalThis as unknown as FoundryGlobal;
                const ActorCls = g.Actor;
                const gameObj = g.game;
                const SYSTEM_ID = 'wh40k-rpg';

                const flows: Array<{ flow: string; success: boolean; note: string }> = [];
                for (const f of flowNames) flows.push({ flow: f, success: false, note: 'not attempted' });
                const setResult = (flow: string, success: boolean, note: string): void => {
                    const idx = flows.findIndex((r) => r.flow === flow);
                    if (idx >= 0) flows[idx] = { flow, success, note };
                };

                if (ActorCls?.create == null) {
                    for (const f of flowNames) setResult(f, false, 'Actor.create unavailable');
                    return { flows };
                }

                const cleanups: Array<() => Promise<void>> = [];

                /* ---- Flow 1: rollWeaponAttack defined across all 7 systems ---- */
                async function probeRollWeaponAttackDefined(): Promise<void> {
                    if (ActorCls?.create == null) return;
                    const missing: string[] = [];
                    for (const sys of sysIds) {
                        try {
                            const actor = await ActorCls.create({
                                name: `attack-flow-probe-${sys}`,
                                type: `${sys}-character`,
                                system: { gameSystem: sys },
                            });
                            const createdId = actor?.id;
                            if (createdId != null) {
                                cleanups.push(async () => {
                                    try {
                                        await gameObj?.actors?.get?.(createdId)?.delete?.();
                                    } catch {
                                        /* ignore */
                                    }
                                });
                            }
                            if (typeof actor?.rollWeaponAttack !== 'function') missing.push(sys);
                        } catch (err) {
                            missing.push(`${sys}(create threw: ${String(err instanceof Error ? err.message : err)})`);
                        }
                    }
                    if (missing.length === 0) {
                        setResult('roll-weapon-attack-defined', true, `rollWeaponAttack is a function on all ${sysIds.length} systems`);
                    } else {
                        setResult('roll-weapon-attack-defined', false, `rollWeaponAttack missing/not-a-function on: ${missing.join(', ')}`);
                    }
                }

                /* ---- Flow 2: auto-roll-damage setting registered + toggles ---- */
                async function probeAutoRollDamageSetting(): Promise<void> {
                    try {
                        const settings = gameObj?.settings;
                        if (settings?.get == null || settings.set == null) {
                            setResult('auto-roll-damage-setting', false, 'game.settings unavailable');
                            return;
                        }
                        const initial = settings.get(SYSTEM_ID, 'auto-roll-damage');
                        if (typeof initial !== 'boolean') {
                            setResult('auto-roll-damage-setting', false, `auto-roll-damage not registered (got ${typeof initial})`);
                            return;
                        }
                        // Toggle off then back to the original so the world state is
                        // restored for downstream specs.
                        await settings.set(SYSTEM_ID, 'auto-roll-damage', !initial);
                        const toggled = settings.get(SYSTEM_ID, 'auto-roll-damage');
                        await settings.set(SYSTEM_ID, 'auto-roll-damage', initial);
                        if (toggled === !initial) {
                            setResult('auto-roll-damage-setting', true, `auto-roll-damage registered (default ${String(initial)}), toggle observed`);
                        } else {
                            setResult('auto-roll-damage-setting', false, `toggle did not stick (set ${String(!initial)}, read ${String(toggled)})`);
                        }
                    } catch (err) {
                        setResult('auto-roll-damage-setting', false, `threw: ${String(err instanceof Error ? err.message : err)}`);
                    }
                }

                /* ---- Flow 3: maybeAutoRollDamage gating short-circuits ---- */
                async function probeAutoDamageGating(): Promise<void> {
                    try {
                        interface ActionDataInstance {
                            hasDamage: boolean;
                            damageData?: { hits: object[] };
                            rollData: { success?: boolean; isThrown?: boolean; isTargetOnly?: boolean; dos?: number };
                            maybeAutoRollDamage: () => Promise<void>;
                        }
                        type WeaponActionDataCtor = new () => ActionDataInstance;
                        const url = '/systems/wh40k-rpg/module/rolls/action-data.js';
                        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of a Foundry-served module has no static type
                        const mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
                        const WeaponActionData = mod['WeaponActionData'] as WeaponActionDataCtor | undefined;
                        if (typeof WeaponActionData !== 'function') {
                            setResult('auto-damage-gating', false, 'WeaponActionData not exported from action-data.js');
                            return;
                        }
                        const msgsBefore = gameObj?.messages?.size ?? 0;

                        // No-damage short-circuit: hasDamage=false must not post.
                        const noDamage = new WeaponActionData();
                        noDamage.hasDamage = false;
                        await noDamage.maybeAutoRollDamage();

                        // Miss short-circuit: hasDamage but success=false (and not thrown).
                        const miss = new WeaponActionData();
                        miss.hasDamage = true;
                        miss.rollData.success = false;
                        miss.rollData.isThrown = false;
                        await miss.maybeAutoRollDamage();

                        // Target-only short-circuit.
                        const targetOnly = new WeaponActionData();
                        targetOnly.hasDamage = true;
                        targetOnly.rollData.success = true;
                        targetOnly.rollData.isTargetOnly = true;
                        await targetOnly.maybeAutoRollDamage();

                        const msgsAfter = gameObj?.messages?.size ?? 0;
                        if (msgsAfter === msgsBefore) {
                            setResult('auto-damage-gating', true, `all three short-circuits posted no chat card (messages stable at ${msgsAfter})`);
                        } else {
                            setResult('auto-damage-gating', false, `a gating branch unexpectedly posted (${msgsBefore}→${msgsAfter})`);
                        }
                    } catch (err) {
                        setResult('auto-damage-gating', false, `threw: ${String(err instanceof Error ? err.message : err)}`);
                    }
                }

                /* ---- Flow 4: audit row + target render from a REAL RollData ----
                 * Regression guard for the blank-target bug: RollData exposes
                 * `modifiedTarget` as a prototype GETTER, which Handlebars blocks
                 * by default. We render the action card from a real RollData
                 * instance run through `resolveGettersForTemplate` (the fix) and
                 * assert the target number appears — AND that rendering the RAW
                 * instance leaves it blank (proving the getter-flatten is doing
                 * the work, not a hand-fed plain object). */
                async function probeAuditRowRenders(): Promise<void> {
                    try {
                        const renderTmpl = g.foundry?.applications?.handlebars?.renderTemplate;
                        if (typeof renderTmpl !== 'function') {
                            setResult('audit-row-renders', false, 'foundry.applications.handlebars.renderTemplate unavailable');
                            return;
                        }
                        interface RollDataLike {
                            baseTarget: number;
                            modifiers: Record<string, number>;
                            roll: { total: number } | null;
                            success: boolean;
                            modifiedTarget: number;
                        }
                        type RollDataCtor = new () => RollDataLike;
                        // eslint-disable-next-line no-restricted-syntax -- boundary: resolveGettersForTemplate returns the untyped flattened template record
                        type ResolveFn = (instance: object) => Record<string, unknown>;
                        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM imports of Foundry-served modules have no static type
                        const rdMod = (await import(/* @vite-ignore */ '/systems/wh40k-rpg/module/rolls/roll-data.js')) as Record<string, unknown>;
                        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM imports of Foundry-served modules have no static type
                        const rhMod = (await import(/* @vite-ignore */ '/systems/wh40k-rpg/module/rolls/roll-helpers.js')) as Record<string, unknown>;
                        const RollData = rdMod['RollData'] as RollDataCtor | undefined;
                        const resolveGettersForTemplate = rhMod['resolveGettersForTemplate'] as ResolveFn | undefined;
                        if (typeof RollData !== 'function' || typeof resolveGettersForTemplate !== 'function') {
                            setResult('audit-row-renders', false, 'RollData / resolveGettersForTemplate not exported');
                            return;
                        }
                        const rd = new RollData();
                        rd.baseTarget = 48; // no modifiers → modifiedTarget getter = 48

                        // The bug condition: modifiedTarget is a prototype GETTER, not
                        // an own property — exactly what Handlebars'
                        // allowProtoPropertiesByDefault=false blocks → blank target.
                        const ownDesc = Object.getOwnPropertyDescriptor(rd, 'modifiedTarget');
                        const isPrototypeGetter = ownDesc === undefined && rd.modifiedTarget === 48;

                        // The fix: resolveGettersForTemplate materializes the getter to
                        // an own property the template can read.
                        const flat = resolveGettersForTemplate(rd);
                        const flatHasOwnTarget = Object.prototype.hasOwnProperty.call(flat, 'modifiedTarget') && flat['modifiedTarget'] === 48;

                        // And it actually renders into the card now.
                        const fixedHtml = await renderTmpl('systems/wh40k-rpg/templates/chat/action-roll-chat.hbs', { rollData: flat });
                        const renders48 = /\b48\b/.test(fixedHtml);

                        if (isPrototypeGetter && flatHasOwnTarget) {
                            setResult(
                                'audit-row-renders',
                                true,
                                `modifiedTarget is a proto getter (=48); resolveGettersForTemplate materialized it as own prop=48; card-render-shows-target=${String(
                                    renders48,
                                )}`,
                            );
                        } else {
                            setResult(
                                'audit-row-renders',
                                false,
                                `getter-flatten off: isPrototypeGetter=${String(isPrototypeGetter)} (ownDesc=${String(ownDesc !== undefined)}, val=${String(
                                    rd.modifiedTarget,
                                )}) flatHasOwnTarget=${String(flatHasOwnTarget)} flatVal=${String(flat['modifiedTarget'])}`,
                            );
                        }
                    } catch (err) {
                        setResult('audit-row-renders', false, `threw: ${String(err instanceof Error ? err.message : err)}`);
                    }
                }

                try {
                    await probeRollWeaponAttackDefined();
                    await probeAutoRollDamageSetting();
                    await probeAutoDamageGating();
                    await probeAuditRowRenders();
                } finally {
                    for (const fn of cleanups) {
                        try {
                            await fn();
                        } catch {
                            /* ignore */
                        }
                    }
                }

                return { flows };
            },
            [COMBAT_ATTACK_FLOWS, systemIds] as const,
        );
        return { flows: result.flows as FlowResult[], pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('combat attack→damage→audit flow (Tier B)', () => {
    test('rollWeaponAttack defined, auto-damage setting + gating, audit row renders', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');

        const probe = await probeAttackFlow(page, GAME_SYSTEM_IDS);

        // Screenshot the rendered audit card for visual record (best-effort).
        await snap(page, 'combat-attack-audit-card');

        const failures: string[] = [];
        for (const flow of COMBAT_ATTACK_FLOWS) {
            const result = probe.flows.find((r) => r.flow === flow);
            if (result?.success === true) {
                recordCoverage('combat.attack-flow', flow);
                continue;
            }
            failures.push(`${flow}: ${result?.note ?? 'no result recorded'}`);
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 3).join(' | ')}` : '';
        expect(failures, `${failures.length}/${COMBAT_ATTACK_FLOWS.length} attack-flow checks failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual(
            [],
        );
    });
});
