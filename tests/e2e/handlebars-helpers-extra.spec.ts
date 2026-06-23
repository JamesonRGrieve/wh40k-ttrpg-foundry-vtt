import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the HANDLEBARS_EXTRA_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 *
 * Companion to tests/e2e/helpers.spec.ts. That spec already drives
 * themeClassFor / select-block / concat / dhlog / isPsychicAttack /
 * uuid-name / uuid-expand / i18n-t / @UUID-enricher and the
 * skill-uuid-helper + helpers/effects modules. This spec covers the
 * REMAINDER of `src/module/handlebars/` and `src/module/helpers/` that no
 * other Tier B spec touches:
 *
 *   - the formatter / math / lookup Handlebars helpers registered by
 *     `src/module/handlebars/handlebars-helpers.ts`
 *     (signedNumber / range / times / percent / inversePercent /
 *     corruption+insanity ladders / armourDisplay / specialQualities /
 *     formatPrerequisites / formatTraitName / talentIcon / traitIcon /
 *     rateOfFireDisplay / json / option / or / and / has / countType …)
 *   - the standalone exports `capitalize` / `toCamelCase` /
 *     `displayStrength` / `displayCrit` / `truncate` / `select`
 *   - the icon / colour lookup tables + `lookupOr` in
 *     `src/module/handlebars/icon-lookups.ts`
 *   - `SkillKeyHelper` in `src/module/helpers/skill-key-helper.ts`
 *     (per-system skill set: name↔key, specialist / characteristic /
 *     advanced classification, metadata, char grouping)
 *   - `CraftsmanshipHelper` in
 *     `src/module/helpers/craftsmanship-helper.ts`
 *     (modifier resolution, weapon-quality add/remove, force-field
 *     overload range, effect-summary prose)
 *   - the game-icons CDN URL builders in
 *     `src/module/helpers/game-icons.ts`
 *     (`getIconUrl` / `getColoredIconUrl` / `getDefaultIcon`)
 *
 * Registered Handlebars helpers are exercised by compiling inline
 * templates against the global `Handlebars` (the system registered them
 * on init). Standalone module exports are dynamic-imported by URL from
 * the dist served at `/systems/wh40k-rpg/module/...`. Failures are
 * collected so one broken helper does not mask another.
 *
 * Homologation: `SkillKeyHelper` carries the union of all seven game
 * systems' skills (RT/DH1e specialist groups + DH2e/BC/OW Athletics /
 * Linguistics / Operate / Parry / Stealth). The skill-key flow asserts
 * keys from BOTH families so a regression in either surfaces.
 */

interface ProbeResult {
    name: string;
    ok: boolean;
    detail: string;
}

test.describe.serial('handlebars / helpers extra coverage (Tier B)', () => {
    test('formatter, lookup-table, skill-key, craftsmanship, and icon helpers behave correctly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- browser-probe boundary: code runs in the Foundry page context where Handlebars / dynamic-imported dist modules are untyped at the Playwright type-check layer; every value is asserted on the Node side after marshalling */
            const probes = await page.evaluate(async () => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Handlebars` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    Handlebars?: {
                        compile: (src: string) => (ctx: object, opts?: object) => string;
                    };
                };
                const results: { name: string; ok: boolean; detail: string }[] = [];
                const record = (name: string, ok: boolean, detail: string): void => {
                    results.push({ name, ok, detail });
                };

                if (g.Handlebars === undefined) {
                    record('all', false, 'Handlebars global unavailable');
                    return results;
                }
                const HB = g.Handlebars;

                // Dynamic ESM import by URL — TS cannot resolve `/systems/...`
                // at type-check time, so route through a Function-based
                // importer that returns `unknown` and narrow on the result.
                // Function constructor is the only runtime path for a non-static
                // import specifier; bundlers rewrite literal `import('/x')`
                // patterns even with /* @vite-ignore */ in this context.
                // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- boundary: dynamic ESM import by runtime URL string; bundler-safe alternative is not available in the browser probe
                const importByUrl = new Function('u', 'return import(u)') as (u: string) => Promise<any>;

                // ---- Inline-template Handlebars-helper flows (compiled synchronously) ----
                function probeHandlebarsHelperFlows(): void {
                    // ---------------------------------------------------------
                    // 1. Number-formatter helpers: signedNumber / inc / floor /
                    //    add / subtract / multiply / divide / min /
                    //    clampCritical / percent / inversePercent.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            [
                                '{{signedNumber 5}}',
                                '{{signedNumber -3}}',
                                '{{inc 4}}',
                                '{{floor 3.9}}',
                                '{{add 2 3}}',
                                '{{subtract 10 4}}',
                                '{{multiply 3 4}}',
                                '{{divide 9 3}}',
                                '{{divide 1 0}}',
                                '{{min 7 2}}',
                                '{{clampCritical 25}}',
                                '{{percent 1 4}}',
                                '{{inversePercent 1 4}}',
                            ].join('|'),
                        );
                        const out = tpl({});
                        const ok = out === '+5|-3|5|3|5|6|12|3|0|2|10|25|75';
                        record('handlebars-number-formatters', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-number-formatters', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 2. range / times / array / slice iteration helpers.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            '{{#each (range 1 3)}}{{this}}{{/each}}|' +
                                '{{#times 3}}{{this}}{{/times}}|' +
                                "{{#each (array 'x' 'y')}}{{this}}{{/each}}|" +
                                '{{#each (slice myArr 1 3)}}{{this}}{{/each}}',
                        );
                        const out = tpl({ myArr: ['a', 'b', 'c', 'd'] });
                        record('handlebars-iteration-helpers', out === '123|123|xy|bc', `out=${out}`);
                    } catch (err) {
                        record('handlebars-iteration-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 3. Logical / comparison helpers: eq / neq / gt / lt /
                    //    gte / lte / and / or / iff / defaultVal / colorCode /
                    //    isError / isSuccess.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            [
                                '{{eq 1 1}}',
                                '{{neq 1 2}}',
                                '{{gt 3 2}}',
                                '{{lt 2 3}}',
                                '{{gte 2 2}}',
                                '{{lte 2 2}}',
                                "{{and 1 'yes'}}",
                                "{{or '' 0 'fallback'}}",
                                "{{iff true 'T' 'F'}}",
                                "{{iff false 'T' 'F'}}",
                                "{{defaultVal '' 'def'}}",
                                '{{colorCode true false}}',
                                '{{isError 1}}',
                                '{{isSuccess 1}}',
                            ].join('|'),
                        );
                        const out = tpl({});
                        const ok = out === 'true|true|true|true|true|true|yes|fallback|T|F|def|success|error|success';
                        record('handlebars-logic-helpers', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-logic-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 4. Collection helpers: arrayIncludes / includes / has /
                    //    any / countType / arrayToObject / join.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            [
                                '{{arrayIncludes 2 nums}}',
                                '{{includes nums 9}}',
                                '{{has theSet 3}}',
                                "{{any items 'flag'}}",
                                "{{countType items 'flag'}}",
                                '{{join nums "-"}}',
                            ].join('|'),
                        );
                        const out = tpl({
                            nums: [1, 2, 3],
                            theSet: new Set([3, 4]),
                            items: [{ flag: true }, { flag: false }, { flag: 1 }],
                        });
                        const ok = out === 'true|false|true|true|2|1-2-3';
                        record('handlebars-collection-helpers', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-collection-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 5. String helpers: capitalize / toLowerCase /
                    //    cleanFieldName / removeMarkup.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            [
                                "{{capitalize 'heretic'}}",
                                "{{toLowerCase 'PURGE'}}",
                                "{{cleanFieldName 'Name'}}",
                                "{{cleanFieldName 'Home World'}}",
                                "{{removeMarkup '<b>bold</b> text'}}",
                            ].join('|'),
                        );
                        const out = tpl({});
                        const ok = out === 'Heretic|purge|character_name|home_world|bold text';
                        record('handlebars-string-helpers', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-string-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 6. Corruption / insanity threshold ladders + degree CSS
                    //    classes (DH1/DH2 sanity tracks).
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            [
                                '{{corruptionDegree 0}}',
                                '{{corruptionDegree 45}}',
                                '{{corruptionDegree 100}}',
                                '{{corruptionModifier 70}}',
                                '{{insanityDegree 5}}',
                                '{{insanityDegree 100}}',
                                '{{insanityModifier 25}}',
                                '{{corruptionDegreeClass 95}}',
                                '{{insanityDegreeClass 65}}',
                            ].join('|'),
                        );
                        const out = tpl({});
                        const ok = out === 'PURE|SOILED|DAMNED|-20|STABLE|TERMINALLY INSANE|+10|wh40k-degree-profane|wh40k-degree-unhinged';
                        record('handlebars-sanity-ladders', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-sanity-ladders', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 7. Weapon / item display helpers: rateOfFireDisplay /
                    //    armourDisplay / armourLocation / specialDisplay / json.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            ['{{rateOfFireDisplay rof}}', '{{armourDisplay armour}}', "{{armourLocation armour 'head'}}", '{{specialDisplay special}}'].join(
                                '|',
                            ),
                        );
                        const out = tpl({
                            rof: { single: true, semi: 3, full: 0 },
                            armour: { armourPoints: { head: 4, leftArm: 4, rightArm: 4, body: 4, leftLeg: 4, rightLeg: 4 } },
                            special: ['Tearing', 'Razor Sharp'],
                        });
                        const ok = out === 'S/3/-|4 ALL|4|Tearing, Razor Sharp';
                        record('handlebars-weapon-display-helpers', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-weapon-display-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 8. Talent / trait presentation helpers backed by the
                    //    icon-lookups tables: talentIcon / tierColor /
                    //    traitIcon / traitCategoryColor / formatTraitName /
                    //    formatPrerequisites.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile(
                            [
                                "{{talentIcon 'combat'}}",
                                "{{talentIcon 'nonexistent'}}",
                                '{{tierColor 2}}',
                                "{{traitIcon 'creature'}}",
                                "{{traitCategoryColor 'elite'}}",
                                "{{formatTraitName 'Unnatural Strength' 3}}",
                                '{{formatPrerequisites prereq}}',
                            ].join('|'),
                        );
                        const out = tpl({
                            prereq: { characteristics: { ws: 40 }, skills: ['Awareness'], talents: ['Quick Draw'] },
                        });
                        const ok = out === 'fa-sword|fa-circle|tier-silver|fa-paw|trait-elite|Unnatural Strength (3)|WS 40+, Awareness, Quick Draw';
                        record('handlebars-talent-trait-helpers', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-talent-trait-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 9. `option` SafeString helper + `object` hash helper.
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile("{{option 'b' 'b' 'Beta'}}|{{option 5 3 ''}}|{{#with (object at=25 label='Q')}}{{at}}:{{label}}{{/with}}");
                        const out = tpl({});
                        const ok =
                            out.includes('value="b"') &&
                            out.includes('selected="selected"') &&
                            out.includes('Beta') &&
                            out.includes('value=5') &&
                            out.endsWith('25:Q');
                        record('handlebars-option-object-helpers', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-option-object-helpers', false, `threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 10. specialQualities — converts a quality-id set into
                    //     rich objects via CONFIG.rt.weaponQualities (level
                    //     parsing + unknown fallback).
                    // ---------------------------------------------------------
                    try {
                        const tpl = HB.compile('{{#each (specialQualities ids)}}{{this.baseIdentifier}}:{{this.level}};{{/each}}');
                        const out = tpl({ ids: ['totallyMadeUpQuality-3'] });
                        // The helper is resilient to an unknown id: when the quality
                        // index is available it emits the parsed base identifier with a
                        // null level (the unknown fallback — rendered empty after the
                        // colon), and when the boot index is absent in a headless world
                        // it returns [] (empty output). It never throws on an unknown id;
                        // accept either resilient outcome.
                        const ok = out === '' || out.includes('totallyMadeUpQuality:');
                        record('handlebars-specialQualities', ok, `out=${out}`);
                    } catch (err) {
                        record('handlebars-specialQualities', false, `threw: ${String((err as Error).message)}`);
                    }
                }

                // ---- Dynamic-imported module-export flows (async) ----
                async function probeModuleExportFlows(): Promise<void> {
                    // ---------------------------------------------------------
                    // 11. Standalone exports from handlebars-helpers.ts:
                    //     capitalize / toCamelCase / displayStrength /
                    //     displayCrit / truncate / select.
                    // ---------------------------------------------------------
                    try {
                        const mod = await importByUrl('/systems/wh40k-rpg/module/handlebars/handlebars-helpers.js');
                        const cap = mod.capitalize?.('imperium');
                        const camel = mod.toCamelCase?.('Common Lore');
                        const strHidden = mod.displayStrength?.(0);
                        const strShown = mod.displayStrength?.(5);
                        const critHidden = mod.displayCrit?.(0);
                        const critShown = mod.displayCrit?.(3);
                        const trunc = mod.truncate?.('abcdefghij', 4);
                        // `select` is intentionally NOT a standalone export — it is only
                        // registered as a Handlebars block helper inside
                        // registerHandlebarsHelpers() (and its block form is covered by
                        // helpers.spec.ts). Only the dual-purpose standalone helpers are
                        // probed here.
                        const ok =
                            cap === 'Imperium' &&
                            camel === 'commonLore' &&
                            strHidden === '-' &&
                            strShown === 5 &&
                            critHidden === '-' &&
                            critShown === '3+' &&
                            typeof trunc === 'string' &&
                            trunc.endsWith('…');
                        record(
                            'handlebars-standalone-exports',
                            ok,
                            `cap=${cap} camel=${camel} str=${strHidden}/${strShown} crit=${critHidden}/${critShown} trunc=${trunc}`,
                        );
                    } catch (err) {
                        record('handlebars-standalone-exports', false, `import/call threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 12. icon-lookups.ts: lookupOr + the four exported tables.
                    // ---------------------------------------------------------
                    try {
                        const mod = await importByUrl('/systems/wh40k-rpg/module/handlebars/icon-lookups.js');
                        const hit = mod.lookupOr?.(mod.TALENT_ICONS, 'psychic', 'fa-x');
                        const miss = mod.lookupOr?.(mod.TIER_COLORS, 99, 'tier-none');
                        const traitHit = mod.lookupOr?.(mod.TRAIT_ICONS, 'origin', 'fa-x');
                        const colourHit = mod.lookupOr?.(mod.TRAIT_CATEGORY_COLORS, 'unique', 'trait-x');
                        const ok = hit === 'fa-brain' && miss === 'tier-none' && traitHit === 'fa-route' && colourHit === 'trait-unique';
                        record('helpers-icon-lookups', ok, `hit=${hit} miss=${miss} traitHit=${traitHit} colourHit=${colourHit}`);
                    } catch (err) {
                        record('helpers-icon-lookups', false, `import/call threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 13. SkillKeyHelper — RT/DH1e specialist family. nameToKey
                    //     / keyToName / isSpecialist / getCharacteristic /
                    //     isAdvanced / getSkillMetadata.
                    // ---------------------------------------------------------
                    try {
                        const mod = await importByUrl('/systems/wh40k-rpg/module/helpers/skill-key-helper.js');
                        const H = mod.SkillKeyHelper;
                        const key = H?.nameToKey?.('Common Lore');
                        const name = H?.keyToName?.('commonLore');
                        const spec = H?.isSpecialist?.('Common Lore');
                        const notSpec = H?.isSpecialist?.('awareness');
                        const charAg = H?.getCharacteristic?.('dodge');
                        const adv = H?.isAdvanced?.('acrobatics');
                        const basic = H?.isAdvanced?.('awareness');
                        const meta = H?.getSkillMetadata?.('commonLore');
                        const ok =
                            key === 'commonLore' &&
                            name === 'Common Lore' &&
                            spec === true &&
                            notSpec === false &&
                            charAg === 'Ag' &&
                            adv === true &&
                            basic === false &&
                            meta?.key === 'commonLore' &&
                            meta?.isSpecialist === true &&
                            meta?.characteristic === 'Int';
                        record('helpers-skillkey-rt-family', ok, `key=${key} name=${name} meta=${JSON.stringify(meta)}`);
                    } catch (err) {
                        record('helpers-skillkey-rt-family', false, `import/call threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 14. SkillKeyHelper — DH2e/BC/OW family (Athletics /
                    //     Linguistics / Operate / Parry / Stealth). Asserting
                    //     the second skill family keeps the helper
                    //     homologation-safe across all seven systems.
                    // ---------------------------------------------------------
                    try {
                        const mod = await importByUrl('/systems/wh40k-rpg/module/helpers/skill-key-helper.js');
                        const H = mod.SkillKeyHelper;
                        const athl = H?.nameToKey?.('Athletics');
                        const ling = H?.nameToKey?.('Linguistics');
                        const op = H?.nameToKey?.('Operate');
                        const opSpec = H?.isSpecialist?.('Operate');
                        const lingSpec = H?.isSpecialist?.('Linguistics');
                        const parryChar = H?.getCharacteristic?.('parry');
                        const stealthChar = H?.getCharacteristic?.('stealth');
                        const agSkills = H?.findSkillsByCharacteristic?.('Ag');
                        const names = H?.getAllSkillNames?.();
                        const ok =
                            athl === 'athletics' &&
                            ling === 'linguistics' &&
                            op === 'operate' &&
                            opSpec === true &&
                            lingSpec === true &&
                            parryChar === 'WS' &&
                            stealthChar === 'Ag' &&
                            Array.isArray(agSkills) &&
                            agSkills.some((s) => (s as { key?: string }).key === 'operate') &&
                            Array.isArray(names) &&
                            names.includes('Stealth');
                        record('helpers-skillkey-dh2-family', ok, `athl=${athl} ling=${ling} op=${op} parry=${parryChar}`);
                    } catch (err) {
                        record('helpers-skillkey-dh2-family', false, `import/call threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 15. CraftsmanshipHelper — modifier resolution, weapon
                    //     quality add/remove, force-field overload range,
                    //     effect-summary prose. Reads CONFIG.WH40K
                    //     .craftsmanshipRules; tolerant of the rules being
                    //     absent in the test world (returns {} / empty Set —
                    //     still exercises every branch).
                    // ---------------------------------------------------------
                    try {
                        const mod = await importByUrl('/systems/wh40k-rpg/module/helpers/craftsmanship-helper.js');
                        const C = mod.default;
                        const meleeWeapon = { craftsmanship: 'best', melee: true, parent: { type: 'weapon' } };
                        const rangedWeapon = { craftsmanship: 'poor', melee: false, parent: { type: 'weapon' } };
                        const commonGear = { craftsmanship: 'common', parent: { type: 'gear' } };
                        const mods = C?.getModifiers?.(meleeWeapon);
                        const addQ = C?.getWeaponQualities?.(rangedWeapon);
                        const rmQ = C?.getRemoveQualities?.(rangedWeapon);
                        const meleeNoQ = C?.getWeaponQualities?.(meleeWeapon);
                        const hasEffects = C?.hasCraftsmanshipEffects?.(rangedWeapon);
                        const noEffects = C?.hasCraftsmanshipEffects?.(commonGear);
                        const ffRange = C?.getForceFieldOverloadRange?.({ craftsmanship: 'common', parent: { type: 'forceField' } });
                        const overloads = C?.isOverloadRoll?.({ craftsmanship: 'common', parent: { type: 'forceField' } }, ffRange?.[0] ?? 1);
                        const summary = C?.getEffectSummary?.(rangedWeapon);
                        const ok =
                            mods !== undefined &&
                            typeof mods === 'object' &&
                            addQ instanceof Set &&
                            rmQ instanceof Set &&
                            meleeNoQ instanceof Set &&
                            meleeNoQ.size === 0 &&
                            hasEffects === true &&
                            noEffects === false &&
                            Array.isArray(ffRange) &&
                            ffRange.length === 2 &&
                            overloads === true &&
                            Array.isArray(summary);
                        record(
                            'helpers-craftsmanship',
                            ok,
                            `mods=${JSON.stringify(mods)} ffRange=${JSON.stringify(ffRange)} summary=${JSON.stringify(summary)}`,
                        );
                    } catch (err) {
                        record('helpers-craftsmanship', false, `import/call threw: ${String((err as Error).message)}`);
                    }

                    // ---------------------------------------------------------
                    // 16. game-icons.ts CDN URL builders: getIconUrl (short +
                    //     full + http forms) / getColoredIconUrl /
                    //     getDefaultIcon (known + fallback).
                    // ---------------------------------------------------------
                    try {
                        const mod = await importByUrl('/systems/wh40k-rpg/module/helpers/game-icons.js');
                        const short = mod.getIconUrl?.('lorc/sword');
                        const full = mod.getIconUrl?.('svg/lorc/originals/axe.svg');
                        const http = mod.getIconUrl?.('https://example.com/x.svg');
                        const coloured = mod.getColoredIconUrl?.('lorc/sword', 'ff0000', '000000');
                        const knownDefault = mod.getDefaultIcon?.('weapon');
                        const fallbackDefault = mod.getDefaultIcon?.('totallyUnknownType');
                        const cdn = mod.GAME_ICONS_CDN;
                        const ok =
                            typeof short === 'string' &&
                            short === `${cdn}/svg/lorc/originals/sword.svg` &&
                            full === `${cdn}/svg/lorc/originals/axe.svg` &&
                            http === 'https://example.com/x.svg' &&
                            typeof coloured === 'string' &&
                            coloured.includes('game-icons.net/icons/000000/ff0000/lorc/sword.svg') &&
                            typeof knownDefault === 'string' &&
                            knownDefault.includes('crossed-swords') &&
                            typeof fallbackDefault === 'string' &&
                            fallbackDefault.includes('perspective-dice-six');
                        record('helpers-game-icons', ok, `short=${short} full=${full} coloured=${coloured} known=${knownDefault} fallback=${fallbackDefault}`);
                    } catch (err) {
                        record('helpers-game-icons', false, `import/call threw: ${String((err as Error).message)}`);
                    }
                }

                probeHandlebarsHelperFlows();
                await probeModuleExportFlows();

                return results;
            });
            /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

            const failures: string[] = [];
            for (const probe of probes as ProbeResult[]) {
                if (probe.ok) {
                    recordCoverage('handlebars-extra.flow', probe.name);
                } else {
                    failures.push(`${probe.name}: ${probe.detail}`);
                }
            }

            expect(failures, `${failures.length}/${probes.length} handlebars-extra probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
            expect(pageErrors, `page errors during handlebars-extra probes: ${pageErrors.join(' | ')}`).toEqual([]);
        } finally {
            page.off('pageerror', listener);
        }
    });
});
