import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the remaining pure-logic / progression surface in
 * `src/module/rules/*` that no other Tier B spec imports directly.
 * `rules-engine.spec.ts` already covers the damage / jam / quality /
 * critical / config / ammo cluster; `active-effects-rules.spec.ts`,
 * `subtlety.spec.ts`, and the per-supplement specs cover the rest of
 * the inventory. This spec dynamic-imports the still-uncovered modules
 * and drives their canonical entry points against synthetic inputs so
 * the v8 coverage capture lights up every export.
 *
 * Modules exercised (all were at 0% function coverage from Tier B
 * before this spec because the system code reaches them only via
 * Actor / Item roll methods, which take other paths in headless mode):
 *   - `chaos-talents.ts` — Enemies Within talent constant table.
 *   - `elite-advances.ts` — Elite Advance definition registry +
 *     prerequisite shapes.
 *   - `radical-services.ts` — Radical Services requisition table +
 *     availability refs into `requisition-test.ts`.
 *   - `xenos-features.ts` — Enemies Without role / talent / homeworld
 *     constant table.
 *   - `profane-objects.ts` — Profane Object item-shape module (type
 *     surface; covered for the import + module-shape sanity).
 *   - `weapon-training.ts` — `checkWeaponTraining`,
 *     `getWeaponTrainingModifier`, `getWeaponTrainingDescription`
 *     (no-training / untrained branches against a synthetic actor).
 *   - `weapon-modifiers.ts` — `updateWeaponModifiers`,
 *     `calculateWeaponModifiersAttackBonuses`,
 *     `calculateWeaponModifiersAttackSpecials` driven with a minimal
 *     rollData whose actionItem has an empty item collection (the
 *     loop-skip / early-return paths — the mutators complete without
 *     throwing, which is the covered outcome).
 *   - `range.ts` — `calculateWeaponRange` for the melee branch and the
 *     no-weapon guard branch (both side-effect-only on the rollData).
 *
 * Each flow records `rule-progression.flow::<name>`. Keys MUST match
 * the RULE_PROGRESSION_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator).
 */

const RULE_PROGRESSION_FLOWS = [
    'chaos-talents-constants',
    'elite-advances-registry',
    'elite-advances-prerequisites',
    'radical-services-registry',
    'radical-services-availability',
    'xenos-features-constants',
    'profane-objects-module-shape',
    'weapon-training-check-noTraining',
    'weapon-training-check-untrained',
    'weapon-training-modifier',
    'weapon-training-description',
    'weapon-modifiers-update',
    'weapon-modifiers-attackBonuses',
    'weapon-modifiers-attackSpecials',
    'range-calculateWeaponRange-melee',
    'range-calculateWeaponRange-noWeapon',
] as const;

type FlowName = (typeof RULE_PROGRESSION_FLOWS)[number];

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
                    return { __importError: String((err as Error)?.message ?? err) };
                }
            };

            // ---------- chaos-talents ----------
            const chaosTalents = await loadModule('chaos-talents');
            if (chaosTalents.__importError !== undefined) {
                record('chaos-talents-constants', false, String(chaosTalents.__importError));
            } else {
                try {
                    const aegis = chaosTalents.AEGIS_OF_CONTEMPT;
                    const flagellant = chaosTalents.FLAGELLANT;
                    const tainted = chaosTalents.TAINTED_PSYKER;
                    record(
                        'chaos-talents-constants',
                        typeof aegis?.radiusMetres === 'number' && typeof flagellant?.wpBonus === 'number' && typeof tainted?.testBonusPerCp === 'number',
                        null,
                    );
                } catch (err) {
                    record('chaos-talents-constants', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- elite-advances ----------
            const elite = await loadModule('elite-advances');
            if (elite.__importError !== undefined) {
                for (const k of ['elite-advances-registry', 'elite-advances-prerequisites'] as const) record(k, false, String(elite.__importError));
            } else {
                try {
                    const reg = elite.ELITE_ADVANCES as Record<string, { id?: unknown; xpCost?: unknown }>;
                    const ids = Object.keys(reg);
                    const allShaped = ids.every((id) => typeof reg[id]?.id === 'string' && typeof reg[id]?.xpCost === 'number');
                    record('elite-advances-registry', ids.length > 0 && allShaped, `ids=${ids.join(',')}`);
                } catch (err) {
                    record('elite-advances-registry', false, String((err as Error)?.message ?? err));
                }
                try {
                    const astropath = (elite.ELITE_ADVANCES as Record<string, { prerequisites?: Array<{ type?: unknown; minimum?: unknown }> }>).astropath;
                    const prereqs = astropath?.prerequisites ?? [];
                    const allValid = prereqs.length > 0 && prereqs.every((p) => typeof p.type === 'string' && typeof p.minimum === 'number');
                    record('elite-advances-prerequisites', allValid, null);
                } catch (err) {
                    record('elite-advances-prerequisites', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- radical-services ----------
            const radical = await loadModule('radical-services');
            if (radical.__importError !== undefined) {
                for (const k of ['radical-services-registry', 'radical-services-availability'] as const) record(k, false, String(radical.__importError));
            } else {
                try {
                    const reg = radical.RADICAL_SERVICES as Record<string, { id?: unknown; threatLevel?: unknown; subtletyOnHire?: unknown }>;
                    const ids = Object.keys(reg);
                    const allShaped = ids.every(
                        (id) => typeof reg[id]?.id === 'string' && typeof reg[id]?.threatLevel === 'number' && typeof reg[id]?.subtletyOnHire === 'number',
                    );
                    record('radical-services-registry', ids.length > 0 && allShaped, `ids=${ids.join(',')}`);
                } catch (err) {
                    record('radical-services-registry', false, String((err as Error)?.message ?? err));
                }
                try {
                    const reg = radical.RADICAL_SERVICES as Record<string, { availability?: unknown }>;
                    const availabilities = Object.values(reg).map((s) => s.availability);
                    const allStrings = availabilities.length > 0 && availabilities.every((a) => typeof a === 'string' && a.length > 0);
                    record('radical-services-availability', allStrings, null);
                } catch (err) {
                    record('radical-services-availability', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- xenos-features ----------
            const xenos = await loadModule('xenos-features');
            if (xenos.__importError !== undefined) {
                record('xenos-features-constants', false, String(xenos.__importError));
            } else {
                try {
                    const rightStuff = xenos.RIGHT_STUFF as { applicableSkills?: readonly string[] };
                    const pushLimit = xenos.PUSH_THE_LIMIT as { operateBonus?: unknown; failureThresholdForCritical?: unknown };
                    const survivors = xenos.SURVIVORS_PARANOIA as { negatedSurpriseBonus?: unknown };
                    record(
                        'xenos-features-constants',
                        Array.isArray(rightStuff?.applicableSkills) &&
                            rightStuff.applicableSkills.length > 0 &&
                            typeof pushLimit?.operateBonus === 'number' &&
                            typeof pushLimit?.failureThresholdForCritical === 'number' &&
                            typeof survivors?.negatedSurpriseBonus === 'number',
                        null,
                    );
                } catch (err) {
                    record('xenos-features-constants', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- profane-objects ----------
            // Type-only module: importing it confirms the build emits a
            // resolvable chunk and that the shape surface stays stable.
            const profane = await loadModule('profane-objects');
            if (profane.__importError !== undefined) {
                record('profane-objects-module-shape', false, String(profane.__importError));
            } else {
                try {
                    record('profane-objects-module-shape', profane !== null && typeof profane === 'object', null);
                } catch (err) {
                    record('profane-objects-module-shape', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- weapon-training ----------
            const wt = await loadModule('weapon-training');
            if (wt.__importError !== undefined) {
                for (const k of [
                    'weapon-training-check-noTraining',
                    'weapon-training-check-untrained',
                    'weapon-training-modifier',
                    'weapon-training-description',
                ] as const)
                    record(k, false, String(wt.__importError));
            } else {
                // Synthetic actor: an items array of plain talent-shaped
                // objects. No talent matches "Las", so the untrained
                // branch fires; a weapon with no requiredTraining hits
                // the early "trained: true" branch.
                const actor = { items: [{ type: 'talent', name: 'Quick Draw' }] };
                const untrainedWeapon = { system: { requiredTraining: 'Las', special: '' } };
                const freeWeapon = { system: { requiredTraining: '-', special: '' } };
                try {
                    const r = wt.checkWeaponTraining(actor, freeWeapon);
                    record('weapon-training-check-noTraining', r?.trained === true && r?.talent === null, null);
                } catch (err) {
                    record('weapon-training-check-noTraining', false, String((err as Error)?.message ?? err));
                }
                try {
                    const r = wt.checkWeaponTraining(actor, untrainedWeapon);
                    record('weapon-training-check-untrained', r?.trained === false && r?.talent === null, null);
                } catch (err) {
                    record('weapon-training-check-untrained', false, String((err as Error)?.message ?? err));
                }
                try {
                    const free = wt.getWeaponTrainingModifier(actor, freeWeapon);
                    const untrained = wt.getWeaponTrainingModifier(actor, untrainedWeapon);
                    record('weapon-training-modifier', free === 0 && untrained === -20, `free=${String(free)} untrained=${String(untrained)}`);
                } catch (err) {
                    record('weapon-training-modifier', false, String((err as Error)?.message ?? err));
                }
                try {
                    const desc = wt.getWeaponTrainingDescription(actor, untrainedWeapon);
                    record('weapon-training-description', typeof desc === 'string' && desc.length > 0, null);
                } catch (err) {
                    record('weapon-training-description', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- weapon-modifiers ----------
            const wm = await loadModule('weapon-modifiers');
            if (wm.__importError !== undefined) {
                for (const k of ['weapon-modifiers-update', 'weapon-modifiers-attackBonuses', 'weapon-modifiers-attackSpecials'] as const)
                    record(k, false, String(wm.__importError));
            } else {
                // Minimal rollData whose actionItem (weapon) carries an
                // empty item collection: the loop bodies short-circuit and
                // each mutator completes without throwing — the covered
                // outcome for an actor-bound mutator in headless mode.
                const actionItem = { items: [] as unknown[], isRanged: false };
                try {
                    const rollData: any = { weapon: actionItem, weaponModifications: [], modifiers: {}, attackSpecials: [], action: 'Standard Attack' };
                    wm.updateWeaponModifiers(rollData);
                    record('weapon-modifiers-update', Array.isArray(rollData.weaponModifications) && rollData.weaponModifications.length === 0, null);
                } catch (err) {
                    record('weapon-modifiers-update', false, String((err as Error)?.message ?? err));
                }
                try {
                    const rollData: any = { weapon: actionItem, weaponModifiers: { stale: 1 }, modifiers: {}, attackSpecials: [], action: 'Standard Attack' };
                    wm.calculateWeaponModifiersAttackBonuses(rollData);
                    // The function resets weaponModifiers to {} before the loop.
                    record('weapon-modifiers-attackBonuses', Object.keys(rollData.weaponModifiers).length === 0, null);
                } catch (err) {
                    record('weapon-modifiers-attackBonuses', false, String((err as Error)?.message ?? err));
                }
                try {
                    const rollData: any = {
                        weapon: actionItem,
                        modifiers: {},
                        attackSpecials: [{ name: 'Primitive' }],
                        action: 'Standard Attack',
                    };
                    wm.calculateWeaponModifiersAttackSpecials(rollData);
                    record('weapon-modifiers-attackSpecials', Array.isArray(rollData.attackSpecials), null);
                } catch (err) {
                    record('weapon-modifiers-attackSpecials', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- range ----------
            const range = await loadModule('range');
            if (range.__importError !== undefined) {
                for (const k of ['range-calculateWeaponRange-melee', 'range-calculateWeaponRange-noWeapon'] as const)
                    record(k, false, String(range.__importError));
            } else {
                try {
                    // Melee branch: maxRange forced to 1, range bracket = melee,
                    // no Roll formula path. hasWeaponModification short-circuits
                    // because rangeBonus is not negative here.
                    const rollData: any = {
                        weapon: { isMelee: true, system: {} },
                        distance: 2,
                        modifiers: { aim: 0 },
                        hasWeaponModification: () => false,
                        hasAttackSpecial: () => false,
                    };
                    range.calculateWeaponRange(rollData);
                    record('range-calculateWeaponRange-melee', rollData.rangeName === 'Melee' && rollData.maxRange === 1, null);
                } catch (err) {
                    record('range-calculateWeaponRange-melee', false, String((err as Error)?.message ?? err));
                }
                try {
                    // No-weapon guard: maxRange resolves to 0, the ranged
                    // calculator still runs with an empty quality set. The
                    // mutator must complete and assign a string rangeName.
                    const rollData: any = {
                        weapon: undefined,
                        distance: 5,
                        modifiers: { aim: 0 },
                        hasWeaponModification: () => false,
                        hasAttackSpecial: () => false,
                    };
                    range.calculateWeaponRange(rollData);
                    record('range-calculateWeaponRange-noWeapon', rollData.maxRange === 0 && typeof rollData.rangeName === 'string', null);
                } catch (err) {
                    record('range-calculateWeaponRange-noWeapon', false, String((err as Error)?.message ?? err));
                }
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('rules progression surface (Tier B)', () => {
    test('every remaining rules/* progression surface returns without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rule-progression.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of RULE_PROGRESSION_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${RULE_PROGRESSION_FLOWS.length} rules-progression flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
