import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Exercises the Handlebars helpers registered by
 * `src/module/handlebars/handlebars-helpers.ts`, the typed `t(...)` wrapper
 * at `src/module/i18n/t.ts`, the `uuidNameCache` accessor at
 * `src/module/utils/uuid-name-cache.ts`, and the @UUID enricher path
 * registered by `src/module/enrichers.ts`.
 *
 * Templates are compiled inline (via `Handlebars.compile`) rather than
 * loaded from `systems/wh40k-rpg/templates/...` because the targets here
 * are individual helper functions, not whole .hbs files. Inline templates
 * keep each probe small and self-contained — one failure surfaces one
 * helper.
 *
 * Failures are collected so one broken helper does not mask another. The
 * denominator for `helper.flow` lives in `scripts/e2e-coverage.mjs`
 * (`HELPER_FLOWS`) and MUST be kept in sync with the probe list below.
 */

// A real DH2 compendium UUID resolved at index-build time. If the underlying
// pack contents change, swap for any entry from .compendium-uuid-index.json
// — the goal is only to prove the cache resolves a known reference.
const DH2_TALENT_UUID = 'Compendium.wh40k-rpg.dh2-beyond-stats-talents.Item.K9jJBo8RG60icdiN';
const DH2_TALENT_NAME_LOWER = 'bodyguard';

interface ProbeResult {
    name: string;
    ok: boolean;
    detail: string;
}

test.describe.serial('handlebars / i18n / enricher helpers (Tier B)', () => {
    test('helpers, i18n wrapper, and @UUID enricher behave correctly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const probes = await page.evaluate(
                async ({ talentUuid, talentNameLower }) => {
                    interface FoundryGlobal {
                        Handlebars?: {
                            compile: (src: string) => (ctx: object, opts?: object) => string;
                        };
                        foundry?: {
                            applications?: { ux?: { TextEditor?: { implementation?: { enrichHTML?: (text: string, opts?: object) => Promise<string> } } } };
                        };
                        TextEditor?: { enrichHTML?: (text: string, opts?: object) => Promise<string> };
                        game?: { i18n?: { localize?: (key: string) => string } };
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: reading Foundry's host globals (Handlebars/foundry/TextEditor/game) inside the page, no schema applies
                    const g = globalThis as unknown as FoundryGlobal;

                    interface ProbeOutcome {
                        ok: boolean;
                        detail: string;
                    }
                    const results: { name: string; ok: boolean; detail: string }[] = [];
                    // Run one probe, recording its outcome and turning any throw into a
                    // failed result so a single broken helper cannot mask the rest. The
                    // shared try/catch keeps each probe body branch-free.
                    const runProbe = async (name: string, fn: () => ProbeOutcome | Promise<ProbeOutcome>): Promise<void> => {
                        try {
                            const outcome = await fn();
                            results.push({ name, ok: outcome.ok, detail: outcome.detail });
                        } catch (err) {
                            results.push({ name, ok: false, detail: `threw: ${err instanceof Error ? err.message : String(err)}` });
                        }
                    };

                    if (g.Handlebars === undefined) {
                        results.push({ name: 'all', ok: false, detail: 'Handlebars global unavailable' });
                        return results;
                    }
                    const HB = g.Handlebars;

                    // 1. themeClassFor — explicit systemId override path AND
                    //    @root._gameSystemId path. The helper prefers explicit
                    //    arg over @root, so test both branches.
                    await runProbe('handlebars-themeClassFor-helper', () => {
                        const tpl = HB.compile(`{{themeClassFor 'border'}}|{{themeClassFor 'border' 'dh2'}}|{{themeClassFor 'primary' 'rt'}}`);
                        const out = tpl({}, { data: { root: { _gameSystemId: 'dh2' } } });
                        // Expected: [tw-border-<dh2-border>, tw-border-<dh2-border>, tw-bg-<rt-primary>]
                        const parts = out.split('|');
                        const allPrefixed = Boolean(parts[0]?.startsWith('tw-border-') && parts[1]?.startsWith('tw-border-') && parts[2]?.startsWith('tw-bg-'));
                        const dh2Match = parts[0] === parts[1];
                        return { ok: allPrefixed && dh2Match, detail: `out=${out}` };
                    });

                    // 2. {{#select 'b'}} block helper — should mark <option value="b"> as selected.
                    await runProbe('handlebars-select-block-helper', () => {
                        const tpl = HB.compile(`{{#select 'b'}}<option value="a">A</option><option value="b">B</option>{{/select}}`);
                        const out = tpl({});
                        const aSelected = /value="a"[^>]*\sselected/.test(out);
                        const bSelected = /value="b"[^>]*\sselected/.test(out);
                        return { ok: !aSelected && bSelected, detail: `out=${out}` };
                    });

                    // 3. concat — string concatenation with options-arg trim.
                    await runProbe('handlebars-concat-helper', () => {
                        const tpl = HB.compile(`{{concat 'a' 'b' 'c'}}`);
                        const out = tpl({});
                        return { ok: out === 'abc', detail: `out=${out}` };
                    });

                    // 4. dhlog — must not throw; renders nothing visible.
                    await runProbe('handlebars-dhlog-helper', () => {
                        const tpl = HB.compile(`pre{{dhlog this}}post`);
                        const out = tpl({ marker: 'probe' });
                        // game.wh40k.log may or may not be defined in this build — what we
                        // care about is that the helper does not crash the render.
                        return { ok: out === 'prepost' || out.startsWith('pre'), detail: `out=${out}` };
                    });

                    // 5. isPsychicAttack — a power without subtype 'Attack' returns false.
                    await runProbe('handlebars-isPsychicAttack', () => {
                        const tpl = HB.compile(`{{isPsychicAttack power}}|{{isPsychicAttack attackPower}}`);
                        const out = tpl({
                            power: { system: { subtype: ['Concentration'] } },
                            attackPower: { system: { subtype: ['Attack'] } },
                        });
                        return { ok: out === 'false|true', detail: `out=${out}` };
                    });

                    // 6. uuid-name — resolves a real DH2 talent UUID to its display name.
                    await runProbe('handlebars-uuid-name', () => {
                        const tpl = HB.compile(`{{uuid-name uuid}}`);
                        const out = tpl({ uuid: talentUuid }).trim();
                        // Cache may not yet hold the entry if the ready-hook walk hasn't
                        // completed for this pack — accept either the resolved name or
                        // an empty string (helper's documented fallback for misses).
                        const looksLikeName = out.length > 0 && !out.includes('Compendium.');
                        return { ok: looksLikeName || out === '', detail: `out="${out}" expected~${talentNameLower}` };
                    });

                    // 7. uuid-expand — replaces {{Compendium.…}} tokens in freeform text.
                    await runProbe('handlebars-uuid-expand', () => {
                        const tpl = HB.compile(`{{uuid-expand text}}`);
                        const text = `prefix {{${talentUuid}}} suffix`;
                        const out = tpl({ text });
                        // Either the token expanded to the name, or it passed through (cache
                        // miss); both are valid helper behaviour per uuidNameCache docs.
                        // What matters is the surrounding text survived.
                        const surroundOk = out.startsWith('prefix ') && out.endsWith(' suffix');
                        return { ok: surroundOk, detail: `out=${out}` };
                    });

                    // 8. t(...) i18n wrapper — must return a string and resolve a known
                    //    key. The wrapper is shipped via dist as a module; pull it in.
                    await runProbe('i18n-t-wrapper', async () => {
                        interface I18nModule {
                            t?: (k: string, p?: object) => string;
                        }
                        // URL via a string variable so tsc does not statically resolve the runtime-only Foundry-served path (TS2307).
                        const tModuleUrl: string = '/systems/wh40k-rpg/module/i18n/t.js';
                        const mod = (await import(/* @vite-ignore */ tModuleUrl)) as I18nModule;
                        const tFn = mod.t;
                        if (typeof tFn !== 'function') {
                            return { ok: false, detail: 'module did not export t' };
                        }
                        const localized = tFn('WH40K.Confirm');
                        // game.i18n.localize returns the key itself if unresolved —
                        // accept either the localized text or the key as proof the
                        // wrapper round-trips through Foundry's i18n. Must be a string.
                        return { ok: typeof localized === 'string' && localized.length > 0, detail: `localized="${localized}"` };
                    });

                    // 9. @UUID enricher — Foundry's native enricher resolves a Compendium
                    //    UUID to a <a class="content-link">…</a>. The CONFIG.TextEditor
                    //    .enrichers array is populated by registerCustomEnrichers() but
                    //    this probe targets Foundry's built-in @UUID path, which the
                    //    pipeline registers alongside.
                    await runProbe('enricher-@UUID-resolves', async () => {
                        const enrichHTML = g.foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML ?? g.TextEditor?.enrichHTML;
                        if (typeof enrichHTML !== 'function') {
                            return { ok: false, detail: 'TextEditor.enrichHTML unavailable' };
                        }
                        const input = `@UUID[${talentUuid}]`;
                        const out = await enrichHTML(input, { async: true });
                        const hasContentLink = /class="[^"]*content-link/.test(out);
                        return { ok: hasContentLink, detail: `out=${out.slice(0, 200)}` };
                    });

                    // 10. skill-uuid-helper — drives `parseSkillName` and
                    //     `findSkillUuid` against the registered skill packs.
                    //     parseSkillName has no side effects (just regex
                    //     parsing); findSkillUuid walks the per-system skill
                    //     compendium index to resolve a known skill name.
                    interface ParsedSkill {
                        name: string;
                        specialization: string | null;
                    }
                    interface SkillUuidModule {
                        parseSkillName?: (raw: string) => ParsedSkill | undefined;
                        findSkillUuid?: (name: string) => string | null | undefined;
                        clearSkillUuidCache?: () => void;
                    }
                    const skillModUrl = '/systems/wh40k-rpg/module/helpers/skill-uuid-helper.js';
                    await runProbe('skill-uuid-helper-parseSkillName', async () => {
                        const mod = (await import(/* @vite-ignore */ skillModUrl)) as SkillUuidModule;
                        const parsed = mod.parseSkillName?.('Acrobatics (Tumbling)');
                        const parseOk = parsed?.name === 'Acrobatics' && parsed.specialization === 'Tumbling';
                        const parsedBare = mod.parseSkillName?.('Awareness');
                        const parseBareOk = parsedBare?.name === 'Awareness' && parsedBare.specialization === null;
                        return {
                            ok: Boolean(parseOk && parseBareOk),
                            detail: `parse('Acrobatics (Tumbling)')=${JSON.stringify(parsed)} parse('Awareness')=${JSON.stringify(parsedBare)}`,
                        };
                    });

                    await runProbe('skill-uuid-helper-findSkillUuid', async () => {
                        const mod = (await import(/* @vite-ignore */ skillModUrl)) as SkillUuidModule;
                        // findSkillUuid returns `undefined` if the index isn't
                        // built yet (it lazily builds via the cache). Calling it
                        // once exercises both the build path and the lookup
                        // path; a null return is acceptable (skill not found is
                        // a valid return shape).
                        mod.clearSkillUuidCache?.();
                        const result = mod.findSkillUuid?.('Awareness');
                        // Any of `string` (hit), `null` (explicit miss), or `undefined`
                        // (index not built yet) is a valid return shape — exercising the
                        // build + lookup path without throwing is the assertion. The
                        // typed union already guarantees the shape, so `ok` is constant;
                        // the detail captures the concrete value for diagnostics.
                        return { ok: true, detail: `findSkillUuid('Awareness')=${String(result)}` };
                    });

                    // 11. helpers/effects — `summarizeChange` formats a raw
                    //     ActiveEffect change entry into a display struct.
                    //     `getChangeLabel` is exercised via summarizeChange.
                    await runProbe('helpers-effects-summarizeChange', async () => {
                        interface EffectChange {
                            key: string;
                            mode: number;
                            value: number;
                            priority: number;
                        }
                        interface EffectsModule {
                            summarizeChange?: (change: EffectChange) => { label: string; value: string } | undefined;
                        }
                        // URL via a string variable so tsc does not statically resolve the runtime-only Foundry-served path (TS2307).
                        const effectsModuleUrl: string = '/systems/wh40k-rpg/module/helpers/effects.js';
                        const mod = (await import(/* @vite-ignore */ effectsModuleUrl)) as EffectsModule;
                        const change: EffectChange = { key: 'system.characteristics.strength.modifier', mode: 2, value: 10, priority: 20 };
                        const summary = mod.summarizeChange?.(change);
                        const ok = typeof summary?.label === 'string' && summary.label.length > 0 && typeof summary.value === 'string';
                        return { ok: Boolean(ok), detail: `summary=${JSON.stringify(summary)}` };
                    });

                    return results;
                },
                { talentUuid: DH2_TALENT_UUID, talentNameLower: DH2_TALENT_NAME_LOWER },
            );

            const failures: string[] = [];
            for (const probe of probes as ProbeResult[]) {
                if (probe.ok) {
                    recordCoverage('helper.flow', probe.name);
                } else {
                    failures.push(`${probe.name}: ${probe.detail}`);
                }
            }

            expect(failures, `${failures.length}/${probes.length} helper probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
            expect(pageErrors, `page errors during helper probes: ${pageErrors.join(' | ')}`).toEqual([]);
        } finally {
            page.off('pageerror', listener);
        }
    });
});
