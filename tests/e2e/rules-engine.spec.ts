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
            interface ImportError {
                __importError?: string;
            }
            interface DamageTypeModule extends ImportError {
                damageTypeDropdown: () => Record<string, string>;
                damageTypeNames: () => string[];
                damageType: () => { name: string }[];
            }
            interface ShouldJamInput {
                action: string;
                rollTotal: number;
                success: boolean;
                hasReliable: boolean;
                hasUnreliable: boolean;
            }
            interface WeaponJamModule extends ImportError {
                getJamFloor: (action: string) => number;
                shouldJamRoll: (input: ShouldJamInput) => boolean;
            }
            interface FakeWeapon {
                system: { effectiveSpecial: Set<string> };
            }
            interface WeaponQualityModule extends ImportError {
                weaponHasQuality: (weapon: FakeWeapon | null, quality: string) => boolean;
                rollDataHasQuality: (rollData: { attackSpecials: { name: string }[] }, quality: string) => boolean;
                getWeaponParryModifier: (weapon: FakeWeapon | null) => number;
            }
            interface CriticalDamageModule extends ImportError {
                // getFuzzy / loadCriticalDamageTable are module-internal; getCriticalDamage
                // is the public caller that drives both (table load + fuzzy key match).
                getCriticalDamage: (type: string, location: string, amount: number) => Promise<string | null>;
                invalidateCriticalDamageCache: () => void;
            }
            interface ConfigModule extends ImportError {
                fieldMatch: (a: string, b: string) => boolean;
                toggleUIExpanded: (section: string) => void;
            }
            interface FakeAmmoRollData {
                weapon: {
                    usesAmmo: boolean;
                    system: { loadedAmmo?: { name: string }; clip: { value: number }; effectiveClipMax?: number; attack?: { rateOfFire?: { full?: number; semi?: number } } };
                };
                action: string;
                hasAttackSpecial: (name: string) => boolean;
                specialModifiers: Record<string, number>;
                attackSpecials: { name: string }[];
                ammoPerShot?: number;
                fireRate?: number;
                ammoUsed?: number;
                ammoText?: string;
            }
            interface AmmoModule extends ImportError {
                // ammoText is module-internal; calculateAmmoInformation is the public
                // caller that invokes it and writes the result onto rollData.ammoText.
                calculateAmmoInformation: (rollData: FakeAmmoRollData) => void;
            }

            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/rules`;
            const loadModule = async <T extends ImportError>(name: string): Promise<T> => {
                try {
                    return (await import(`${base}/${name}.js`)) as T;
                } catch (err) {
                    return { __importError: err instanceof Error ? err.message : String(err) } as T;
                }
            };

            // ---------- damage-type ----------
            const damageType = await loadModule<DamageTypeModule>('damage-type');
            if (damageType.__importError != null) {
                for (const k of ['damage-type-dropdown', 'damage-type-names', 'damage-type-array'] as const) record(k, false, damageType.__importError);
            } else {
                try {
                    const dd = damageType.damageTypeDropdown();
                    record('damage-type-dropdown', Object.keys(dd).length > 0, null);
                } catch (err) {
                    record('damage-type-dropdown', false, err instanceof Error ? err.message : String(err));
                }
                try {
                    const names = damageType.damageTypeNames();
                    record('damage-type-names', names.length > 0, null);
                } catch (err) {
                    record('damage-type-names', false, err instanceof Error ? err.message : String(err));
                }
                try {
                    const arr = damageType.damageType();
                    record('damage-type-array', arr.length > 0 && typeof arr[0].name === 'string', null);
                } catch (err) {
                    record('damage-type-array', false, err instanceof Error ? err.message : String(err));
                }
            }

            // ---------- weapon-jam + weapon-quality + critical-damage ----------
            async function probeWeaponRules(): Promise<void> {
                // ---------- weapon-jam ----------
                const weaponJam = await loadModule<WeaponJamModule>('weapon-jam');
                if (weaponJam.__importError != null) {
                    for (const k of ['weapon-jam-floor', 'weapon-jam-shouldRoll'] as const) record(k, false, weaponJam.__importError);
                } else {
                    try {
                        // Drive every action variant the source switches on so the
                        // branch coverage on `getJamFloor` lights up.
                        const actions = ['single', 'semi', 'full', 'spray', 'aim', 'standard'];
                        const floors = actions.map((a) => weaponJam.getJamFloor(a));
                        record('weapon-jam-floor', floors.length === actions.length && floors.every((f) => Number.isFinite(f)), null);
                    } catch (err) {
                        record('weapon-jam-floor', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        const jamResults = [
                            weaponJam.shouldJamRoll({ action: 'semi', rollTotal: 96, success: false, hasReliable: false, hasUnreliable: true }),
                            weaponJam.shouldJamRoll({ action: 'semi', rollTotal: 50, success: true, hasReliable: true, hasUnreliable: false }),
                            weaponJam.shouldJamRoll({ action: 'full', rollTotal: 100, success: false, hasReliable: false, hasUnreliable: false }),
                        ];
                        record('weapon-jam-shouldRoll', jamResults.length === 3, null);
                    } catch (err) {
                        record('weapon-jam-shouldRoll', false, err instanceof Error ? err.message : String(err));
                    }
                }

                // ---------- weapon-quality-effects ----------
                const wq = await loadModule<WeaponQualityModule>('weapon-quality-effects');
                if (wq.__importError != null) {
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
                        record('quality-weaponHasQuality', yes && !no && !nullProbe, `yes=${String(yes)} no=${String(no)} nullProbe=${String(nullProbe)}`);
                    } catch (err) {
                        record('quality-weaponHasQuality', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        const yes = wq.rollDataHasQuality(fakeRollData, 'Tearing');
                        const no = wq.rollDataHasQuality(fakeRollData, 'Felling');
                        record('quality-rollDataHasQuality', yes && !no, null);
                    } catch (err) {
                        record('quality-rollDataHasQuality', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        // getWeaponParryModifier walks the same effectiveSpecial Set;
                        // 'balanced' yields a non-zero parry modifier, null yields 0.
                        const parry = wq.getWeaponParryModifier({ system: { effectiveSpecial: new Set(['balanced']) } });
                        const noParry = wq.getWeaponParryModifier(null);
                        record('quality-getWeaponParryModifier', Number.isFinite(parry) && Number.isFinite(noParry), null);
                    } catch (err) {
                        record('quality-getWeaponParryModifier', false, err instanceof Error ? err.message : String(err));
                    }
                }

                // ---------- critical-damage ----------
                const cd = await loadModule<CriticalDamageModule>('critical-damage');
                if (cd.__importError != null) {
                    for (const k of ['critical-damage-getFuzzy', 'critical-damage-loadTable', 'critical-damage-invalidateCache'] as const)
                        record(k, false, cd.__importError);
                } else {
                    try {
                        // getCriticalDamage is the public caller that internally drives
                        // the table-key fuzzy matcher (getFuzzy). With the pack absent the
                        // table is empty and it returns null; the surface for coverage is
                        // the lookup + fuzzy-match attempt, so accept null (or a string).
                        const head = await cd.getCriticalDamage('Impact', 'head', 5);
                        const missing = await cd.getCriticalDamage('Impact', 'leg', 5);
                        record('critical-damage-getFuzzy', (head === null || typeof head === 'string') && (missing === null || typeof missing === 'string'), null);
                    } catch (err) {
                        record('critical-damage-getFuzzy', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        // getCriticalDamage internally awaits loadCriticalDamageTable; in
                        // the test world the table compendium may be absent, in which case
                        // the load resolves to an empty table and the lookup returns null.
                        // The important surface for coverage is the load attempt itself —
                        // accept any non-throwing resolution.
                        const tbl = await cd.getCriticalDamage('Rending', 'body', 3);
                        record('critical-damage-loadTable', tbl === null || typeof tbl === 'string', null);
                    } catch (err) {
                        record('critical-damage-loadTable', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        cd.invalidateCriticalDamageCache();
                        record('critical-damage-invalidateCache', true, null);
                    } catch (err) {
                        record('critical-damage-invalidateCache', false, err instanceof Error ? err.message : String(err));
                    }
                }
            }

            // ---------- config + ammo ----------
            async function probeConfigAndAmmo(): Promise<void> {
                // ---------- config ----------
                const cfg = await loadModule<ConfigModule>('config');
                if (cfg.__importError != null) {
                    for (const k of ['config-fieldMatch', 'config-toggleUIExpanded'] as const) record(k, false, cfg.__importError);
                } else {
                    try {
                        const match = cfg.fieldMatch('HEAD', 'head');
                        const noMatch = cfg.fieldMatch('head', 'body');
                        record('config-fieldMatch', match && !noMatch, null);
                    } catch (err) {
                        record('config-fieldMatch', false, err instanceof Error ? err.message : String(err));
                    }
                    try {
                        cfg.toggleUIExpanded('probe-section');
                        record('config-toggleUIExpanded', true, null);
                    } catch (err) {
                        record('config-toggleUIExpanded', false, err instanceof Error ? err.message : String(err));
                    }
                }

                // ---------- ammo ----------
                const ammo = await loadModule<AmmoModule>('ammo');
                if (ammo.__importError != null) {
                    record('ammo-ammoText', false, ammo.__importError);
                } else {
                    try {
                        // ammoText is module-internal; calculateAmmoInformation is the
                        // public caller that invokes it and writes the formatted clip
                        // string onto rollData.ammoText. Drive a usesAmmo=true weapon and
                        // assert the formatter ran (non-empty rollData.ammoText).
                        const usesRollData: FakeAmmoRollData = {
                            weapon: {
                                usesAmmo: true,
                                system: { loadedAmmo: { name: 'Probe Ammo' }, clip: { value: 5 }, effectiveClipMax: 10 },
                            },
                            action: 'Standard Attack',
                            hasAttackSpecial: () => false,
                            specialModifiers: {},
                            attackSpecials: [],
                        };
                        ammo.calculateAmmoInformation(usesRollData);
                        // usesAmmo=false short-circuits before touching ammoText / clip.
                        const noRollData: FakeAmmoRollData = {
                            weapon: { usesAmmo: false, system: { clip: { value: 0 } } },
                            action: 'Standard Attack',
                            hasAttackSpecial: () => false,
                            specialModifiers: {},
                            attackSpecials: [],
                        };
                        ammo.calculateAmmoInformation(noRollData);
                        record(
                            'ammo-ammoText',
                            typeof usesRollData.ammoText === 'string' && usesRollData.ammoText.length > 0 && noRollData.ammoText === undefined,
                            `usesAmmo=${String(usesRollData.ammoText)} noAmmo=${String(noRollData.ammoText)}`,
                        );
                    } catch (err) {
                        record('ammo-ammoText', false, err instanceof Error ? err.message : String(err));
                    }
                }
            }

            await probeWeaponRules();
            await probeConfigAndAmmo();

            return out;
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
