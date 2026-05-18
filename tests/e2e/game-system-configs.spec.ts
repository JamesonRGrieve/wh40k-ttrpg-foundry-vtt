import { recordCoverage } from './lib/coverage-tracker';
import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the GAME_SYSTEM_CONFIG_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 *
 * Tier B source-coverage spec for the per-system configuration hierarchy in
 * `src/module/config/game-systems/`. The other per-system spec
 * (`per-system-flows.spec.ts`) drives the per-system *concrete data models*
 * (chaosAlignment / corruption / originPath writes on the actor). This spec
 * is disjoint: it drives the *config classes* and the registry dispatch /
 * theme helper directly, with NO actor involvement, so the following source
 * lands under coverage:
 *
 *   - src/module/config/game-systems/index.ts
 *       (SystemConfigRegistry.get / getOrNull / getAll / getIds / has,
 *        themeClassFor — ROLE_PREFIX dispatch)
 *   - src/module/config/game-systems/base-system-config.ts
 *       (startingXP default, skillRankCount, characteristicTierOrder,
 *        getStepShortLabels, getFatePointUses, static skillLevelToRank)
 *   - src/module/config/game-systems/aptitude-based-system-config.ts
 *       (4-rank getSkillRanks, 5-tier getCharacteristicTiers, the three
 *        DH2e default cost tables, countMatchingAptitudes,
 *        getSkillAptitudes fallback, getAdvanceMatchInfo, getVisibleSkills)
 *   - src/module/config/game-systems/career-based-system-config.ts
 *       (3-rank getSkillRanks, 4-tier getCharacteristicTiers,
 *        getSkillAdvanceCost / getTalentAdvanceCost null contract,
 *        getVisibleSkills)
 *   - src/module/config/game-systems/{bc,dh1e,dh2e,dw,ow,rt,im}-config.ts
 *       (id / label / cssClass / theme blocks, getOriginStepConfig,
 *        getCharacteristicAptitudes / getSkillAptitudeTable for the
 *        aptitude systems, BC getAlignmentCostModifier opposition matrix)
 *
 * Every helper that takes a system id is iterated across ALL 7 ids so
 * per-system divergence (3- vs 4-rank, 4- vs 5-tier, theme palette refs,
 * aptitude vs career dispatch) surfaces. Per-system cross-product keys are
 * `<helper>::<systemId>`, mirroring the `method::sys` shape used by
 * `actor.roll-method` in the other specs.
 *
 * The config modules are pure (no Foundry document I/O), but they call
 * `game.i18n.localize(...)` in a couple of header / label paths, so the
 * probes run after a GM join (page in `/game`) and drive the modules via
 * dynamic ESM import of the built `dist/` bundle. Failures are collected so
 * one broken system does not mask the other six; a flow key is recorded
 * only when its sub-assertions pass (same contract as
 * `per-system-flows.spec.ts`).
 */

/** Canonical Tailwind utility prefixes per theme role (mirrors ROLE_PREFIX in index.ts). */
const ROLE_PREFIX: Record<'primary' | 'accent' | 'border', string> = {
    primary: 'tw-bg-',
    accent: 'tw-text-',
    border: 'tw-border-',
};

/** Systems whose config extends AptitudeBasedSystemConfig (4 ranks, 5 tiers, aptitude dispatch). */
const APTITUDE_SYSTEMS = ['dh2e', 'bc', 'ow', 'im'] as const;
/** Systems whose config extends CareerBasedSystemConfig (3 ranks, 4 tiers, career dispatch). */
const CAREER_SYSTEMS = ['rt', 'dh1e', 'dw'] as const;

interface ProbeResult {
    name: string;
    ok: boolean;
    detail: string;
}

test.describe.serial('game-system config registry + helpers (Tier B)', () => {
    test('SystemConfigRegistry dispatch, themeClassFor, and per-system config getters', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        let probes: ProbeResult[] = [];
        try {
            probes = await page.evaluate(
                async ({ ids, aptitudeSystems, careerSystems, rolePrefix }) => {
                    /* eslint-disable @typescript-eslint/no-explicit-any -- in-page probe: dist modules and Foundry globals are untyped at the evaluate boundary */
                    const results: { name: string; ok: boolean; detail: string }[] = [];
                    const record = (name: string, ok: boolean, detail: string): void => {
                        results.push({ name, ok, detail });
                    };

                    // Dynamic ESM import by URL — TS cannot resolve `/systems/...`
                    // at type-check time, so route through a Function-based
                    // importer that returns `unknown` and narrow on the result.
                    const importByUrl = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
                    let mod: any = null;
                    try {
                        mod = await importByUrl('/systems/wh40k-rpg/module/config/game-systems/index.js');
                    } catch (err) {
                        record('registry-get-all-systems', false, `index.js import failed: ${String((err as Error)?.message ?? err)}`);
                        return results;
                    }

                    const Registry = mod?.SystemConfigRegistry as
                        | {
                              get: (id: string) => any;
                              getOrNull: (id: string) => any;
                              getAll: () => any[];
                              getIds: () => string[];
                              has: (id: string) => boolean;
                          }
                        | undefined;
                    const themeClassFor = mod?.themeClassFor as ((id: string, role: string) => string) | undefined;

                    if (Registry === undefined || themeClassFor === undefined) {
                        record('registry-get-all-systems', false, 'index.js did not export SystemConfigRegistry / themeClassFor');
                        return results;
                    }

                    // ── registry-get-all-systems ───────────────────────────
                    // Registry.get(id) returns a config whose .id round-trips
                    // for every one of the 7 systems; getAll() / getIds() are
                    // consistent with the per-id lookups.
                    try {
                        const all = Registry.getAll();
                        const regIds = Registry.getIds();
                        const everyIdResolves = ids.every((id) => {
                            const cfg = Registry.get(id);
                            return cfg != null && cfg.id === id;
                        });
                        const countOk = all.length === ids.length && regIds.length === ids.length;
                        const idsMatch = ids.every((id) => regIds.includes(id));
                        record(
                            'registry-get-all-systems',
                            everyIdResolves && countOk && idsMatch,
                            `getAll=${all.length} getIds=${JSON.stringify(regIds)} everyIdResolves=${everyIdResolves}`,
                        );
                    } catch (err) {
                        record('registry-get-all-systems', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── registry-getOrNull-and-has ─────────────────────────
                    // getOrNull('bogus') === null and has('bogus') === false,
                    // while a known id resolves through both.
                    try {
                        const unknownNull = Registry.getOrNull('not-a-system') === null;
                        const unknownHas = Registry.has('not-a-system') === false;
                        const knownNonNull = Registry.getOrNull('dh2e') != null;
                        const knownHas = Registry.has('dh2e') === true;
                        record(
                            'registry-getOrNull-and-has',
                            unknownNull && unknownHas && knownNonNull && knownHas,
                            `unknownNull=${unknownNull} unknownHas=${unknownHas} knownNonNull=${knownNonNull} knownHas=${knownHas}`,
                        );
                    } catch (err) {
                        record('registry-getOrNull-and-has', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── themeClassFor::<id> (7 keys) ───────────────────────
                    // For each system, all three roles emit the role-prefixed
                    // utility class and the suffix matches the config.theme
                    // token (named palette ref, never raw hex).
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const theme = cfg?.theme as { primary?: string; accent?: string; border?: string } | undefined;
                            const checks: boolean[] = [];
                            const detailParts: string[] = [];
                            for (const role of ['primary', 'accent', 'border'] as const) {
                                const cls = themeClassFor(id, role);
                                const expectedPrefix = (rolePrefix as Record<string, string>)[role] ?? '';
                                const token = theme?.[role] ?? '';
                                const okPrefix = typeof cls === 'string' && cls.startsWith(expectedPrefix);
                                const okSuffix = token !== '' && cls === `${expectedPrefix}${token}`;
                                // Tokens are palette names, not hex — reject a leading '#'.
                                const noHex = typeof token === 'string' && !token.startsWith('#');
                                checks.push(okPrefix && okSuffix && noHex);
                                detailParts.push(`${role}=${cls}(token=${token})`);
                            }
                            record(`themeClassFor::${id}`, checks.every(Boolean), detailParts.join(' '));
                        } catch (err) {
                            record(`themeClassFor::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── config-identity::<id> (7 keys) ─────────────────────
                    // Each config exposes a non-empty WH40K.* label, a
                    // non-empty cssClass, and the usesAptitudes /
                    // usesCareerTables flags are mutually exclusive and match
                    // the family the system belongs to.
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const labelOk = typeof cfg?.label === 'string' && cfg.label.startsWith('WH40K.');
                            const cssOk = typeof cfg?.cssClass === 'string' && cfg.cssClass.length > 0;
                            const isAptitude = (aptitudeSystems as readonly string[]).includes(id);
                            const isCareer = (careerSystems as readonly string[]).includes(id);
                            const flagsExclusive = cfg?.usesAptitudes !== cfg?.usesCareerTables;
                            const familyOk = isAptitude
                                ? cfg?.usesAptitudes === true && cfg?.usesCareerTables === false
                                : isCareer
                                  ? cfg?.usesCareerTables === true && cfg?.usesAptitudes === false
                                  : false;
                            record(
                                `config-identity::${id}`,
                                Boolean(labelOk && cssOk && flagsExclusive && familyOk),
                                `label=${cfg?.label} css=${cfg?.cssClass} apt=${cfg?.usesAptitudes} career=${cfg?.usesCareerTables}`,
                            );
                        } catch (err) {
                            record(`config-identity::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── skill-rank-shape::<id> (7 keys) ────────────────────
                    // Aptitude systems → 4 skill ranks with bonuses
                    // [0,10,20,30]; career systems → 3 ranks with [0,10,20].
                    // skillRankCount mirrors getSkillRanks().length.
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const ranks = cfg?.getSkillRanks() as Array<{ level: number; key: string; bonus: number }>;
                            const isAptitude = (aptitudeSystems as readonly string[]).includes(id);
                            const expectedCount = isAptitude ? 4 : 3;
                            const expectedBonuses = isAptitude ? [0, 10, 20, 30] : [0, 10, 20];
                            const countOk = Array.isArray(ranks) && ranks.length === expectedCount;
                            const bonusesOk = countOk && ranks.every((r, i) => r.bonus === expectedBonuses[i]);
                            const levelsOk = countOk && ranks.every((r, i) => r.level === i + 1);
                            const countMirrors = cfg?.skillRankCount === expectedCount;
                            record(
                                `skill-rank-shape::${id}`,
                                Boolean(countOk && bonusesOk && levelsOk && countMirrors),
                                `count=${ranks?.length} bonuses=${JSON.stringify(ranks?.map((r) => r.bonus))} skillRankCount=${cfg?.skillRankCount}`,
                            );
                        } catch (err) {
                            record(`skill-rank-shape::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── characteristic-tier-shape::<id> (7 keys) ───────────
                    // Aptitude systems → 5 tiers; career systems → 4 tiers.
                    // characteristicTierOrder mirrors the keys of
                    // getCharacteristicTiers() and labels are WH40K.* keys.
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const tiers = cfg?.getCharacteristicTiers() as Array<{ key: string; label: string }>;
                            const order = cfg?.characteristicTierOrder as string[];
                            const isAptitude = (aptitudeSystems as readonly string[]).includes(id);
                            const expectedCount = isAptitude ? 5 : 4;
                            const countOk = Array.isArray(tiers) && tiers.length === expectedCount;
                            const orderOk = Array.isArray(order) && order.length === expectedCount && order.every((k, i) => k === tiers[i]?.key);
                            const labelsOk = countOk && tiers.every((t) => typeof t.label === 'string' && t.label.startsWith('WH40K.'));
                            const firstSimple = tiers?.[0]?.key === 'simple';
                            record(
                                `characteristic-tier-shape::${id}`,
                                Boolean(countOk && orderOk && labelsOk && firstSimple),
                                `count=${tiers?.length} order=${JSON.stringify(order)}`,
                            );
                        } catch (err) {
                            record(`characteristic-tier-shape::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── origin-step-config::<id> (7 keys) ──────────────────
                    // getOriginStepConfig() returns a well-formed shape:
                    // coreSteps array (each step has key/step/icon/stepIndex),
                    // optionalStep is an object or null, packs is an array.
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const osc = cfg?.getOriginStepConfig() as {
                                coreSteps?: Array<{ key?: string; step?: string; icon?: string; stepIndex?: number }>;
                                optionalStep?: unknown;
                                packs?: unknown;
                            };
                            const coreOk =
                                Array.isArray(osc?.coreSteps) &&
                                osc.coreSteps.every((s) => typeof s.key === 'string' && s.step === s.key && typeof s.icon === 'string' && typeof s.stepIndex === 'number');
                            const optOk = osc?.optionalStep === null || (typeof osc?.optionalStep === 'object' && osc.optionalStep !== null);
                            const packsOk = Array.isArray(osc?.packs);
                            record(
                                `origin-step-config::${id}`,
                                Boolean(coreOk && optOk && packsOk),
                                `coreSteps=${osc?.coreSteps?.length} optionalStep=${osc?.optionalStep === null ? 'null' : 'obj'} packs=${(osc?.packs as unknown[])?.length}`,
                            );
                        } catch (err) {
                            record(`origin-step-config::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── fate-point-uses::<id> (7 keys) ─────────────────────
                    // getFatePointUses() returns the canonical spend list:
                    // every entry has a stable key + WH40K.* label/description,
                    // and the burn-flagged 'survive' use is present.
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const uses = cfg?.getFatePointUses() as Array<{ key: string; label: string; description: string; burn?: boolean }>;
                            const shapeOk =
                                Array.isArray(uses) &&
                                uses.length > 0 &&
                                uses.every(
                                    (u) =>
                                        typeof u.key === 'string' &&
                                        u.key.length > 0 &&
                                        typeof u.label === 'string' &&
                                        u.label.startsWith('WH40K.') &&
                                        typeof u.description === 'string' &&
                                        u.description.startsWith('WH40K.'),
                                );
                            const survive = uses?.find((u) => u.key === 'survive');
                            const burnOk = survive?.burn === true;
                            record(
                                `fate-point-uses::${id}`,
                                Boolean(shapeOk && burnOk),
                                `count=${uses?.length} surviveBurn=${survive?.burn}`,
                            );
                        } catch (err) {
                            record(`fate-point-uses::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── visible-skills::<id> (7 keys) ──────────────────────
                    // getVisibleSkills() returns a non-empty Set; the
                    // aptitude-family and career-family skill lists diverge —
                    // 'parry' is aptitude-only, 'barter' is career-only.
                    for (const id of ids) {
                        try {
                            const cfg = Registry.get(id);
                            const skills = cfg?.getVisibleSkills() as Set<string>;
                            const isSet = skills instanceof Set && skills.size > 0;
                            const isAptitude = (aptitudeSystems as readonly string[]).includes(id);
                            const dodgeShared = skills?.has('dodge') === true;
                            const familyOk = isAptitude
                                ? skills?.has('parry') === true && skills?.has('barter') === false
                                : skills?.has('barter') === true && skills?.has('parry') === false;
                            record(
                                `visible-skills::${id}`,
                                Boolean(isSet && dodgeShared && familyOk),
                                `size=${skills?.size} hasParry=${skills?.has('parry')} hasBarter=${skills?.has('barter')}`,
                            );
                        } catch (err) {
                            record(`visible-skills::${id}`, false, `threw: ${String((err as Error)?.message ?? err)}`);
                        }
                    }

                    // ── aptitude-cost-tables-dh2e ──────────────────────────
                    // The DH2e config's three default cost tables pin the
                    // canonical core-rulebook values (Tables 2-2 / 2-4 / 2-6)
                    // and countMatchingAptitudes is case-insensitive.
                    try {
                        const cfg = Registry.get('dh2e');
                        const skillCost = cfg?.getSkillCostTable() as Record<number, number[]>;
                        const charCost = cfg?.getCharacteristicCostTable() as Record<number, number[]>;
                        const talentCost = cfg?.getTalentCostTable() as Record<number, Record<number, number>>;
                        const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
                        const skillOk = eq(skillCost?.[2], [100, 200, 300, 400]) && eq(skillCost?.[1], [200, 400, 600, 800]) && eq(skillCost?.[0], [300, 600, 900, 1200]);
                        const charOk =
                            eq(charCost?.[2], [100, 250, 500, 750, 1250]) && eq(charCost?.[1], [250, 500, 750, 1000, 1500]) && eq(charCost?.[0], [500, 750, 1000, 1500, 2500]);
                        const talentOk = eq(talentCost?.[1], { 2: 200, 1: 300, 0: 600 }) && eq(talentCost?.[3], { 2: 400, 1: 600, 0: 1200 });
                        const matchCI = cfg?.countMatchingAptitudes(['weapon skill', 'OFFENCE'], ['Weapon Skill', 'Offence']) === 2;
                        const matchZero = cfg?.countMatchingAptitudes(['Fellowship'], ['Weapon Skill', 'Offence']) === 0;
                        record(
                            'aptitude-cost-tables-dh2e',
                            Boolean(skillOk && charOk && talentOk && matchCI && matchZero),
                            `skillOk=${skillOk} charOk=${charOk} talentOk=${talentOk} matchCI=${matchCI}`,
                        );
                    } catch (err) {
                        record('aptitude-cost-tables-dh2e', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── aptitude-resolution-fallback ───────────────────────
                    // getSkillAptitudes returns the table pair for a known
                    // skill and falls back to ['General','General'] for an
                    // unknown one (across all 4 aptitude systems). Also pins
                    // the #150 errata: commonLore → ['Intelligence','General'].
                    try {
                        const checks: boolean[] = [];
                        const detail: string[] = [];
                        for (const id of aptitudeSystems) {
                            const cfg = Registry.get(id);
                            const known = cfg?.getSkillAptitudes('commonLore') as [string, string];
                            const unknown = cfg?.getSkillAptitudes('definitely-not-a-skill') as [string, string];
                            const charPair = cfg?.getCharacteristicAptitudes('weaponSkill') as [string, string];
                            const charFallback = cfg?.getCharacteristicAptitudes('nope') as [string, string];
                            const knownOk = JSON.stringify(known) === JSON.stringify(['Intelligence', 'General']);
                            const unknownOk = JSON.stringify(unknown) === JSON.stringify(['General', 'General']);
                            const charOk = JSON.stringify(charPair) === JSON.stringify(['Weapon Skill', 'Offence']);
                            const charFallbackOk = JSON.stringify(charFallback) === JSON.stringify(['General', 'General']);
                            checks.push(knownOk && unknownOk && charOk && charFallbackOk);
                            detail.push(`${id}:cl=${JSON.stringify(known)}`);
                        }
                        record('aptitude-resolution-fallback', checks.every(Boolean), detail.join(' '));
                    } catch (err) {
                        record('aptitude-resolution-fallback', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── advance-match-info ─────────────────────────────────
                    // getAdvanceMatchInfo splits an advance's aptitudes into
                    // matched / unmatched against the actor's set. Driven
                    // against a synthetic actor-like (no Foundry document
                    // needed — the method only reads `system.aptitudes`).
                    try {
                        const cfg = Registry.get('dh2e');
                        const actorLike = { system: { aptitudes: ['Weapon Skill', 'Offence', 'Defence'] } };
                        const info = cfg?.getAdvanceMatchInfo(actorLike, ['Weapon Skill', 'Knowledge']) as {
                            matches: number;
                            matched: string[];
                            unmatched: string[];
                            all: string[];
                        };
                        const matchesOk = info?.matches === 1;
                        const matchedOk = JSON.stringify(info?.matched) === JSON.stringify(['Weapon Skill']);
                        const unmatchedOk = JSON.stringify(info?.unmatched) === JSON.stringify(['Knowledge']);
                        const allOk = JSON.stringify(info?.all) === JSON.stringify(['Weapon Skill', 'Knowledge']);
                        record(
                            'advance-match-info',
                            Boolean(matchesOk && matchedOk && unmatchedOk && allOk),
                            `info=${JSON.stringify(info)}`,
                        );
                    } catch (err) {
                        record('advance-match-info', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── career-cost-null-contract ──────────────────────────
                    // CareerBasedSystemConfig.getSkillAdvanceCost and
                    // getTalentAdvanceCost always return null (cost is carried
                    // on the AdvanceOption from the career table), for all 3
                    // career systems.
                    try {
                        const checks: boolean[] = [];
                        const detail: string[] = [];
                        const actorLike = { system: {} };
                        for (const id of careerSystems) {
                            const cfg = Registry.get(id);
                            const skillNull = cfg?.getSkillAdvanceCost(actorLike, 'dodge', 0) === null;
                            const talentNull = cfg?.getTalentAdvanceCost(actorLike, {}) === null;
                            checks.push(Boolean(skillNull && talentNull));
                            detail.push(`${id}:skill=${cfg?.getSkillAdvanceCost(actorLike, 'dodge', 0)} talent=${cfg?.getTalentAdvanceCost(actorLike, {})}`);
                        }
                        record('career-cost-null-contract', checks.every(Boolean), detail.join(' '));
                    } catch (err) {
                        record('career-cost-null-contract', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── bc-alignment-cost-modifier ─────────────────────────
                    // BC's getAlignmentCostModifier opposition matrix:
                    // matching/unaligned-advance → 1.0, unaligned-char buying
                    // aligned → 1.5, opposed (khorne↔slaanesh) → 2.0,
                    // non-opposing different → 1.5.
                    try {
                        const cfg = Registry.get('bc');
                        const match = cfg?.getAlignmentCostModifier('khorne', 'khorne') === 1.0;
                        const advUnaligned = cfg?.getAlignmentCostModifier('khorne', 'unaligned') === 1.0;
                        const charUnaligned = cfg?.getAlignmentCostModifier('unaligned', 'khorne') === 1.5;
                        const opposed = cfg?.getAlignmentCostModifier('khorne', 'slaanesh') === 2.0;
                        const opposedRev = cfg?.getAlignmentCostModifier('nurgle', 'tzeentch') === 2.0;
                        const nonOpposing = cfg?.getAlignmentCostModifier('khorne', 'nurgle') === 1.5;
                        record(
                            'bc-alignment-cost-modifier',
                            Boolean(match && advUnaligned && charUnaligned && opposed && opposedRev && nonOpposing),
                            `match=${match} advUn=${advUnaligned} charUn=${charUnaligned} opp=${opposed} oppRev=${opposedRev} nonOpp=${nonOpposing}`,
                        );
                    } catch (err) {
                        record('bc-alignment-cost-modifier', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── skill-level-to-rank ────────────────────────────────
                    // The static BaseSystemConfig.skillLevelToRank maps both
                    // RT terminology ('plus10') and DH2e terminology
                    // ('experienced') to the shared numeric rank, and unknown
                    // strings fall back to 0.
                    try {
                        const base = mod?.BaseSystemConfig as { skillLevelToRank?: (lvl: string) => number } | undefined;
                        const fn = base?.skillLevelToRank;
                        const ok =
                            typeof fn === 'function' &&
                            fn('trained') === 1 &&
                            fn('known') === 1 &&
                            fn('plus10') === 2 &&
                            fn('experienced') === 3 &&
                            fn('plus20') === 3 &&
                            fn('veteran') === 4 &&
                            fn('plus30') === 4 &&
                            fn('garbage') === 0;
                        record('skill-level-to-rank', Boolean(ok), `fn=${typeof fn}`);
                    } catch (err) {
                        record('skill-level-to-rank', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── starting-xp-divergence ─────────────────────────────
                    // startingXP defaults to 0 on the base but DH2e and DH1e
                    // override to the canonical 1000 (regression guard for
                    // #14: DH1 must not be left at zero XP post origin-path).
                    try {
                        const dh2 = Registry.get('dh2e')?.startingXP;
                        const dh1 = Registry.get('dh1e')?.startingXP;
                        const rt = Registry.get('rt')?.startingXP;
                        const ok = dh2 === 1000 && dh1 === 1000 && typeof rt === 'number';
                        record('starting-xp-divergence', Boolean(ok), `dh2e=${dh2} dh1e=${dh1} rt=${rt}`);
                    } catch (err) {
                        record('starting-xp-divergence', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    // ── step-short-labels ──────────────────────────────────
                    // getStepShortLabels() resolves a label entry for every
                    // core step key of every system (i18n round-trip path; a
                    // missing key falls back to the step key itself, so the
                    // map is always populated for systems that have steps).
                    try {
                        const checks: boolean[] = [];
                        const detail: string[] = [];
                        for (const id of ids) {
                            const cfg = Registry.get(id);
                            const labels = cfg?.getStepShortLabels() as Record<string, string>;
                            const osc = cfg?.getOriginStepConfig() as { coreSteps?: Array<{ key: string }> };
                            const coreKeys = (osc?.coreSteps ?? []).map((s) => s.key);
                            const everyKeyLabelled =
                                labels != null && coreKeys.every((k) => typeof labels[k] === 'string' && (labels[k]?.length ?? 0) > 0);
                            checks.push(everyKeyLabelled);
                            detail.push(`${id}:${coreKeys.length}keys`);
                        }
                        record('step-short-labels', checks.every(Boolean), detail.join(' '));
                    } catch (err) {
                        record('step-short-labels', false, `threw: ${String((err as Error)?.message ?? err)}`);
                    }

                    /* eslint-enable @typescript-eslint/no-explicit-any */
                    return results;
                },
                {
                    ids: GAME_SYSTEM_IDS as unknown as string[],
                    aptitudeSystems: APTITUDE_SYSTEMS as unknown as string[],
                    careerSystems: CAREER_SYSTEMS as unknown as string[],
                    rolePrefix: ROLE_PREFIX,
                },
            );
        } finally {
            page.off('pageerror', listener);
        }

        const failures: string[] = [];
        for (const probe of probes) {
            if (probe.ok) {
                recordCoverage('game-system-config.flow', probe.name);
            } else {
                failures.push(`${probe.name}: ${probe.detail}`);
            }
        }
        if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

        expect(failures, `game-system config probe failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
