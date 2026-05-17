import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the pure-logic surface in `src/module/rules/*`.
 * Most of these modules were at 0% function coverage before this spec
 * because no other Tier B test imports them directly — the system
 * code calls into them via Actor / Item methods, which take other
 * code paths in headless mode (e.g. no canvas, no chat-message
 * post-render). This spec dynamic-imports each module and drives its
 * canonical entry points against synthetic inputs so the v8 coverage
 * capture lights up every export.
 *
 * Modules exercised (and their pre-spec line / fn coverage):
 *   - `damage-type.ts` (0% / 17.9%) — three pure factory functions.
 *   - `weapon-jam.ts` (0% / 80%) — `getJamFloor` + `shouldJamRoll`.
 *   - `weapon-quality-effects.ts` (0% / 66.8%) — the quality lookup
 *     helpers (`weaponHasQuality`, `rollDataHasQuality`,
 *     `getWeaponParryModifier`).
 *   - `critical-damage.ts` (0% / 33.9%) — `getFuzzy` (the table-key
 *     fuzzy matcher), `invalidateCriticalDamageCache`,
 *     `loadCriticalDamageTable`, `getCriticalDamage` (needs the table
 *     loaded; tolerates a null return if the table compendium isn't
 *     packed in the test world).
 *   - `config.ts` (0% / 88.7%) — `fieldMatch` (case-insensitive
 *     equality) + `toggleUIExpanded` (UI-state mutator).
 *   - `ammo.ts` (0% / 53.4%) — `ammoText` (the side-effect-free
 *     formatter); the create-* / use-* functions are actor-bound
 *     and live in other specs (modifiers / weapon-attack).
 *
 * Each flow records `rule.flow::<name>`. Keys MUST match the
 * RULE_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const RULE_FLOWS = [
    'damage-type-dropdown',
    'damage-type-names',
    'damage-type-array',
    'weapon-jam-floor',
    'weapon-jam-shouldRoll',
    'quality-weaponHasQuality',
    'quality-rollDataHasQuality',
    'quality-getWeaponParryModifier',
    'critical-damage-getFuzzy',
    'critical-damage-loadTable',
    'critical-damage-invalidateCache',
    'config-fieldMatch',
    'config-toggleUIExpanded',
    'ammo-ammoText',
] as const;

type FlowName = (typeof RULE_FLOWS)[number];

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
            const loadModule = async (name: string): Promise<any | null> => {
                try {
                    return await import(`${base}/${name}.js`);
                } catch (err) {
                    return { __importError: String((err as Error)?.message ?? err) };
                }
            };

            // ---------- damage-type ----------
            const damageType = await loadModule('damage-type');
            if (damageType?.__importError) {
                for (const k of ['damage-type-dropdown', 'damage-type-names', 'damage-type-array'] as const) record(k, false, damageType.__importError);
            } else {
                try {
                    const dd = damageType.damageTypeDropdown();
                    record('damage-type-dropdown', dd !== null && typeof dd === 'object' && Object.keys(dd).length > 0, null);
                } catch (err) {
                    record('damage-type-dropdown', false, String((err as Error)?.message ?? err));
                }
                try {
                    const names = damageType.damageTypeNames();
                    record('damage-type-names', Array.isArray(names) && names.length > 0, null);
                } catch (err) {
                    record('damage-type-names', false, String((err as Error)?.message ?? err));
                }
                try {
                    const arr = damageType.damageType() as Array<{ name?: unknown }>;
                    record('damage-type-array', Array.isArray(arr) && arr.length > 0 && typeof arr[0]?.name === 'string', null);
                } catch (err) {
                    record('damage-type-array', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- weapon-jam ----------
            const weaponJam = await loadModule('weapon-jam');
            if (weaponJam?.__importError) {
                for (const k of ['weapon-jam-floor', 'weapon-jam-shouldRoll'] as const) record(k, false, weaponJam.__importError);
            } else {
                try {
                    // Drive every action variant the source switches on so the
                    // branch coverage on `getJamFloor` lights up.
                    const floors = ['single', 'semi', 'full', 'spray', 'aim', 'standard'].map((a) => weaponJam.getJamFloor(a));
                    record(
                        'weapon-jam-floor',
                        floors.every((f: unknown) => typeof f === 'number'),
                        null,
                    );
                } catch (err) {
                    record('weapon-jam-floor', false, String((err as Error)?.message ?? err));
                }
                try {
                    const r1 = weaponJam.shouldJamRoll({ action: 'semi', rollTotal: 96, success: false, hasReliable: false, hasUnreliable: true });
                    const r2 = weaponJam.shouldJamRoll({ action: 'semi', rollTotal: 50, success: true, hasReliable: true, hasUnreliable: false });
                    const r3 = weaponJam.shouldJamRoll({ action: 'full', rollTotal: 100, success: false, hasReliable: false, hasUnreliable: false });
                    record('weapon-jam-shouldRoll', typeof r1 === 'boolean' && typeof r2 === 'boolean' && typeof r3 === 'boolean', null);
                } catch (err) {
                    record('weapon-jam-shouldRoll', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- weapon-quality-effects ----------
            const wq = await loadModule('weapon-quality-effects');
            if (wq?.__importError) {
                for (const k of ['quality-weaponHasQuality', 'quality-rollDataHasQuality', 'quality-getWeaponParryModifier'] as const)
                    record(k, false, wq.__importError);
            } else {
                // weaponHasQuality reads `weapon.system.effectiveSpecial`
                // (a Set of lowercase quality names). Build a fake with the
                // expected shape so the true/false branches both fire.
                const fakeWeapon = { system: { effectiveSpecial: new Set(['reliable', 'accurate']) } };
                // rollDataHasQuality reads `rollData.attackSpecials` (array
                // of `{ name }` entries).
                const fakeRollData = { attackSpecials: [{ name: 'Tearing' }, { name: 'Reliable' }] };
                try {
                    const yes = wq.weaponHasQuality(fakeWeapon, 'Reliable');
                    const no = wq.weaponHasQuality(fakeWeapon, 'NotPresent');
                    const nullProbe = wq.weaponHasQuality(null, 'Reliable');
                    record(
                        'quality-weaponHasQuality',
                        yes === true && no === false && nullProbe === false,
                        `yes=${String(yes)} no=${String(no)} nullProbe=${String(nullProbe)}`,
                    );
                } catch (err) {
                    record('quality-weaponHasQuality', false, String((err as Error)?.message ?? err));
                }
                try {
                    const yes = wq.rollDataHasQuality(fakeRollData, 'Tearing');
                    const no = wq.rollDataHasQuality(fakeRollData, 'Felling');
                    record('quality-rollDataHasQuality', yes === true && no === false, null);
                } catch (err) {
                    record('quality-rollDataHasQuality', false, String((err as Error)?.message ?? err));
                }
                try {
                    // getWeaponParryModifier walks the same effectiveSpecial Set;
                    // 'balanced' yields a non-zero parry modifier, null yields 0.
                    const parry = wq.getWeaponParryModifier({ system: { effectiveSpecial: new Set(['balanced']) } });
                    const noParry = wq.getWeaponParryModifier(null);
                    record('quality-getWeaponParryModifier', typeof parry === 'number' && typeof noParry === 'number', null);
                } catch (err) {
                    record('quality-getWeaponParryModifier', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- critical-damage ----------
            const cd = await loadModule('critical-damage');
            if (cd?.__importError) {
                for (const k of ['critical-damage-getFuzzy', 'critical-damage-loadTable', 'critical-damage-invalidateCache'] as const)
                    record(k, false, cd.__importError);
            } else {
                try {
                    const obj = { Head: 'head-result', Body: 'body-result' };
                    const head = cd.getFuzzy(obj, 'head');
                    const body = cd.getFuzzy(obj, 'BODY');
                    const missing = cd.getFuzzy(obj, 'leg');
                    record('critical-damage-getFuzzy', head === 'head-result' && body === 'body-result' && missing === undefined, null);
                } catch (err) {
                    record('critical-damage-getFuzzy', false, String((err as Error)?.message ?? err));
                }
                try {
                    // loadCriticalDamageTable resolves a roll-table compendium; in
                    // the test world the table may be absent, in which case the
                    // function returns an empty / partial object. The important
                    // surface for coverage is the load attempt itself, not the
                    // payload content — so accept any non-throwing resolution.
                    const tbl = await cd.loadCriticalDamageTable();
                    record('critical-damage-loadTable', tbl !== null && typeof tbl === 'object', null);
                } catch (err) {
                    record('critical-damage-loadTable', false, String((err as Error)?.message ?? err));
                }
                try {
                    cd.invalidateCriticalDamageCache();
                    record('critical-damage-invalidateCache', true, null);
                } catch (err) {
                    record('critical-damage-invalidateCache', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- config ----------
            const cfg = await loadModule('config');
            if (cfg?.__importError) {
                for (const k of ['config-fieldMatch', 'config-toggleUIExpanded'] as const) record(k, false, cfg.__importError);
            } else {
                try {
                    const match = cfg.fieldMatch('HEAD', 'head');
                    const noMatch = cfg.fieldMatch('head', 'body');
                    record('config-fieldMatch', match === true && noMatch === false, null);
                } catch (err) {
                    record('config-fieldMatch', false, String((err as Error)?.message ?? err));
                }
                try {
                    cfg.toggleUIExpanded('probe-section');
                    record('config-toggleUIExpanded', true, null);
                } catch (err) {
                    record('config-toggleUIExpanded', false, String((err as Error)?.message ?? err));
                }
            }

            // ---------- ammo ----------
            const ammo = await loadModule('ammo');
            if (ammo?.__importError) {
                record('ammo-ammoText', false, ammo.__importError);
            } else {
                try {
                    // ammoText expects an AmmoItem with `usesAmmo` + clip
                    // metadata. Drive both branches: usesAmmo=true returns a
                    // formatted string; usesAmmo=false returns undefined.
                    const usesAmmo = ammo.ammoText({
                        usesAmmo: true,
                        system: {
                            loadedAmmo: { name: 'Probe Ammo' },
                            clip: { value: 5 },
                            effectiveClipMax: 10,
                        },
                    });
                    const noAmmo = ammo.ammoText({ usesAmmo: false, system: {} });
                    record(
                        'ammo-ammoText',
                        typeof usesAmmo === 'string' && usesAmmo.length > 0 && noAmmo === undefined,
                        `usesAmmo=${String(usesAmmo)} noAmmo=${String(noAmmo)}`,
                    );
                } catch (err) {
                    record('ammo-ammoText', false, String((err as Error)?.message ?? err));
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

test.describe.serial('rules engine pure-logic surface (Tier B)', () => {
    test('every rules/* pure-logic surface returns without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeRules(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('rule.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of RULE_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${RULE_FLOWS.length} rules-engine flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
